#!/usr/bin/env python3
"""Prueba de carga del servicio de practicas de Linux, simulando N alumnos a la vez.

Cada "alumno" hace lo mismo que la app (Cliente-Rust/backend/src/cmd/practices):
  1. abre UN tunel SSH con la cuenta de servicio (PRACTICE_LINUX_TUNNEL_*),
  2. por cada request abre un canal direct-tcpip nuevo hacia 127.0.0.1:8770, manda el HTTP y
     cierra el canal,
  3. carga la lista, el modulo y el video del modulo (como al abrir la practica),
  4. valida cada 5 s (sondeo) y simula comandos: --burst validaciones seguidas por comando
     (5 = comportamiento anterior de la app, 1 = despues de unificar las validaciones).

Mide: conexiones SSH rechazadas/lentas, latencia de cada tipo de request (p50/p95/max), tiempo de
bajada del video y errores. NUNCA imprime credenciales.

Las credenciales salen de variables de entorno o del .env (--env-file); PRACTICE_LINUX_TUNNEL_PASSWORD
y PRACTICE_LINUX_API_TOKEN no se escriben en ningun lado.

Ejemplos (correr FUERA del horario de clase: carga la Pi real):
  python loadtest.py --clients 5  --duration 30                # humo
  python loadtest.py --clients 35 --ramp 0  --burst 5          # peor caso: todos a la vez, app vieja
  python loadtest.py --clients 35 --ramp 60 --burst 1          # entrada escalonada, app nueva

Requiere: pip install paramiko
"""
import argparse
import json
import os
import socket
import statistics
import threading
import time

import paramiko


def cargar_env(ruta):
    if ruta and os.path.exists(ruta):
        for linea in open(ruta, encoding="utf-8"):
            linea = linea.strip()
            if not linea or linea.startswith("#") or "=" not in linea:
                continue
            k, v = linea.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


class Metricas:
    def __init__(self):
        self.lock = threading.Lock()
        self.lat = {}       # tipo -> [segundos]
        self.err = {}       # tipo -> [mensajes]
        self.conexion = []  # segundos de cada conexion SSH exitosa
        self.conexion_fallas = []
        self.bytes_video = 0

    def ok(self, tipo, seg):
        with self.lock:
            self.lat.setdefault(tipo, []).append(seg)

    def fallo(self, tipo, msg):
        with self.lock:
            self.err.setdefault(tipo, []).append(str(msg)[:120])


def pedir(transport, token, metodo, ruta, cuerpo=None, timeout=60):
    """Un request HTTP por un canal direct-tcpip nuevo, cerrado al terminar (como la app)."""
    datos = b"" if cuerpo is None else json.dumps(cuerpo).encode()
    cab = f"{metodo} {ruta} HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer {token}\r\nConnection: close\r\n"
    if cuerpo is not None:
        cab += f"Content-Type: application/json\r\nContent-Length: {len(datos)}\r\n"
    chan = transport.open_channel("direct-tcpip", ("127.0.0.1", 8770), ("127.0.0.1", 0), timeout=timeout)
    try:
        chan.settimeout(timeout)
        chan.sendall(cab.encode() + b"\r\n" + datos)
        partes = []
        while True:
            try:
                b = chan.recv(65536)
            except socket.timeout:
                raise TimeoutError("timeout leyendo respuesta")
            if not b:
                break
            partes.append(b)
        crudo = b"".join(partes)
    finally:
        try:
            chan.close()
        except Exception:
            pass
    cabecera, _, resto = crudo.partition(b"\r\n\r\n")
    linea = cabecera.split(b"\r\n", 1)[0].decode("latin1")
    estado = int(linea.split()[1]) if linea.startswith("HTTP/") else 0
    return estado, resto


