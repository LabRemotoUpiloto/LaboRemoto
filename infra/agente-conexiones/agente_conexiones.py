#!/usr/bin/env python3
"""agente-conexiones — avisa al servidor de cada conexión SSH a ESTE dispositivo, desde que arranca (sin historial).

Lee el registro de acceso (auth.log) en vivo y manda al broker un evento por cada entrada y salida de una sesión SSH con
contraseña (las cuentas institucionales entran así; las entradas con llave son del personal y no se cuentan, igual que en
RegistroExcel.sh). Cada 30 s manda un «latido» con las sesiones que siguen abiertas: así el servidor sabe que el dispositivo
está en línea y cierra solo las sesiones que se quedaron sin cerrar. NO toca el flujo del Excel/Teams.

Seguridad: corre como usuario normal (en el grupo `adm` para leer auth.log), solo habla con el broker local y se identifica
con un token propio del dispositivo (CONEXIONES_TOKEN). No guarda nada en disco.

Compatible con Python 3.7 (la Pi4 tiene Debian 10). Variables (archivo de entorno del servicio):
  CONEXIONES_DISPOSITIVO  id del dispositivo (pi4)            CONEXIONES_TOKEN  token compartido con el broker
  CONEXIONES_URL          http://127.0.0.1:8093/nvr/dispositivos/evento     CONEXIONES_LOG  /var/log/auth.log
"""
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

RE_ENTRADA = re.compile(r'sshd\[(\d+)\]: Accepted (?:password|keyboard-interactive(?:/pam)?) for (\S+) from (\S+) port \d+')
RE_SALIDA = re.compile(r'sshd\[(\d+)\]: pam_unix\(sshd:session\): session closed for user (\S+)')
LATIDO_CADA_S = 30
COLA_MAXIMA = 1000


def parsear_linea(linea):
    """Línea de auth.log -> {'tipo': 'entrada'|'salida', ...} o None si no es una entrada/salida SSH con contraseña."""
    m = RE_ENTRADA.search(linea)
    if m:
        return {'tipo': 'entrada', 'sesion': m.group(1), 'usuario': m.group(2), 'ip': m.group(3)}
    m = RE_SALIDA.search(linea)
    if m:
        return {'tipo': 'salida', 'sesion': m.group(1), 'usuario': m.group(2)}
    return None


class SeguirArchivo:
    """Como `tail -F` desde el final: no lee lo anterior y reabre el archivo si lo rotan."""

    def __init__(self, ruta):
        self.ruta = ruta
        self.f = None
        self.inodo = None
        self._abrir(al_final=True)

    def _abrir(self, al_final):
        try:
            self.f = open(self.ruta, 'r', encoding='utf-8', errors='replace')
            self.inodo = os.fstat(self.f.fileno()).st_ino
            if al_final:
                self.f.seek(0, os.SEEK_END)
        except OSError:
            self.f = None
            self.inodo = None

    def cerrar(self):
        if self.f is not None:
            self.f.close()
            self.f = None

    def lineas(self):
        """Líneas nuevas desde la última llamada."""
        if self.f is None:
            self._abrir(al_final=False)
            if self.f is None:
                return []
        out = []
        while True:
            pos = self.f.tell()
            linea = self.f.readline()
            if not linea:
                break
            if not linea.endswith('\n'):          # línea a medio escribir: se reintenta completa
                self.f.seek(pos)
                break
            out.append(linea.rstrip('\n'))
        try:
            st = os.stat(self.ruta)
            if st.st_ino != self.inodo or st.st_size < self.f.tell():   # rotado o truncado
                self.f.close()
                self._abrir(al_final=False)
                if self.f is not None:
                    out.extend(self.lineas())
        except OSError:
            pass
        return out


def sshd_vivo(pid, raiz='/proc'):
    try:
        with open('%s/%s/cmdline' % (raiz, pid), 'rb') as f:
            return f.read().startswith(b'sshd')
    except OSError:
        return False


