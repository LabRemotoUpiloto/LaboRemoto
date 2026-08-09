# Plan de implementación — NVR Shinobi para LaboRemoto

Estado: borrador aprobado en conversación (2026-08-05).
Decisiones ya tomadas:

- **Shinobi corre centralizado** en la Raspberry "pública" (accesible desde cualquier red). Sirve de NVR para todas las Pis/Jetsons de práctica.
- **Reemplaza por completo** a `multicam.service` + MediaMTX (se retira HLS local, WHEP/WebRTC y el port-forward SSH de video).
- El cliente Tauri consume Shinobi **por API HTTP directa**, en un módulo nuevo separado de `cmd/streaming`.
- Convención de identidad: **1 dispositivo de práctica = 1 Group** de Shinobi (Group Key = ID estable del dispositivo), **1 cámara física = 1 Monitor**.

---

## Fase 0 — Preparación (sin código)

1. Inventario: listar dispositivos de práctica y cámaras por dispositivo (id, tipo: USB/CSI/RTSP-Reolink, resolución).
2. Definir el **Group Key** por dispositivo (ej. `pi-lab-01`, `jetson-lab-02`). Debe coincidir con el identificador que el backend de reservas ya usa para asignar prácticas.
3. Red del NVR central: abrir/verificar puertos
   - `8080/tcp` — web + API + HLS de Shinobi
   - `1935/tcp` — ingesta RTMP desde los edges
4. Dimensionar almacenamiento de grabaciones (disco USB/SSD en la Pi central; Mongo + videos NO en la SD).

**Criterio de salida:** tabla dispositivo→group→cámaras→monitor-id acordada; NVR alcanzable en ambos puertos desde una red externa.

## Fase 1 — Despliegue de Shinobi central ✅ COMPLETADA (2026-08-05)

**Ejecutada por SSH directo contra la Pi central (`200.115.181.211:9000`).
Detalle completo, comandos reales y gotchas encontrados en
`infra/shinobi/README.md` — lo de abajo es el resumen.**

Desviación importante respecto al plan original: **no se usó Docker**. La
imagen `shinobisystems/shinobi` en Docker Hub es amd64-only y la Pi central
resultó ser `armv7l` (32-bit). Además la Pi ya tenía 8080/1935 ocupados por
`shellinaboxd`/`mediamtx` (es la misma Pi que ya corre el sistema de cámaras
actual, no una máquina limpia). Se optó por **instalación nativa** (Node 18
+ PM2 + MariaDB directo en el SO) — ver `infra/shinobi/README.md` para los
comandos exactos y por qué.

Puertos reales (no los del plan original): **8082** web/API/HLS, **1936**
RTMP.

1. ~~`docker-compose.yml` en la Pi central~~ → instalación nativa. El
   `docker-compose.yml` se conserva en `infra/shinobi/` como referencia para
   un futuro host amd64/arm64 dedicado, no se usó aquí.
2. Superusuario propio creado (no el default `admin@shinobi.video`/`admin`).
   Cuenta de operación + Group (`pilabpiloto`) + API key creados.
3. Group de prueba creado: `pilabpiloto` (Shinobi normaliza el Group Key
   quitando guiones/símbolos — anotar esto en la convención de nombres de la
   Fase 0 antes del rollout real).
4. Monitor de prueba `Camara1` en modo **Watch-Only** (no Record todavía —
   grabación continua queda pendiente de decidir almacenamiento, ver
   checklist) conectado directo a una cámara Reolink real por RTSP (no RTMP
   push — el push desde edges es justamente el trabajo de la Fase 2).
5. Verificado: `http://<nvr>:8082/<apiKey>/hls/pilabpiloto/Camara1/s.m3u8`
   responde manifest HLS válido. Encontrado y resuelto un bug no obvio de
   permisos de API key ("Treated as Sub-Account") — documentado en
   `infra/shinobi/README.md` para no repetir la depuración.

