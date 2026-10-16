#!/bin/bash
# Migra el broker único (nvr-broker) a los brokers separados. Se ejecuta EN LA Pi, con las 5 carpetas ya copiadas a
# /opt/laboremoto-brokers (ver README.md). No imprime secretos. Si algo falla tras apagar el broker antiguo, lo vuelve a
# encender solo. Uso: bash desplegar.sh   (DRY=1 solo comprueba y genera nada)
set -euo pipefail

BASE=/opt/laboremoto-brokers
ETC=/etc/laboremoto-brokers
VIEJO=nvr-broker
NUEVOS="broker-camaras broker-sesiones broker-moodle broker-gateway"
DRY=${DRY:-0}
STAMP=$(date +%Y%m%d%H%M%S)

paso() { echo; echo "== $*"; }
falla() { echo "ERROR: $*" >&2; exit 1; }
codigo() { curl -s -o /dev/null -m 8 -w '%{http_code}' "$@" || echo 000; }

paso "1/7 Comprobaciones"
for d in broker-comun broker-camaras broker-sesiones broker-moodle broker-gateway; do [ -f "$BASE/$d/$( [ $d = broker-comun ] && echo auth.js || echo server.js)" ] || falla "falta $BASE/$d"; done
node -v | grep -qE '^v(1[89]|[2-9][0-9])' || falla "se necesita Node 18 o superior"
systemctl is-active --quiet "$VIEJO" || falla "$VIEJO no esta activo: no hay nada que migrar (o ya se migro)"
for p in 8092 8093 8094; do ss -ltn | grep -q ":$p " && falla "el puerto $p ya esta en uso"; done
PID=$(systemctl show -p MainPID --value "$VIEJO"); [ "${PID:-0}" -gt 0 ] || falla "no encuentro el proceso de $VIEJO"
echo "ok (broker actual PID $PID)"
[ "$DRY" = 1 ] && { echo "(DRY=1: no se cambia nada)"; exit 0; }

