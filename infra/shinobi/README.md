# Shinobi NVR central — despliegue (Fase 1)

Este directorio documenta el despliegue de Shinobi como NVR centralizado en
la Raspberry Pi "pública" del laboratorio (`200.115.181.211:9000`, usuario
`pi`), según la Fase 1 de `docs/plan-shinobi-nvr.md`.

**Estado real (2026-08-05): Shinobi ya está corriendo en esa Pi**, instalado
de forma **nativa** (sin Docker) por los motivos explicados abajo. El
`docker-compose.yml` de este directorio quedó como referencia para un futuro
host amd64/arm64 — **no es el método usado en el despliegue actual**.

## Por qué no se usó Docker aquí

El plan original asumía Docker. Al hacer el reconocimiento real de la Pi
aparecieron dos bloqueos:

1. **Arquitectura**: la Pi es `armv7l` (32-bit, Raspberry Pi 4 con Raspbian
   Buster). La imagen `shinobisystems/shinobi` (`dev` y `latest`) en Docker
   Hub **solo publica manifest `amd64`** — no corre ahí vía Docker.
2. **Puertos ya ocupados**: esta misma Pi ya corre en producción el stack de
   cámaras actual (`multicam.service` + MediaMTX) y otros servicios. Los
   puertos "por defecto" de Shinobi (8080 web, 1935 RTMP) estaban tomados por
   `shellinaboxd` y `mediamtx` respectivamente. Ver "Puertos reales" abajo.

Por eso Fase 1 se ejecutó como **instalación nativa** (Node.js + PM2 +
MariaDB directo en el SO), siguiendo el propio código de instalación del
repo de Shinobi (`INSTALL/ubuntu.sh`, adaptado a mano para Buster/armv7
porque ese script asume Ubuntu reciente y NodeSource, que no soporta Buster).

Si en el futuro se despliega Shinobi en un host amd64 o arm64 (ver opción
"servidor central" del plan), el `docker-compose.yml` de este directorio sí
aplica tal cual y es la vía recomendada por ser más simple de mantener.

## Puertos reales usados (no los de la plantilla `.env.example`)

| Servicio          | Puerto plantilla | Puerto real en esta Pi | Motivo                                   |
|--------------------|:---:|:---:|-------------------------------------------|
| Web / API / HLS    | 8080 | **8082** | 8080 lo usa `shellinaboxd`; 8081 lo usa otro proceso (`java`) ya corriendo ahí. |
| RTMP (ingesta)     | 1935 | **1936** | 1935 lo usa `mediamtx` (stack de cámaras actual). |

Antes de reutilizar esta plantilla en otra máquina, correr
`ss -tlnp` (o `netstat -tlnp`) y confirmar qué puertos están libres — no
asumas que 8080/1935 lo están.

## Instalación nativa realizada (para repetir en otro host similar)

Resumen de los pasos ejecutados en la Pi, en orden. Todo corre como usuario
`pi` con `sudo` puntual.

1. **Node.js 18 LTS**, tarball oficial `linux-armv7l` (no NodeSource: Buster
   es EOL y el script `nodejs-ubuntu.sh` del propio repo de Shinobi no lo
   soporta):
   ```bash
   curl -fsSLO https://nodejs.org/dist/v18.20.8/node-v18.20.8-linux-armv7l.tar.xz
   sudo mkdir -p /opt/node18
   sudo tar -xJf node-v18.20.8-linux-armv7l.tar.xz -C /opt/node18 --strip-components=1
   sudo ln -sf /opt/node18/bin/node /usr/local/bin/node
   sudo ln -sf /opt/node18/bin/npm /usr/local/bin/npm
   sudo ln -sf /opt/node18/bin/npx /usr/local/bin/npx
   ```
   Node 18 se eligió porque el glibc de Buster (2.28) es justo el mínimo que
   soporta — no usar Node 20+ sin verificar primero (`ldd --version`).

2. **MariaDB** + base/usuario dedicados (nunca la contraseña vacía del
   `sql/user.sql` de ejemplo del repo):
   ```bash
   sudo apt-get install -y mariadb-server
   sudo mysql -e "CREATE DATABASE IF NOT EXISTS ccio; \
     CREATE USER IF NOT EXISTS 'majesticflame'@'127.0.0.1' IDENTIFIED BY '<password real>'; \
     GRANT ALL PRIVILEGES ON ccio.* TO 'majesticflame'@'127.0.0.1'; FLUSH PRIVILEGES;"
   ```
   **Gotcha real que nos pasó**: el proceso de Shinobi no siempre conecta a
   MariaDB por `127.0.0.1` puro — en esta Pi conectaba mostrando como origen
   la IP real de `eth0`. Como `bind-address` de MariaDB queda en `127.0.0.1`
   (sin exposición de red real), fue seguro además dar el mismo GRANT a
   `'majesticflame'@'<ip-eth0-de-la-pi>'` y a `'majesticflame'@'localhost'`
   para cubrir los tres casos.

3. **Clonar Shinobi** (repo real está en GitLab, no en el GitHub que uno
   esperaría):
   ```bash
   git clone --depth 1 https://gitlab.com/Shinobi-Systems/Shinobi.git ~/Shinobi
   cd ~/Shinobi
   npm install --unsafe-perm
   sudo npm install pm2@latest -g
   sudo ln -sf /opt/node18/bin/pm2 /usr/local/bin/pm2
   ```