**Criterio de salida: cumplido.** Monitor de prueba con cámara real visible
en HLS. Pendiente para antes del rollout: volumen de videos en disco externo
(hoy compartiría la SD/eMMC del sistema) y permisos de API key reducidos a
solo-lectura (Fase 6).

## Fase 2 — Push RTMP desde los edges (Pis/Jetsons de práctica)

Motivo: las Pis de práctica no son alcanzables desde el NVR (hoy requieren túnel SSH). Con push RTMP, el edge inicia la conexión saliente.

1. Script/servicio `nvr-push@.service` (systemd template, una instancia por cámara):

   ```ini
   [Service]
   ExecStart=/usr/local/bin/nvr-push.sh %i
   Restart=always
   RestartSec=5
   ```

   `nvr-push.sh` lee `/etc/nvr-push/<cam>.conf` (fuente local: `/dev/videoN` o `rtsp://reolink/...`; destino: URL RTMP del monitor) y ejecuta:

   ```bash
   ffmpeg -re -i "$SOURCE" -c:v copy_o_h264 -an -f flv "$RTMP_URL"
   ```

   - Cámaras RTSP (Reolink): `-c:v copy` (sin recodificar).
   - Cámaras USB/CSI: encodear h264 (hardware: `h264_v4l2m2m` en Pi).
   - `-an` de entrada (el audio Reolink ya daba problemas de timestamps en el player actual).
2. Deshabilitar `multicam.service` en cada edge una vez validado el push.
3. Documentar el aprovisionamiento de un edge nuevo (copiar confs + enable de las unidades).

**Criterio de salida:** todas las cámaras de un dispositivo piloto visibles y grabando en el Shinobi central; `multicam.service` apagado en ese dispositivo.

## Fase 3 — Backend Rust: módulo `cmd/nvr`

Nuevo módulo `Cliente-Rust/backend/src/cmd/nvr/` (no toca `cmd/streaming` todavía):

1. `shinobi.rs` con un `reqwest::Client` compartido y comandos Tauri:
   - `nvr_list_monitors(group_key) -> Vec<NvrMonitor>` → `GET {base}/{apiKey}/monitor/{groupKey}`; mapear a struct propio (id, name, status, modo).
   - `nvr_stream_url(group_key, monitor_id) -> String` → arma la URL HLS (el frontend no conoce la API key… ver Fase 6).
   - `nvr_health() -> bool` → ping al NVR para la UI de estado.
2. Struct `NvrMonitor` con `#[derive(TS)]` → binding `frontend/src/bindings/NvrMonitor.ts` (reemplazará a `CameraInfo.ts`).
3. Config del NVR (base URL, api key, group del dispositivo asignado): llega desde el flujo de reserva/sesión existente, NO hardcodeada. Errores con `CommandError` (transient para timeouts, permanent para 401/JSON inválido), igual que el resto del backend.
4. Registrar comandos en `lib.rs`.

**Criterio de salida:** `nvr_list_monitors` devuelve los monitors del piloto desde el cliente; test de integración con mock HTTP para el parseo de la respuesta de Shinobi.

## Fase 4 — Frontend: consumo del NVR

1. Hook nuevo `useNvrCameras.ts` (reemplaza `useCameraGrid.ts`):
   - sin `stream_start`/port-forward: solo `nvr_list_monitors` + polling (5 s, como hoy) + `nvr_stream_url` por cámara.
   - conserva la misma forma de retorno (`cameras`, `status`, `error`, `start`, `stop`) para minimizar cambios en `CameraGrid`.
2. `CameraGrid.tsx` / `CameraPane.tsx`: pasar solo `streamUrl` HLS; eliminar la prop `whepUrl` y el fallback WebRTC.
3. `HlsPlayer.tsx` **se reutiliza sin cambios** (ya tolera HLS remoto con retries).
4. Revisar los consumidores: `ChatEmbeddedCameras`, `CameraPanel`, intents de chat (`pi4ChatIntents.ts`) — apuntarlos al hook nuevo.

**Criterio de salida:** grid de cámaras funcionando contra el NVR central desde una red distinta a la del laboratorio.