class Agente:
    def __init__(self, dispositivo, leer_lineas, enviar, vivo=sshd_vivo, ahora=time.time):
        self.dispositivo = dispositivo
        self.leer_lineas = leer_lineas
        self.enviar = enviar          # enviar(dict) -> True si el servidor lo recibió
        self.vivo = vivo
        self.ahora = ahora
        self.abiertas = {}            # sesion -> usuario
        self.pendientes = []          # eventos que no se pudieron enviar (se reintentan)
        self._ultimo_latido = 0.0
        self.servidor_ok = None       # None = aún no se sabe

    def _hora(self):
        return dt.datetime.fromtimestamp(self.ahora(), dt.timezone.utc).isoformat()

    def _mandar(self, evento):
        evento['dispositivo'] = self.dispositivo
        evento['hora'] = self._hora()
        self.pendientes.append(evento)
        del self.pendientes[:-COLA_MAXIMA]

    def _vaciar(self):
        while self.pendientes:
            if not self.enviar(self.pendientes[0]):
                self._avisar_estado(False)
                return
            self.pendientes.pop(0)
        self._avisar_estado(True)

    def _avisar_estado(self, ok):
        """Una línea en el registro del servicio solo cuando cambia (conecta / pierde al servidor), no en cada latido."""
        if ok != self.servidor_ok:
            self.servidor_ok = ok
            print('agente-conexiones: servidor %s' % ('alcanzable' if ok else 'NO alcanzable (se reintenta)'), flush=True)

    def paso(self):
        """Una vuelta: procesa líneas nuevas, reintenta lo pendiente y manda el latido si toca."""
        for linea in self.leer_lineas():
            ev = parsear_linea(linea)
            if not ev:
                continue
            if ev['tipo'] == 'entrada':
                self.abiertas[ev['sesion']] = ev['usuario']
            elif ev['sesion'] in self.abiertas:
                self.abiertas.pop(ev['sesion'])
            else:
                continue                      # cierre de una sesión que no vimos abrir (sudo, llaves, anterior al arranque)
            self._mandar(ev)
        t = self.ahora()
        if t - self._ultimo_latido >= LATIDO_CADA_S:
            self._ultimo_latido = t
            # Solo se declaran abiertas las que siguen teniendo proceso sshd: las demás el servidor las cierra solo.
            self._mandar({'tipo': 'latido', 'abiertas': sorted(s for s in self.abiertas if self.vivo(s))})
        self._vaciar()


def enviador_http(url, token, timeout=5):
    def enviar(evento):
        req = urllib.request.Request(url, data=json.dumps(evento).encode('utf-8'), method='POST',
                                     headers={'Content-Type': 'application/json', 'X-Dispositivo-Token': token})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return 200 <= r.status < 300
        except urllib.error.HTTPError as e:
            return e.code in (400, 403, 404)      # el servidor lo rechazó a propósito: reintentar no sirve, se descarta
        except (urllib.error.URLError, OSError):
            return False
    return enviar


def main():
    dispositivo = os.environ.get('CONEXIONES_DISPOSITIVO', 'pi4')
    token = os.environ.get('CONEXIONES_TOKEN', '')
    url = os.environ.get('CONEXIONES_URL', 'http://127.0.0.1:8093/nvr/dispositivos/evento')
    ruta = os.environ.get('CONEXIONES_LOG', '/var/log/auth.log')
    if not token:
        print('Falta CONEXIONES_TOKEN', file=sys.stderr)
        return 1
    seguir = SeguirArchivo(ruta)
    agente = Agente(dispositivo, seguir.lineas, enviador_http(url, token))
    print('agente-conexiones: dispositivo=%s, siguiendo %s' % (dispositivo, ruta), flush=True)
    while True:
        try:
            agente.paso()
        except Exception as e:     # una vuelta fallida no debe matar al agente
            print('agente-conexiones: error: %s' % e, file=sys.stderr, flush=True)
        time.sleep(1)


if __name__ == '__main__':
    sys.exit(main())
