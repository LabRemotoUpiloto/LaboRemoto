# Domótica Arduino — Instalación en la Raspberry Pi

Este documento describe cómo instalar el **sketch maestro** y el **bridge HTTP** que
permiten al panel "Domótica" de la app controlar el Arduino DUE conectado por USB.

## Arquitectura

```
App (Tauri/React)
      │  SSH exec + curl
      ▼
Raspberry Pi: arduino-bridge.service  (HTTP en 127.0.0.1:8765)
      │  pyserial (/dev/ttyACM0 @ 115200, puerto siempre abierto)
      ▼
Arduino DUE  →  sketch DomoticaMaster.ino
      │
      ├── Bombillo 1 (pin 46)
      ├── Bombillo 2 (pin 48)
      ├── Servo 180° (pin 2)
      ├── Motor continuo (pin 3)
      ├── Sensor HC-SR04 (trig=5, echo=6)
      └── LCD I2C (SDA=20, SCL=21, dirección 0x27)
```

> El bridge mantiene el puerto serial abierto permanentemente, así el Arduino **NO se
> resetea en cada comando** (de lo contrario cada orden tardaría 2 s).

---

## 1. Sketch maestro — `DomoticaMaster.ino`

Crea la carpeta y archivo en la Pi:

```bash
mkdir -p /home/pi/Arduino/DomoticaMaster
nano /home/pi/Arduino/DomoticaMaster/DomoticaMaster.ino
```

Pega este contenido:

```cpp
/*
  DomoticaMaster.ino
  Sketch unificado para el tablero de domótica del DUE.
  Acepta comandos de texto terminados en '\n' por SerialUSB (y Serial):

    PING                 → PONG
    LUZ1:ON | LUZ1:OFF
    LUZ2:ON | LUZ2:OFF
    SERVO:<0-180>        → mueve servo 180° (pin 2)
    MOTOR:<0-180>        → mueve motor continuo (pin 3). 90 = detenido
    DIST?                → DIST:<cm>  (sensor HC-SR04)
    LCD:<texto>          → muestra texto en LCD I2C (línea 1)
    LCD2:<texto>         → muestra texto en LCD I2C (línea 2)
    LCDCLR               → limpia LCD
    STOP                 → apaga todo

  Respuestas: "OK ...", "ERR ...", "PONG", "DIST:<cm>".
*/
#include <Servo.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

const int PIN_LUZ1  = 46;
const int PIN_LUZ2  = 48;
const int PIN_SERVO = 2;
const int PIN_MOTOR = 3;
const int PIN_TRIG  = 5;
const int PIN_ECHO  = 6;

// I2C en Arduino DUE: SDA = pin 20, SCL = pin 21
LiquidCrystal_I2C lcd(0x27, 16, 2);  // dirección I2C, 16 columnas, 2 filas

Servo srv180;
Servo srvCont;

String bufNative = "";
String bufProg   = "";

void sendMsg(const String& msg) {
  Serial.println(msg);
  SerialUSB.println(msg);
}

float medirDistancia() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(5);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  long dur = pulseIn(PIN_ECHO, HIGH, 30000);
  if (dur <= 0) return -1.0;
  return dur * 0.034 / 2.0;
}

void procesar(String line) {
  line.trim();
  if (line.length() == 0) return;
  line.toUpperCase();

  if (line == "PING") { sendMsg("PONG"); return; }
  if (line == "STOP") {
    digitalWrite(PIN_LUZ1, LOW);
    digitalWrite(PIN_LUZ2, LOW);
    srv180.write(90);
    srvCont.write(90);
    sendMsg("OK STOP");
    return;
  }
  if (line == "DIST?") {
    float d = medirDistancia();
    if (d < 0) sendMsg("DIST:ERR");
    else       sendMsg("DIST:" + String(d, 1));
    return;
  }

  int sep = line.indexOf(':');
  if (sep < 0) { sendMsg("ERR formato"); return; }
  String cmd = line.substring(0, sep);
  String val = line.substring(sep + 1);

  if (cmd == "LUZ1") {
    if (val == "ON")       { digitalWrite(PIN_LUZ1, LOW);  sendMsg("OK LUZ1 ON"); }   // active-low
    else if (val == "OFF") { digitalWrite(PIN_LUZ1, HIGH); sendMsg("OK LUZ1 OFF"); }
    else                    sendMsg("ERR LUZ1");
  } else if (cmd == "LUZ2") {
    if (val == "ON")       { digitalWrite(PIN_LUZ2, LOW);  sendMsg("OK LUZ2 ON"); }   // active-low
    else if (val == "OFF") { digitalWrite(PIN_LUZ2, HIGH); sendMsg("OK LUZ2 OFF"); }
    else                    sendMsg("ERR LUZ2");
  } else if (cmd == "SERVO") {
    int a = val.toInt();
    if (a >= 0 && a <= 180) { srv180.write(a);  sendMsg("OK SERVO " + String(a)); }
    else                     sendMsg("ERR SERVO rango");
  } else if (cmd == "MOTOR") {
    int a = val.toInt();
    if (a >= 0 && a <= 180) { srvCont.write(a); sendMsg("OK MOTOR " + String(a)); }
    else                     sendMsg("ERR MOTOR rango");
  } else if (cmd == "LCD") {
    lcd.setCursor(0, 0);
    lcd.print(val);
    sendMsg("OK LCD");
  } else if (cmd == "LCD2") {
    lcd.setCursor(0, 1);
    lcd.print(val);
    sendMsg("OK LCD2");
  } else if (cmd == "LCDCLR") {
    lcd.clear();
    sendMsg("OK LCDCLR");
  } else {
    sendMsg("ERR cmd:" + cmd);
  }
}

void handleStream(Stream& port, String& buffer) {
  while (port.available()) {
    char c = port.read();
    if (c == '\n' || c == '\r') {
      if (buffer.length() > 0) {
        procesar(buffer);
        buffer = "";
      }
    } else {
      buffer += c;
      if (buffer.length() > 128) buffer = ""; // anti-desborde
    }
  }
}

void setup() {
  Serial.begin(115200);     // Programming port
  SerialUSB.begin(115200);  // Native USB

  pinMode(PIN_LUZ1, OUTPUT);
  pinMode(PIN_LUZ2, OUTPUT);
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  digitalWrite(PIN_LUZ1, HIGH);  // relé apagado (active-low)
  digitalWrite(PIN_LUZ2, HIGH);

  srv180.attach(PIN_SERVO);
  srv180.write(90);
  srvCont.attach(PIN_MOTOR);
  srvCont.write(90);  // motor continuo detenido

  // Inicializar LCD I2C
  Wire.begin();  // SDA=20, SCL=21 en DUE
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("DomoticaMaster");
  lcd.setCursor(0, 1);
  lcd.print("Listo");

  delay(200);
  sendMsg("DomoticaMaster listo");
}

void loop() {
  handleStream(Serial,    bufProg);
  handleStream(SerialUSB, bufNative);
}
```

Luego cárgalo al DUE con tu script habitual:

```bash
cd /home/pi/Arduino
./upload_arduinoDUE.sh DomoticaMaster
```

Verifica con el monitor serial (115200) enviando `PING` — debe responder `PONG`.

---

## 2. Bridge HTTP — `arduino_bridge.py`

Este daemon mantiene el puerto serial abierto y expone un mini-servidor HTTP en
`127.0.0.1:8765`. Así la app puede mandar comandos con un simple `curl`.

