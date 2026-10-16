# broker-camaras

Acceso a las cámaras: el cliente (`Cliente-Rust`) nunca ve la `SHINOBI_API_KEY` real, ni las IP y claves de las cámaras,
ni necesita una clave SSH propia. Solo manda el `access_token` de Keycloak y este servicio decide si autoriza.
Forma parte de los brokers (ver `../broker-gateway/README.md` para la arquitectura, los puertos y el despliegue).

## Por qué existe
El primer diseño (`cmd::nvr::ssh_tunnel`, ya retirado) abría un túnel SSH desde el propio cliente con una clave privada
local. Funcionaba en desarrollo, pero es inviable en un build distribuido a estudiantes: no hay forma de repartir esa
clave sin dar acceso SSH real a la Pi.

## Endpoints (públicos como `/nvr/…`, vía `broker-gateway`)
- `GET /nvr/monitor/:groupKey` — requiere `Authorization: Bearer <JWT Keycloak>`. Verifica firma RS256 contra el JWKS
  institucional, issuer y expiración; consulta Shinobi con la API key real (nunca sale de la Pi) y devuelve el mismo JSON
  con las `streams` reescritas hacia `/nvr/hls/:token/…`, y cada cámara marcada con `ptz` y `webrtc`.
- `GET /nvr/hls/:token/*` — proxy hacia Shinobi, solo con una sesión vigente (la emite `/nvr/monitor`, TTL 15 min).
  Reescribe además cualquier referencia a la key real dentro del manifest `.m3u8`.
- `POST /nvr/ptz/:groupKey/:mid` — requiere JWT **con rol de personal** (`admin_lab`, `jefe_laboratorio`,
  `coordinador_laboratorio`, `laboratorista` o `semillerista`). Body `{"op": "Left"|"Right"|"Up"|"Down"|"LeftUp"|
  "LeftDown"|"RightUp"|"RightDown"|"ZoomInc"|"ZoomDec"|"Stop", "speed"?: 1-8}`. Traduce `:mid` a la cámara Reolink real
  vía `PTZ_CAMERAS_JSON` y reenvía por su API HTTP nativa (`cgi-bin/api.cgi?cmd=PtzCtrl`). Si `:mid` no está en el mapa,
  responde 404 `ptz_not_supported`.
- `POST /nvr/whep/:path` — negociación WebRTC hacia MediaMTX (ver `webrtc.js`); el video no pasa por aquí.

## Administración de cámaras (solo `admin_lab`)

Crear, editar, eliminar y **probar** cámaras desde la app (Vigilancia → «Administrar cámaras»). Antes había que tocar a mano
Shinobi, `mediamtx.yml`, `PTZ_CAMERAS_JSON` y `WEBRTC_PATHS_JSON`; ahora el **registro de cámaras** es la fuente única y el
broker aplica cada cambio en los tres sitios, **sin reiniciar nada**.

| Ruta | Qué hace |
|---|---|
| `GET /nvr/camaras` | Lista con estado (Shinobi + MediaMTX). **Nunca** devuelve claves (solo `tienePassword`) |
| `POST /nvr/camaras/probar` | Prueba una cámara sin guardarla: video por RTSP (ffprobe), clave, modelo (API Reolink) y PTZ. Máx. 12 por minuto |
| `POST /nvr/camaras` | Crea (prueba antes; `forzar:true` guarda aunque la prueba falle). Asigna `CamaraNN` y `camNN` |
| `PUT /nvr/camaras/:id` | Edita; la clave es opcional (si no viene se conserva); solo prueba si cambia la conexión |
| `DELETE /nvr/camaras/:id` | Elimina de Shinobi, MediaMTX y el registro |

- **Registro:** `CAMARAS_REGISTRO` (por defecto `/opt/laboremoto-brokers/data/camaras.json`, permisos 600, escritura atómica con
  respaldos). La primera vez se arma solo con lo que ya existe (monitores de Shinobi + rutas de MediaMTX + los mapas de env, que
  quedan como respaldo). Con cámaras en el registro, los mapas de PTZ y WebRTC salen de él.
