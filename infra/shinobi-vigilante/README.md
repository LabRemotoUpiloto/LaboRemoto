# shinobi-vigilante (nivel 2: destrabar Shinobi)

Complementa al vigilante `shinobi-watchdog` de la Pi4 (`/home/pi/shinobi-watchdog`), que reinicia monitores caídos uno por
uno con la API de Shinobi. Esa API no sirve cuando Shinobi mismo está trabado: tras reiniciar la Pi4 (2026-10-02) quedó
«online» durante más de un día con **0 procesos `ffmpeg` y todos los monitores sin estado**, y la app mostraba
«Esperando cámaras activas… N conectando» porque solo pinta las cámaras que Shinobi reporta `Watching`/`Recording`.

`shinobi-unstick.sh` reinicia el proceso (`pm2 restart shinobi`) solo si, durante 3 minutos seguidos, se cumple todo:
ningún monitor activo sano, ningún `ffmpeg`, y al menos una cámara activa responde en su puerto (si todas están apagadas
no es culpa de Shinobi). Tras reiniciar espera 30 min antes de volver a hacerlo (sin bucles). Reusa el `.env` del vigilante.

| Archivo | Va en la Pi4 |
|---|---|
| `shinobi-unstick.sh` | `/home/pi/shinobi-watchdog/scripts/` (755) |
| `shinobi-unstick.service`, `shinobi-unstick.timer` | `/etc/systemd/system/`; `systemctl enable --now shinobi-unstick.timer` |
| `shinobi-unstick.test.sh` | solo pruebas: `bash shinobi-unstick.test.sh ruta/a/shinobi-unstick.sh` (casos simulados, no reinicia nada) |

Registro: `journalctl -u shinobi-unstick` (y `logger -t shinobi-unstick`). Variables: `UNSTICK_MINUTES` (3), `COOLDOWN_MIN` (30), `DRY_RUN=1`.

Nota: el orden de arranque ya estaba bien (`pm2-pi.service` declara `After=mariadb.service network-online.target` y arrancó
después de MariaDB), así que la causa de ese atasco no era la base de datos; por eso se detecta el síntoma en lugar de
cambiar el orden.