def alumno(i, args, m, parar):
    host, puerto = os.environ["PRACTICE_LINUX_TUNNEL_HOST"], int(os.environ.get("PRACTICE_LINUX_TUNNEL_PORT", "22"))
    usuario, clave = os.environ["PRACTICE_LINUX_TUNNEL_USER"], os.environ["PRACTICE_LINUX_TUNNEL_PASSWORD"]
    token = os.environ["PRACTICE_LINUX_API_TOKEN"]
    time.sleep(args.ramp * i / max(1, args.clients))

    t0 = time.time()
    try:
        sock = socket.create_connection((host, puerto), timeout=15)
        tr = paramiko.Transport(sock)
        tr.banner_timeout = 15
        tr.set_keepalive(15)
        tr.start_client(timeout=15)
        tr.auth_password(usuario, clave)
    except Exception as e:
        with m.lock:
            m.conexion_fallas.append(f"{type(e).__name__}: {str(e)[:80]}")
        return
    with m.lock:
        m.conexion.append(time.time() - t0)

    def op(tipo, metodo, ruta, cuerpo=None):
        t = time.time()
        try:
            estado, cuerpo_resp = pedir(tr, token, metodo, ruta, cuerpo)
            if estado != 200:
                m.fallo(tipo, f"HTTP {estado}")
                return None
            m.ok(tipo, time.time() - t)
            return cuerpo_resp
        except Exception as e:
            m.fallo(tipo, f"{type(e).__name__}: {e}")
            return None

    try:
        op("lista", "GET", "/practices")
        crudo = op("modulo", "GET", f"/practices/{args.module}")
        if crudo and args.video:
            try:
                bloques = json.loads(crudo)["blocks"]
                video = next(b["file"] for b in bloques if b["type"] == "media" and b.get("kind") == "video")
                cuerpo = op("video", "GET", f"/practices/{args.module}/media/{video}")
                if cuerpo:
                    with m.lock:
                        m.bytes_video += len(cuerpo)
            except StopIteration:
                pass
        historial = ["whoami", "hostname", "uname -a"]
        siguiente_comando = time.time() + 8 + (i % 7)
        fin = time.time() + args.duration
        siguiente_sondeo = time.time() + 5
        while time.time() < fin and not parar.is_set():
            ahora = time.time()
            if ahora >= siguiente_comando:
                historial.append("date")
                for _ in range(args.burst):
                    op("validar", "POST", f"/practices/{args.module}/validate",
                       {"command_history": historial, "quiz_answers": {}})
                siguiente_comando = ahora + 20
            if ahora >= siguiente_sondeo:
                op("validar", "POST", f"/practices/{args.module}/validate",
                   {"command_history": historial, "quiz_answers": {}})
                siguiente_sondeo = ahora + 5
            time.sleep(0.2)
    finally:
        try:
            tr.close()
        except Exception:
            pass


def pct(v, p):
    v = sorted(v)
    return v[min(len(v) - 1, int(len(v) * p))]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--clients", type=int, default=35)
    ap.add_argument("--duration", type=int, default=90, help="segundos de sondeo despues de cargar")
    ap.add_argument("--ramp", type=float, default=0, help="segundos para repartir las conexiones (0 = todas juntas)")
    ap.add_argument("--burst", type=int, default=1, help="validaciones seguidas por comando (5 = app vieja)")
    ap.add_argument("--module", default="linux-m1")
    ap.add_argument("--no-video", dest="video", action="store_false")
    ap.add_argument("--env-file", default=os.path.join(os.path.dirname(__file__), "..", "..", "Cliente-Rust", "backend", ".env"))
    args = ap.parse_args()
    cargar_env(args.env_file)
    faltan = [k for k in ("PRACTICE_LINUX_TUNNEL_HOST", "PRACTICE_LINUX_TUNNEL_USER",
                          "PRACTICE_LINUX_TUNNEL_PASSWORD", "PRACTICE_LINUX_API_TOKEN") if not os.environ.get(k)]
    if faltan:
        raise SystemExit("Faltan variables: " + ", ".join(faltan))

    m, parar = Metricas(), threading.Event()
    hilos = [threading.Thread(target=alumno, args=(i, args, m, parar), daemon=True) for i in range(args.clients)]
    t0 = time.time()
    print(f"{args.clients} alumnos, ramp={args.ramp}s, burst={args.burst}, modulo={args.module}, duracion={args.duration}s")
    for h in hilos:
        h.start()
    try:
        for h in hilos:
            h.join()
    except KeyboardInterrupt:
        parar.set()
        print("interrumpido")
    total = time.time() - t0

    print(f"\n=== RESULTADO ({total:.0f}s) ===")
    print(f"conexiones SSH: {len(m.conexion)} ok, {len(m.conexion_fallas)} fallidas"
          + (f" | conexion p50={statistics.median(m.conexion):.2f}s p95={pct(m.conexion, .95):.2f}s max={max(m.conexion):.2f}s" if m.conexion else ""))
    for f in sorted(set(m.conexion_fallas)):
        print(f"   x{m.conexion_fallas.count(f)}  {f}")
    for tipo in ("lista", "modulo", "video", "validar"):
        v, e = m.lat.get(tipo, []), m.err.get(tipo, [])
        if v or e:
            linea = f"{tipo:8} ok={len(v):4} fallos={len(e):3}"
            if v:
                linea += f" | p50={statistics.median(v):.2f}s p95={pct(v, .95):.2f}s max={max(v):.2f}s"
            print(linea)
            for x in sorted(set(e))[:4]:
                print(f"   x{e.count(x)}  {x}")
    if m.bytes_video:
        print(f"video descargado en total: {m.bytes_video / 1e6:.0f} MB")
    malos = len(m.conexion_fallas) + sum(len(v) for v in m.err.values())
    print("\nVEREDICTO:", "SIN ERRORES" if malos == 0 else f"{malos} errores — revisar arriba")


if __name__ == "__main__":
    main()