paso "2/7 Configuracion de cada servicio, tomada del proceso en ejecucion (solo se listan nombres de variables)"
sudo mkdir -p "$ETC" "$BASE/data"; sudo chown pi:pi "$BASE/data"
sudo node - "$PID" "$BASE" "$ETC" <<'JS'
const fs = require('fs');
const [, , pid, base, etc] = process.argv;
const env = {};
for (const kv of fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0')) { const i = kv.indexOf('='); if (i > 0) env[kv.slice(0, i)] = kv.slice(i + 1); }
const q = (v) => (v.includes("'") || v.includes('\n') ? v : `'${v}'`); // comillas simples: systemd las quita y deja el JSON intacto
const pick = (keys, extra) => { const o = { ...extra }; for (const k of keys) if (env[k] !== undefined) o[k] = env[k]; return o; };
const KC = ['KEYCLOAK_JWKS_URL', 'KEYCLOAK_ISSUER'];
const archivos = {
  camaras: pick([...KC, 'SHINOBI_API_KEY', 'SHINOBI_LOCAL_PORT', 'PTZ_CAMERAS_JSON', 'WEBRTC_PATHS_JSON', 'MEDIAMTX_WEBRTC_PORT'], { PORT: '8092' }),
  sesiones: pick([...KC, 'IPINFO_TOKEN', ...Object.keys(env).filter((k) => k.startsWith('SESIONES_'))], { PORT: '8093' }),
  moodle: pick(KC, { PORT: '8094' }), // sin MOODLE_URL/MOODLE_TOKEN: responde 503 hasta configurarlo
  gateway: { PORT: '8091', UPSTREAM_CAMARAS: 'http://127.0.0.1:8092', UPSTREAM_SESIONES: 'http://127.0.0.1:8093', UPSTREAM_MOODLE: 'http://127.0.0.1:8094' },
};
archivos.sesiones.SESIONES_FILE = `${base}/data/sesiones.jsonl`;
for (const [n, o] of Object.entries(archivos)) {
  fs.writeFileSync(`${etc}/${n}.env`, Object.entries(o).map(([k, v]) => `${k}=${q(String(v))}`).join('\n') + '\n', { mode: 0o600 });
  console.log(`  ${n}.env: ${Object.keys(o).join(', ')}`);
}
JS
sudo chown root:root "$ETC"/*.env; sudo chmod 600 "$ETC"/*.env

paso "3/7 Unidades de systemd"
for s in $NUEVOS; do sudo install -m 644 "$BASE/$s/$s.service" "/etc/systemd/system/$s.service"; done
sudo systemctl daemon-reload

revertir() {
  echo "!! Falla: volviendo al broker anterior" >&2
  sudo systemctl stop broker-gateway broker-sesiones broker-moodle broker-camaras 2>/dev/null || true
  sudo systemctl start "$VIEJO" || true
  sleep 2
  echo "   $VIEJO: $(systemctl is-active $VIEJO)" >&2
}

paso "4/7 Arranque de camaras y moodle (no chocan con nada) y prueba previa de la puerta de entrada en un puerto temporal"
sudo systemctl start broker-camaras broker-moodle
sleep 3
for s in broker-camaras broker-moodle; do systemctl is-active --quiet $s || { journalctl -u $s -n 15 --no-pager >&2; sudo systemctl stop broker-camaras broker-moodle; falla "$s no arranco"; }; done
( PORT=18091 UPSTREAM_CAMARAS=http://127.0.0.1:8092 UPSTREAM_SESIONES=http://127.0.0.1:8093 UPSTREAM_MOODLE=http://127.0.0.1:8094   exec node "$BASE/broker-gateway/server.js" >/tmp/gateway-prueba.log 2>&1 ) &
TMP=$!; sleep 2
P1=$(codigo -X POST http://127.0.0.1:18091/nvr/ptz/x/y); P2=$(codigo http://127.0.0.1:18091/nvr/moodle/cursos); P3=$(codigo http://127.0.0.1:18091/nvr/nada)
kill $TMP 2>/dev/null || true
echo "  ptz sin token: $P1 (esperado 401) | moodle sin token: $P2 (esperado 401) | ruta inexistente: $P3 (esperado 404)"
if [ "$P1" != 401 ] || [ "$P2" != 401 ] || [ "$P3" != 404 ]; then sudo systemctl stop broker-camaras broker-moodle; falla "la prueba previa no dio lo esperado (el broker anterior sigue intacto)"; fi

paso "5/7 Corte: se apaga el broker anterior y se encienden sesiones y la puerta de entrada (segundos)"
sudo systemctl stop "$VIEJO"
[ -f /opt/nvr-broker/sesiones.jsonl ] && cp -p /opt/nvr-broker/sesiones.jsonl "$BASE/data/sesiones.jsonl" || true
sudo systemctl start broker-sesiones broker-gateway
sleep 3

paso "6/7 Verificacion en el puerto 8091"
G1=$(codigo -X POST http://127.0.0.1:8091/nvr/ptz/x/y); G2=$(codigo -X POST http://127.0.0.1:8091/nvr/sesiones/evento); G3=$(codigo http://127.0.0.1:8091/nvr/moodle/cursos); G4=$(codigo http://127.0.0.1:8091/nvr/monitor/x)
echo "  ptz: $G1 | sesiones: $G2 | moodle: $G3 | monitor: $G4 (todos esperados 401)"
ACTIVOS=1; for s in $NUEVOS; do systemctl is-active --quiet $s || { echo "  $s NO esta activo" >&2; ACTIVOS=0; }; done
if [ "$G1$G2$G3$G4" != "401401401401" ] || [ $ACTIVOS = 0 ]; then revertir; falla "la verificacion final fallo; se restauro $VIEJO"; fi

paso "7/7 Arranque automatico: se activan los nuevos y se desactiva el antiguo (su carpeta y unidad quedan para volver atras)"
sudo systemctl enable $NUEVOS >/dev/null 2>&1
sudo systemctl disable "$VIEJO" >/dev/null 2>&1 || true
for s in $NUEVOS "$VIEJO"; do echo "  $s: activo=$(systemctl is-active $s) arranque=$(systemctl is-enabled $s)"; done
echo; echo "Listo. Volver atras: sudo systemctl stop $NUEVOS && sudo systemctl enable $VIEJO && sudo systemctl start $VIEJO"