```bash
sudo tee /home/pi/arduino_bridge.py > /dev/null <<'PYEOF'
#!/usr/bin/env python3
"""
Bridge HTTP → Serial para el Arduino de domótica.
Expone:
  GET  /status            → {"port": "...", "open": true, "last_error": null}
  POST /cmd  (body texto) → ejecuta comando y devuelve respuesta (text/plain)
  GET  /read?timeout=0.5  → devuelve lo que haya llegado del Arduino
"""
import json
import threading
import time
import glob
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from collections import deque

import serial
from serial.tools import list_ports

PORT_HINTS = ("/dev/ttyACM", "/dev/ttyUSB")
BAUD = 115200
HOST = "127.0.0.1"
HTTP_PORT = 8765

ser_lock = threading.Lock()
ser = None
current_port = None
last_error = None
rx_buffer = deque(maxlen=200)  # últimas líneas recibidas (spontaneous logs)

def detect_port():
    for p in list_ports.comports():
        if p.device.startswith(PORT_HINTS):
            return p.device
    matches = []
    for h in PORT_HINTS:
        matches += glob.glob(h + "*")
    return matches[0] if matches else None

def open_serial():
    global ser, current_port, last_error
    port = detect_port()
    if not port:
        last_error = "no serial device found"
        return False
    try:
        s = serial.Serial(port, BAUD, timeout=0.3)
        time.sleep(2.0)  # esperar reset del DUE al primer open
        try: s.reset_input_buffer()
        except: pass
        ser = s
        current_port = port
        last_error = None
        return True
    except Exception as e:
        last_error = f"open {port}: {e}"
        return False

def bg_reader():
    """Hilo que lee líneas espontáneas del Arduino y las mete en rx_buffer."""
    while True:
        time.sleep(0.05)
        with ser_lock:
            if ser is None or not ser.is_open:
                continue
            try:
                n = ser.in_waiting
            except Exception:
                continue
            if not n:
                continue
            try:
                data = ser.read(n)
            except Exception:
                continue
        # procesar fuera del lock
        for line in data.split(b"\n"):
            line = line.strip()
            if line:
                try: rx_buffer.append(line.decode("utf-8", "replace"))
                except: pass

def send_cmd(cmd: str, wait_s: float = 0.6) -> str:
    """Envía comando, lee respuestas hasta wait_s, devuelve texto."""
    global last_error
    cmd = cmd.strip()
    if not cmd:
        return ""
    with ser_lock:
        if ser is None or not ser.is_open:
            if not open_serial():
                raise RuntimeError(last_error or "serial not open")
        try:
            ser.reset_input_buffer()
            ser.write((cmd + "\n").encode("utf-8"))
            ser.flush()
        except Exception as e:
            last_error = f"write: {e}"
            try: ser.close()
            except: pass
            raise

        end = time.time() + wait_s
        out = b""
        while time.time() < end:
            try:
                chunk = ser.read(64)
            except Exception:
                break
            if chunk:
                out += chunk
                if out.endswith(b"\n"):
                    # seguimos unos ms más por si vienen varias líneas
                    end = min(end, time.time() + 0.1)
            else:
                time.sleep(0.02)
    return out.decode("utf-8", "replace").strip()

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a, **kw): pass

    def _send(self, code, body, ctype="text/plain; charset=utf-8"):
        b = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path.startswith("/status"):
            info = {
                "port": current_port,
                "open": ser is not None and getattr(ser, "is_open", False),
                "last_error": last_error,
                "rx_lines": len(rx_buffer),
            }
            return self._send(200, json.dumps(info), "application/json")
        if self.path.startswith("/read"):
            lines = list(rx_buffer)
            rx_buffer.clear()
            return self._send(200, "\n".join(lines))
        return self._send(404, "not found")

    def do_POST(self):
        if self.path != "/cmd":
            return self._send(404, "not found")
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length).decode("utf-8", "replace").strip()
        try:
            resp = send_cmd(body, wait_s=0.8)
            return self._send(200, resp)
        except Exception as e:
            return self._send(500, f"ERR {e}")

def main():
    open_serial()
    threading.Thread(target=bg_reader, daemon=True).start()
    httpd = ThreadingHTTPServer((HOST, HTTP_PORT), Handler)
    print(f"[arduino-bridge] escuchando en http://{HOST}:{HTTP_PORT}  serial={current_port}")
    httpd.serve_forever()

if __name__ == "__main__":
    main()
PYEOF

sudo chmod +x /home/pi/arduino_bridge.py
```

