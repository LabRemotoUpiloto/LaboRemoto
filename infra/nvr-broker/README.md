# nvr-broker

Servicio que reemplaza el consumo directo (túnel SSH + clave privada local)
del NVR Shinobi por un broker HTTP público. El cliente (`Cliente-Rust`)
nunca ve la `SHINOBI_API_KEY` real ni necesita una clave SSH propia — solo
manda el `access_token` de Keycloak que ya tiene del login, y el broker
decide si autoriza.

## Por qué existe

El primer diseño (`cmd::nvr::ssh_tunnel`, ya retirado) abría un túnel SSH
desde el propio cliente usando una clave privada (`SHINOBI_SSH_KEY_PATH`)
presente en el disco del desarrollador. Funcionaba en dev, pero es inviable
para un build distribuido a estudiantes: no hay forma de repartir esa clave
sin regalarle a cualquiera que instale la app acceso SSH real a la Pi.

## Arquitectura

Reutiliza el mismo patrón que ya usa `keycloak-tunnel.service` en la Pi
(túnel SSH inverso hacia una máquina en AWS que ya expone Keycloak
públicamente) — no hace falta abrir ningún puerto nuevo en el router ni
conseguir un servidor nuevo.

```
Cliente Tauri                AWS (52.14.162.232)              Pi central
─────────────                ────────────────────              ──────────
GET /nvr/monitor/:g   ──►    nginx :80                    ──►  nvr-broker :8091
Authorization: Bearer        location /nvr/ {                  (valida JWT,
  <access_token Keycloak>      proxy_pass 127.0.0.1:8091 }      NUNCA expone
                              (mismo puerto reverse-              SHINOBI_API_KEY)
                               tuneleado por la Pi)                   │
                                                                       ▼
                                                                Shinobi 127.0.0.1:8082
```

- `nvr-broker.service` (systemd, en la Pi): corre `broker_server.js` en
  `127.0.0.1:8091`. Nunca expuesto directo — solo alcanzable vía el túnel.
- `nvr-broker-tunnel.service` (systemd, en la Pi): túnel SSH inverso
  (`autossh -R 8091:localhost:8091 ubuntu@52.14.162.232`), igual a
  `keycloak-tunnel.service` pero para este puerto.
- nginx en la AWS: se agregó un `location /nvr/` al `server` que ya existía
  para Keycloak (mismo puerto 80, sin abrir nada nuevo).

## Endpoints

- `GET /nvr/monitor/:groupKey` — requiere `Authorization: Bearer <JWT
  Keycloak>`. Verifica firma RS256 contra el JWKS institucional (mismo
  realm que ya usa el resto del cliente), issuer y expiración. Si es
  válido, consulta Shinobi real con la API key real (nunca sale de la Pi)
  y devuelve el mismo JSON, con las `streams` reescritas para pasar por
  `/nvr/hls/:token/...` en vez de traer la key real embebida.
- `GET /nvr/hls/:token/*` — proxy hacia Shinobi real, solo si `:token` es
  una sesión vigente (emitida por `/nvr/monitor`, TTL 15 min). Reescribe
  además cualquier referencia a la key real dentro del manifest `.m3u8`.
- `POST /nvr/ptz/:groupKey/:mid` — requiere `Authorization: Bearer <JWT
  Keycloak>` **con rol `admin_lab` o `laboratorista`** (`realm_access.roles`
  del token) — a diferencia de `/nvr/monitor`, que es solo lectura y no
  exige rol. Body `{"op": "Left"|"Right"|"Up"|"Down"|"LeftUp"|"LeftDown"|
  "RightUp"|"RightDown"|"ZoomInc"|"ZoomDec"|"Stop", "speed"?: 1-8}`.
  Traduce `:mid` a la cámara Reolink real vía `PTZ_CAMERAS` (env
  `PTZ_CAMERAS_JSON`) y reenvía el comando por su API HTTP nativa
  (`cgi-bin/api.cgi?cmd=PtzCtrl`) — la IP y credenciales de la cámara nunca
  salen de la Pi. Si `:mid` no está en el mapa, responde 404
  `ptz_not_supported` (no todas las cámaras del NVR son PTZ, y de las que
  sí, no todas tienen su API HTTP alcanzable en la red — ver nota abajo).

**Importante:** el token de sesión se reutiliza mientras esté vigente para
el mismo `usuario+groupKey` (`getOrCreateSessionToken`) — el cliente hace
polling de `/nvr/monitor` cada 5s (`useNvrCameras`), y si el token cambiara
en cada respuesta el `stream_url` cambiaría de string en cada poll,
reiniciando el reproductor HLS cada 5 segundos (bug real que se dio en el
primer despliegue).

CORS: todas las respuestas incluyen `Access-Control-Allow-Origin: *` — el
webview del cliente Tauri hace las peticiones HLS vía `fetch`/XHR desde el
renderer (hls.js), que si no hay estas cabeceras las trata como
cross-origin y las bloquea (otro bug real del primer despliegue).

