"""Parche de handlers.py (practicas-linux-api): entrega de media con soporte de `Range` (streaming por trozos).

- Sin Range: 200 con el archivo completo, pero leido por trozos (antes se cargaba entero en memoria).
- `Range: bytes=a-b`, `bytes=a-`, `bytes=-n`: 206 Partial Content con Content-Range.
- Rango fuera del archivo: 416.  Varios rangos a la vez o formato raro: se ignora y va 200 completo.
- Si el cliente corta la conexion a mitad (cerro el video), se ignora el error en vez de llenar el log.
Uso: python3 parche_range.py [ruta de handlers.py]   (idempotente)
"""
import sys

RUTA = sys.argv[1] if len(sys.argv) > 1 else "/opt/practicas-linux-api/handlers.py"
s = open(RUTA, encoding="utf-8").read()

if "RANGE_RE" in s:
    print("ya parchado")
    raise SystemExit(0)

ancla = 'MEDIA_FROM_PATH = re.compile(r"^/practices/([a-zA-Z0-9_-]+)/media/(.+)$")\n'
assert ancla in s, "no se encontro MEDIA_FROM_PATH"
s = s.replace(ancla, ancla + 'RANGE_RE = re.compile(r"^bytes=(\\d*)-(\\d*)$")\nCHUNK = 64 * 1024\n', 1)

ini = s.index("    def _send_file(self, path):")
fin = s.index("    def log_message(self, fmt, *args):")
nuevo = '''    def _send_file(self, path):
        mime, _ = mimetypes.guess_type(str(path))
        mime = mime or "application/octet-stream"
        size = path.stat().st_size
        start, end, status = 0, size - 1, 200

        rango = self.headers.get("Range")
        m = RANGE_RE.match(rango.strip()) if rango else None
        if m and (m.group(1) != "" or m.group(2) != ""):
            a, b = m.group(1), m.group(2)
            if a == "":  # sufijo: los ultimos N bytes
                start, end = max(0, size - int(b)), size - 1
            else:
                start = int(a)
                end = min(int(b), size - 1) if b != "" else size - 1
            if size == 0 or start >= size or start > end:
                self.send_response(416)
                self.send_header("Content-Range", "bytes */%d" % size)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            status = 206

        largo = end - start + 1 if size else 0
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(largo))
        if status == 206:
            self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        self.end_headers()
        try:
            with open(str(path), "rb") as f:
                f.seek(start)
                restante = largo
                while restante > 0:
                    trozo = f.read(min(CHUNK, restante))
                    if not trozo:
                        break
                    self.wfile.write(trozo)
                    restante -= len(trozo)
        except (BrokenPipeError, ConnectionResetError):
            pass  # el cliente cerro el video a mitad: no es un error

'''
s = s[:ini] + nuevo + s[fin:]
open(RUTA, "w", encoding="utf-8").write(s)
print("parchado")