Instala pyserial si falta:

```bash
sudo apt install -y python3-serial
```

---

## 3. Servicio systemd — `arduino-bridge.service`

```bash
sudo tee /etc/systemd/system/arduino-bridge.service > /dev/null <<'EOF'
[Unit]
Description=Arduino Domotica bridge (HTTP → Serial)
After=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 /home/pi/arduino_bridge.py
Restart=on-failure
RestartSec=3
User=pi
# El usuario 'pi' ya suele estar en dialout; si no, añadirlo:
#   sudo usermod -aG dialout pi
# y reiniciar sesión.

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now arduino-bridge.service
```

## 4. Verificación rápida

```bash
# Estado del bridge
curl -s http://127.0.0.1:8765/status

# Debe devolver: {"port": "/dev/ttyACM0", "open": true, ...}

# Ping al Arduino
curl -s -X POST http://127.0.0.1:8765/cmd -d 'PING'
# → PONG

# Encender bombillo 1
curl -s -X POST http://127.0.0.1:8765/cmd -d 'LUZ1:ON'
# → OK LUZ1 ON

# Medir distancia
curl -s -X POST http://127.0.0.1:8765/cmd -d 'DIST?'
# → DIST:12.4

# Detener todo
curl -s -X POST http://127.0.0.1:8765/cmd -d 'STOP'
```

Si `/status` devuelve `"open": false` y `last_error` indica `Permission denied`,
añade el usuario al grupo `dialout`:

```bash
sudo usermod -aG dialout pi
sudo systemctl restart arduino-bridge
```

## 5. Cableado LCD I2C

El sketch usa una pantalla LCD 16x2 con adaptador I2C. Conecta así:

| LCD I2C | Arduino DUE | Descripción |
|---------|-------------|-------------|
| VCC     | 5V          | Alimentación |
| GND     | GND         | Tierra |
| SDA     | Pin 20      | Datos I2C |
| SCL     | Pin 21      | Reloj I2C |

**Dirección I2C**: La mayoría de LCDs I2C usan `0x27`. Si tu pantalla no responde, escanea la dirección:

```bash
# Instalar i2c-tools si no está
sudo apt install -y i2c-tools

# Escanear bus I2C del DUE
sudo i2cdetect -y 1  # o i2cdetect -y 0 según el bus
```

Si la dirección es diferente a `0x27`, cambia esta línea en el sketch:

```cpp
LiquidCrystal_I2C lcd(0x27, 16, 2);  // cambia 0x27 por tu dirección
```

## 6. Logs

```bash
sudo journalctl -u arduino-bridge -f
```

---

## Protocolo de comandos (referencia rápida)

| Comando         | Respuesta            | Descripción                       |
|-----------------|----------------------|-----------------------------------|
| `PING`          | `PONG`               | Test de conectividad              |
| `LUZ1:ON`       | `OK LUZ1 ON`         | Enciende bombillo 1 (pin 46)      |
| `LUZ1:OFF`      | `OK LUZ1 OFF`        | Apaga bombillo 1                  |
| `LUZ2:ON/OFF`   | `OK LUZ2 ...`        | Bombillo 2 (pin 48)               |
| `SERVO:90`      | `OK SERVO 90`        | Servo 180° (pin 2), ángulo 0-180  |
| `MOTOR:90`      | `OK MOTOR 90`        | Motor continuo (pin 3). 90 = stop |
| `DIST?`         | `DIST:12.4`          | Distancia HC-SR04 en cm           |
| `LCD:texto`     | `OK LCD`             | Muestra texto en línea 1 del LCD  |
| `LCD2:texto`    | `OK LCD2`            | Muestra texto en línea 2 del LCD  |
| `LCDCLR`        | `OK LCDCLR`          | Limpia la pantalla LCD            |
| `STOP`          | `OK STOP`            | Apaga luces y detiene motores     |