## Deploy (ya hecho en la Pi piloto — esto es referencia para replicarlo)

```bash
# En la Pi:
sudo mkdir -p /opt/nvr-broker
scp broker_server.js verify_jwt.js pi@<pi-host>:/opt/nvr-broker/

sudo tee /etc/systemd/system/nvr-broker.service <<'EOF'
[Unit]
Description=Broker de acceso al NVR Shinobi (valida JWT Keycloak, oculta SHINOBI_API_KEY real)
After=network.target

[Service]
User=pi
Type=simple
Environment="PORT=8091"
Environment="SHINOBI_API_KEY=<la key real de Shinobi>"
Environment="SHINOBI_LOCAL_PORT=8082"
Environment="KEYCLOAK_JWKS_URL=http://52.14.162.232/auth/realms/laboratorio-semillero/protocol/openid-connect/certs"
Environment="KEYCLOAK_ISSUER=http://52.14.162.232/auth/realms/laboratorio-semillero"
Environment="PTZ_CAMERAS_JSON={\"Camara1\":{\"host\":\"172.16.118.115\",\"user\":\"admin\",\"pass\":\"<password real>\"}}"
ExecStart=/usr/local/bin/node /opt/nvr-broker/broker_server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/nvr-broker-tunnel.service <<'EOF'
[Unit]
Description=Tunel SSH Inverso para el broker de NVR hacia AWS
After=network-online.target
Wants=network-online.target

[Service]
User=pi
Type=simple
Environment="AUTOSSH_GATETIME=0"
ExecStart=/usr/bin/autossh -M 0 -N -q -o "ServerAliveInterval 30" -o "ServerAliveCountMax 3" -o "StrictHostKeyChecking=no" -i /home/pi/llave-semillero.pem -R 8091:localhost:8091 ubuntu@52.14.162.232
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now nvr-broker.service nvr-broker-tunnel.service
```

```nginx
# En la maquina AWS, agregado a /etc/nginx/sites-enabled/keycloak
# (mismo server block que ya existia para Keycloak, puerto 80 reusado):
location /nvr/ {
    proxy_pass http://127.0.0.1:8091/nvr/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Authorization $http_authorization;
}
```

`sudo nginx -t && sudo systemctl reload nginx` (reload, no restart —
no corta las conexiones existentes de Keycloak).

**Ojo con `/etc/nginx/sites-enabled/`:** el `include` de nginx es
`sites-enabled/*` sin filtro de extensión — cualquier backup que se deje
ahí (ej. `keycloak.bak`) se carga también y genera un `server_name`
duplicado. Los backups van fuera de `sites-enabled/`.

## Variables de entorno (backend Cliente-Rust)

Ninguna — el host del broker está hardcodeado en
`cmd::nvr::shinobi.rs::NVR_BROKER_HOST` porque no es un secreto (URL
pública, igual que `KEYCLOAK_BASE_URL`).

## PTZ

Solo algunas cámaras del NVR son físicamente PTZ, y de esas, solo las que
tienen su API HTTP de Reolink (`cgi-bin/api.cgi`) alcanzable en la red desde
la Pi pueden controlarse — otras solo exponen el puerto RTSP 554 hacia
Shinobi (verificado en el grupo piloto `pilabpiloto`: de 3 cámaras, solo
`Camara1` en `172.16.118.115` responde en `cgi-bin/api.cgi`; `Camara03` y
`Camara2` solo tienen el puerto 554 abierto). El mapa `PTZ_CAMERAS`
(`PTZ_CAMERAS_JSON`) es la fuente de la verdad de qué `mid` acepta control —
`/nvr/monitor` refleja esto en cada cámara con el campo `ptz: true/false`,
y el frontend solo muestra los controles si viene en `true`.

Las credenciales de la cámara (RTSP `muser`/`mpass` en la config de Shinobi)
sirven también para el login de la API HTTP de Reolink — mismo par
usuario/contraseña.

Para agregar otra cámara PTZ al mapa: confirmar que su IP responde en
`cgi-bin/api.cgi?cmd=Login` (con `curl` desde la Pi, no basta con que el
puerto RTSP funcione), agregar la entrada a `PTZ_CAMERAS_JSON` y reiniciar
`nvr-broker.service`.

## Pendiente / mejoras futuras

- Certificado TLS real en la AWS (hoy `http://`, no `https://`) — el JWT va
  en la cabecera `Authorization`, no en la URL, pero igual conviene TLS.
- Si escalan a mucho tráfico de video, este proxy Node de un solo hilo para
  segmentos `.ts` puede no alcanzar — evaluar servir HLS directo desde
  Shinobi con un token firmado de corta duración en vez de proxyear cada
  segmento.
