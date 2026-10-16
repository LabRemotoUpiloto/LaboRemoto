# Brokers de LaboRemoto

Servicios HTTP del servidor que hablan con la app (`Cliente-Rust`) usando solo el `access_token` de Keycloak. Cada uno
guarda sus propios secretos y valida el JWT por su cuenta; la app nunca ve claves de Shinobi, de las cámaras ni de Moodle.

Antes todo esto era un único programa llamado `nvr-broker`. Se separó porque solo una parte tenía que ver con NVR, y
porque cada servicio tiene secretos y ritmos de despliegue distintos.

| Carpeta | Qué hace | Rutas públicas | Puerto | Secretos |
|---|---|---|---|---|
| `broker-gateway` | Puerta de entrada: reparte `/nvr/…` al servicio correcto. No valida ni guarda nada | todas | **8091** | ninguno |
| `broker-camaras` | Cámaras (Shinobi), PTZ, WebRTC y administración de cámaras | `/nvr/monitor`, `/nvr/hls`, `/nvr/ptz`, `/nvr/whep`, `/nvr/camaras` | 8092 | `SHINOBI_API_KEY`, claves de cámaras (registro) |
| `broker-sesiones` | Registro central de sesiones de práctica y conexiones SSH a dispositivos | `/nvr/sesiones`, `/nvr/dispositivos/resumen` | 8093 | webhook del Excel, `IPINFO_TOKEN` |
| `broker-moodle` | Cursos y prácticas desde Moodle; resultados para revisión | `/nvr/moodle` | 8094 | `MOODLE_TOKEN` |
| `broker-comun` | Librería compartida: validación del JWT (`auth.js`) y servidor base (`servidor.js`) | — | — | — |

```
Cliente Tauri      AWS (52.14.162.232)             Pi central
─────────────      ───────────────────             ──────────
/nvr/...   ──►     nginx :80  location /nvr/  ──►  broker-gateway :8091 ─┬─► broker-camaras  :8092 ─► Shinobi, MediaMTX, cámaras
Bearer <JWT>       (túnel SSH inverso 8091)                              ├─► broker-sesiones :8093
                                                                         └─► broker-moodle   :8094 ─► Moodle (puede estar en otra máquina)
```

Las URLs públicas no cambiaron respecto al `nvr-broker` anterior: el túnel y el nginx de AWS siguen apuntando al 8091 y
las apps ya instaladas siguen funcionando. Si un servicio se cae, solo falla su ruta (503); los demás siguen.

## Despliegue en la Pi (carpetas lado a lado, porque `server.js` importa `../broker-comun`)

```
/opt/laboremoto-brokers/
  broker-comun/  broker-camaras/  broker-sesiones/  broker-moodle/  broker-gateway/
  data/sesiones.jsonl
/etc/laboremoto-brokers/{camaras,sesiones,moodle,gateway}.env     (600, root; copiar de los *.env.example)
/etc/systemd/system/broker-{camaras,sesiones,moodle,gateway}.service   (copiar de cada carpeta)
```

El túnel `nvr-broker-tunnel.service` (autossh `-R 8091:127.0.0.1:8091`) no cambia; conviene renombrarlo luego a
`broker-tunnel.service`. Recuerda: en los túneles `-R` usar `127.0.0.1`, no `localhost` (IPv6).

### Migrar desde el `nvr-broker` único (hacer con calma: corta las cámaras unos segundos)
1. Copiar las 5 carpetas a `/opt/laboremoto-brokers/` y `sudo mkdir -p /opt/laboremoto-brokers/data`.
2. Crear los `.env` con los valores del `nvr-broker.service` actual y de su drop-in `webrtc.conf`
   (`SHINOBI_API_KEY`, `PTZ_CAMERAS_JSON`, `WEBRTC_PATHS_JSON`, `SESIONES_*`). Copiar `/opt/nvr-broker/sesiones.jsonl`
   a `data/`.
3. `sudo systemctl daemon-reload && sudo systemctl enable broker-camaras broker-sesiones broker-moodle broker-gateway`
4. `sudo systemctl stop nvr-broker && sudo systemctl start broker-camaras broker-sesiones broker-moodle broker-gateway`
   (el gateway toma el 8091 que dejó libre el broker antiguo).
5. Probar: `curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:8091/nvr/ptz/x/y` → **401**; entrar a la
   app y ver cámaras, y registrar una práctica.
6. **Volver atrás:** `sudo systemctl stop broker-gateway broker-camaras broker-sesiones broker-moodle && sudo systemctl start nvr-broker`
   (dejar el directorio y el servicio viejos intactos hasta confirmar que todo funciona).

## Pruebas
```
node --test infra/broker-comun/auth.test.js
node --test infra/broker-moodle/moodle.test.js
node --test infra/broker-gateway/integracion.test.js   # levanta los 4 servicios reales con Shinobi, Moodle y JWKS falsos
```

## Agregar un servicio nuevo
Carpeta `broker-<nombre>/` con `server.js` (ver cualquiera: ~10 líneas con `crearServidor` y `crearVerificador`), un
`<nombre>.env.example`, su `.service`, y una fila en `RUTAS` de `broker-gateway/gateway.js` (`servicioDe`) más su
`UPSTREAM_*`.