## Fase 5 — Retiro del código legacy

Solo cuando la Fase 4 esté validada en el piloto:

1. Eliminar de `cmd/streaming/stream.rs`: `stream_list_cameras`, `stream_get_host`, `whep_exchange`. Evaluar si `stream_start/stream_stop` (port-forward genérico) se usa para algo más antes de borrarlo.
2. Eliminar `useCameraGrid.ts`, lógica WHEP en `CameraPane`, binding `CameraInfo.ts`.
3. Limpiar registro de comandos en `lib.rs` y referencias en README.

**Criterio de salida:** `cargo check` + build frontend limpios sin referencias a MediaMTX/WHEP.

## Fase 6 — Seguridad (bloqueante antes de dar acceso a alumnos)

1. **La API key maestra nunca viaja en el cliente Tauri.** Opciones (elegir una):
   - a) API keys de Shinobi restringidas por permisos + IP cuando sea viable, entregadas por el backend de reservas al iniciar sesión de práctica, revocadas al terminar; o
   - b) el backend actúa de proxy/firmador: el cliente pide `nvr_stream_url` y recibe una URL ya autorizada de vida corta.
2. Poner Shinobi detrás de reverse proxy con **HTTPS** (caddy/nginx en la misma Pi central); el cliente solo habla TLS.
3. RTMP de ingesta: usar las claves de stream por monitor de Shinobi; no exponer 1935 más allá de lo necesario (allowlist si los edges tienen IP predecible).
4. Pasar `@security` sobre el módulo `cmd/nvr` y la config del compose antes del merge.

## Fase 7 — Validación

1. Latencia HLS aceptable para el caso de uso (esperar 3–10 s; si la práctica exige menos, evaluar el modo "poseidon"/flv de Shinobi como mejora posterior).
2. Prueba de reconexión: reiniciar `nvr-push` en el edge y verificar recuperación automática del player.
3. Carga: N cámaras simultáneas de un grupo en el grid + grabación activa, midiendo CPU/RAM de la Pi central.
4. Verificar grabaciones: retención, acceso a clips vía API (`/videos`) — candidato a feature futura en el cliente.

---

## Orden de ejecución y dependencias

```
Fase 0 → Fase 1 → Fase 2 (piloto 1 dispositivo)
                     ↓
              Fase 3 → Fase 4 (cliente contra piloto)
                          ↓
                   Fase 6 (seguridad) → Fase 5 (retiro legacy) → Fase 7 → rollout resto de edges
```

Riesgos principales:

- **Recursos de la Pi central**: Shinobi + MariaDB + grabación de N streams puede quedarle grande a una Pi (sobre todo si recodifica). Mitigación: `-c:v copy` siempre que se pueda, grabar en modo passthrough, medir en Fase 7 antes del rollout. Esta Pi además comparte recursos con el sistema de cámaras actual (`mediamtx`) y otros servicios ya corriendo ahí — no es una máquina dedicada.
- **Latencia HLS** vs. WebRTC actual: HLS es inherentemente más lento. Se acepta el tradeoff por decisión de reemplazo total; revisar en Fase 7.
- ~~**Imagen Docker ARM**~~: **materializado y resuelto** — la imagen oficial es amd64-only, no corre en la Pi (`armv7l`). Se resolvió con instalación nativa (ver Fase 1 y `infra/shinobi/README.md`). Si se despliega Shinobi en un host amd64/arm64 en el futuro, el `docker-compose.yml` de `infra/shinobi/` sigue siendo válido.
- **Almacenamiento de video en la SD/eMMC compartida**: pendiente antes de activar grabación continua real — hoy no hay disco externo montado en la Pi central, así que `videosDir` apunta al mismo disco de 119GB que usa el resto del sistema. Resolver antes de pasar el Monitor de prueba a modo Record.
- **API key con permisos completos en el piloto**: la key de prueba actual no está restringida a solo-lectura (se creó así para simplificar la Fase 1). No usarla fuera del piloto hasta la Fase 6.
