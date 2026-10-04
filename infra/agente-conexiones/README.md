# agente-conexiones

Un proceso pequeño que corre **en cada dispositivo** (hoy la Pi4) y avisa al servidor de cada **entrada y salida SSH** de las
personas, para la pestaña **Dispositivos** de la página Actividad de la app. Es aparte de las prácticas (`broker-sesiones/sesiones.js`)
y **no toca** el flujo del Excel/Teams (`registro-excel`).

- **Solo conexiones nuevas, desde que arranca**: no lee el historial (`tail` desde el final de `auth.log`).
- Cuenta las entradas **con contraseña** (las cuentas del LDAP entran así), como `RegistroExcel.sh`; las entradas con llave son del personal.
- Cada 30 s manda un **latido** con las sesiones que siguen abiertas: así el servidor sabe que el dispositivo está en línea y cierra solo
  las sesiones que se quedaron sin cerrar. Si el servidor no responde, los eventos se guardan en memoria y se reenvían (máx. 1000).
- Corre como usuario normal (`pi`, grupo `adm` para leer `auth.log`), sin permisos de administrador, y no guarda nada en disco.
- Se identifica con un **token propio del dispositivo** (`CONEXIONES_TOKEN`), que debe coincidir con `DISPOSITIVOS_JSON` del broker
  (`broker-sesiones/sesiones.env`). La ruta que usa (`/nvr/dispositivos/evento`) es **solo local**: la puerta de entrada no la publica.

## Instalación (Pi4)
1. `/opt/laboremoto-brokers/agente-conexiones/agente_conexiones.py` (755), `agente-conexiones.service` en `/etc/systemd/system/`.
2. Token: generar uno (`openssl rand -hex 24`), ponerlo en `/etc/laboremoto-brokers/agente-conexiones.env` (ver el `.env.example`) y
   en `sesiones.env`: `DISPOSITIVOS_JSON={"pi4":{"nombre":"Pi4","token":"<token>"}}` y `DISPOSITIVOS_FILE=/opt/laboremoto-brokers/data/dispositivos.jsonl`.
3. `sudo systemctl daemon-reload && sudo systemctl restart broker-sesiones broker-gateway && sudo systemctl enable --now agente-conexiones`
4. `journalctl -u agente-conexiones -f` debe decir «servidor alcanzable».

Compatible con Python 3.7 (Debian 10). Pruebas: `python -m unittest infra/agente-conexiones/test_agente_conexiones.py`.

## Agregar otro dispositivo
Añadirlo a `DISPOSITIVOS_JSON` con su propio token y correr el agente en él apuntando al broker (si no es la Pi4, hay que publicar la
ruta de eventos de forma segura; hoy está pensada solo para la Pi4).