4. **Configurar `conf.json`/`super.json`** con la propia herramienta del
   repo (evita errores de sintaxis JSON a mano):
   ```bash
   cp conf.sample.json conf.json
   cp super.sample.json super.json
   node tools/modifyConfiguration.js addToConfig='{"port":8082,"rtmpServer":{"port":1936},"db":{"host":"127.0.0.1","user":"majesticflame","password":"<password real>","database":"ccio","port":3306}}'
   ```
   El **superusuario por defecto es `admin@shinobi.video` / `admin`** — se
   reemplazó por credenciales propias calculando el hash exactamente como lo
   hace Shinobi (`libs/basic.js`, `passwordType: "sha256"` en `conf.json` →
   `sha256(password).hex`) y escribiéndolo directo en `super.json`. **Nunca
   dejar el default si la Pi es alcanzable desde otra red.**

5. **Arrancar con PM2** y dejarlo persistente al reboot:
   ```bash
   cd ~/Shinobi
   pm2 start camera.js --name shinobi
   sudo env PATH=$PATH:/opt/node18/bin pm2 startup systemd -u pi --hp /home/pi
   pm2 save
   ```

## Cuenta de usuario, API key y el gotcha de "Treated as Sub-Account"

1. Login como superusuario en `http://<ip-de-la-pi>:8082/super`, crear una
   cuenta de usuario normal con su propio **Group Key** (ojo: Shinobi
   normaliza el Group Key quitando guiones y símbolos — `pi-lab-piloto` se
   guardó como `pilabpiloto`).
2. Login con esa cuenta normal (no la de superusuario) y crear el **Monitor**
   ahí — `Mode: Watch-Only`, `Input Type: H.264/H.265/H.265+`, `Automatic:
   Yes`, `Full URL Path` con la URL RTSP real de la cámara.
3. Crear la **API key** desde el menú de usuario → API Keys.

   **Gotcha real, cuesta caro depurarlo si no se sabe:** si al crear la key
   se deja **"Treated as Sub-Account" = Yes**, Shinobi la trata como una
   cuenta restringida que solo puede ver los monitors listados explícitamente
   en un campo `monitors` que la UI de creación de keys no expone — el
   resultado es que el endpoint HLS (`/<apiKey>/hls/<group>/<monitor>/s.m3u8`)
   devuelve `{"ok":false,"msg":"Not Authorized"}` **aunque todos los
   checkboxes de permisos estén marcados**. La causa es
   `libs/monitor.js` → `getMonitorsPermitted()`: con `treatAsSub=1` y sin
   monitors explícitos, `monitorPermissions[monitorId_monitors]` da `false`
   y la request se rechaza.

   **Fix**: crear la API key con **"Treated as Sub-Account" = No**. Así
   hereda los permisos completos de la cuenta dueña en vez de depender de una
   lista de monitors que la UI no deja rellenar en este flujo.

   **Además, Shinobi cachea las sesiones de API key en memoria** (`s.api` en
   `libs/auth.js`). Si cambias los permisos de una key ya usada (por UI o por
   base de datos), el cambio no se aplica hasta reiniciar el proceso:
   ```bash
   pm2 restart shinobi
   ```

4. Verificar el HLS real (el mismo formato que usará el cliente Tauri):
   ```bash
   curl "http://127.0.0.1:8082/<apiKey>/hls/<groupKey>/<monitorId>/s.m3u8"
   # Debe devolver un manifest #EXTM3U, no {"ok":false,...}
   ```

**Importante — alcance de esta fase:** la key de prueba actual tiene todos
los permisos (se creó así para simplificar la validación). El endurecimiento
real — permisos mínimos de solo lectura, la key nunca hardcodeada en el
cliente, entrega/rotación desde el backend de reservas, HTTPS end-to-end —
es trabajo de **Fase 6 — Seguridad**, todavía no implementado. No usar esta
key de prueba en un despliegue con alumnos reales hasta que Fase 6 esté
resuelta.

## Checklist — criterio de salida de la Fase 1

- [x] Shinobi corriendo en la Pi central (nativo, PM2), persistente al reboot.
- [x] Arquitectura verificada: `armv7l`, imagen Docker oficial descartada por
      ser amd64-only; instalación nativa confirmada funcional.
- [x] MariaDB dedicada con usuario/password reales (no vacíos).
- [x] Puertos ajustados para no chocar con servicios ya corriendo en la Pi
      (8082 web/HLS, 1936 RTMP).
- [x] Superusuario con password propio (no el default `admin`/`admin`).
- [x] Cuenta de usuario + Group creado (`pilabpiloto`).
- [x] Monitor de prueba (`Camara1`, cámara Reolink real vía RTSP) en modo
      Watch-Only, visible en vivo en el Live Grid de Shinobi.
- [x] API key de prueba funcional, endpoint HLS verificado con `curl`
      devolviendo manifest válido.
- [ ] Volumen de videos en disco externo (no la SD) — **pendiente**, hoy las
      grabaciones (si se activa modo Record) quedarían en la SD de 119GB
      compartida con el resto del sistema. Evaluar antes de activar
      grabación continua real.
- [ ] Permisos de la API key reducidos a solo-lectura (Fase 6).

## docker-compose.yml / .env.example (referencia, no usados en este despliegue)

Se mantienen en este directorio para un futuro host amd64/arm64 dedicado
(ver plan, opción "servidor central" alterna). Antes de usarlos ahí:
confirmar que la imagen `shinobisystems/shinobi:dev` soporte la arquitectura
real del host (`docker manifest inspect shinobisystems/shinobi:dev`), y
revisar puertos libres igual que se hizo aquí.