- **MediaMTX:** se aplica en caliente con su API (`MEDIAMTX_API`) y se reescribe la sección `paths:` de `mediamtx.yml`
  (`MEDIAMTX_YML`, con respaldo `.bak-admin-*`) para que sobreviva a un reinicio. Esa sección está **generada**: no editarla a mano.
- **Seguridad:** solo el rol `admin_lab` del token; solo IPs de red privada (si no, «probar» serviría para escanear redes);
  `ffprobe` con argumentos (nunca por shell); cambios serializados; auditoría en `camaras-auditoria.jsonl` (quién y qué, **nunca
  claves**); si un paso falla se **deshacen** los anteriores.
- **Cuidado:** hoy el cliente habla con el broker por `http://` (sin TLS), así que las claves de las cámaras viajan sin cifrar
  entre la app y AWS. Conviene activar HTTPS en el nginx de AWS antes de usar esto a gran escala.
- Pruebas: `node --test infra/broker-camaras/admin.test.js` y la de punta a punta en `broker-gateway/integracion.test.js`.

**Importante:** el token de sesión se reutiliza mientras esté vigente para el mismo `usuario+groupKey`
(`getOrCreateSessionToken`). El cliente consulta `/nvr/monitor` cada 5 s (`useNvrCameras`); si el token cambiara en cada
respuesta, el `stream_url` cambiaría y el reproductor HLS se reiniciaría cada 5 segundos (bug real del primer despliegue).

## Configuración (env, ver `camaras.env.example`)
`SHINOBI_API_KEY` (obligatoria), `SHINOBI_LOCAL_PORT` (8082), `PTZ_CAMERAS_JSON`, `WEBRTC_PATHS_JSON`,
`MEDIAMTX_WEBRTC_PORT` (8889), `SHINOBI_GROUP_KEY` (pilabpiloto), `CAMARAS_REGISTRO`, `CAMARAS_AUDITORIA`, `MEDIAMTX_API`, `MEDIAMTX_YML`, `PORT` (8092) y las de Keycloak (`KEYCLOAK_JWKS_URL`, `KEYCLOAK_ISSUER`).

## PTZ
Solo algunas cámaras del NVR son físicamente PTZ, y de esas solo las que tienen su API HTTP de Reolink alcanzable desde la
Pi pueden controlarse; otras solo exponen el puerto RTSP 554. `PTZ_CAMERAS_JSON` es la fuente de la verdad de qué `mid`
acepta control, y `/nvr/monitor` lo refleja en cada cámara con `ptz: true/false` (el frontend solo muestra los controles
si viene en `true`). Las credenciales RTSP de Shinobi (`muser`/`mpass`) sirven también para el login de la API HTTP de
Reolink. Para agregar otra cámara PTZ: confirmar que su IP responde en `cgi-bin/api.cgi?cmd=Login` (con `curl` desde la
Pi; no basta con que RTSP funcione), añadirla a `PTZ_CAMERAS_JSON` y reiniciar `broker-camaras`.

## Notas operativas
- CORS abierto (`*`): el webview del cliente Tauri hace las peticiones HLS con `fetch`/XHR y, sin las cabeceras, las
  trata como cross-origin y las bloquea (bug real del primer despliegue). Lo aplica `broker-comun/servidor.js`.
- Si Shinobi se traba sin que se note (monitores en `start`, 0 procesos `ffmpeg`, HLS sin segmentos), diagnosticar con
  `pgrep -c ffmpeg` y reiniciar con `pm2 restart shinobi`. No viene de este servicio.

## Pendiente / mejoras futuras
- TLS real en la AWS (hoy `http://`); el JWT va en la cabecera, no en la URL, pero conviene TLS.
- Si el tráfico de video crece, este proxy Node de un solo hilo para segmentos `.ts` puede no alcanzar: evaluar servir HLS
  directo desde Shinobi con un token firmado de corta duración.
