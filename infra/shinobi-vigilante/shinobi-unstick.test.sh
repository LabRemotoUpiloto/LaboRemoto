#!/usr/bin/env bash
# Pruebas de shinobi-unstick.sh con casos simulados (no reinicia nada: DRY_RUN=1, estado en una carpeta temporal).
# Uso: bash shinobi-unstick.test.sh [ruta/a/shinobi-unstick.sh]   (necesita jq y el .env del vigilante, o SHINOBI_* definidas)
set -uo pipefail

SCRIPT="${1:-$(dirname "$0")/shinobi-unstick.sh}"
export STATE_DIR="$(mktemp -d)" DRY_RUN=1
export SHINOBI_HOST="${SHINOBI_HOST:-http://127.0.0.1:1}" SHINOBI_API_KEY="${SHINOBI_API_KEY:-x}" SHINOBI_GROUP_KEY="${SHINOBI_GROUP_KEY:-g}"
export ENV_FILE=/dev/null
trap 'rm -rf "$STATE_DIR"' EXIT

SANO='[{"mid":"a","mode":"start","status":"Watching","host":"1.1.1.1","port":"554"}]'
TRABADO='[{"mid":"a","mode":"start","host":"1.1.1.1","port":"554"},{"mid":"b","mode":"start","status":null,"host":"1.1.1.2","port":"554"}]'
APAGADO='[{"mid":"a","mode":"stop"}]'

fallos=0
# run <json> <ffmpeg> <alcanzables> -> imprime la salida del script
run() { TEST_MONITORS_JSON="$1" TEST_FFMPEG_COUNT="$2" TEST_REACHABLE="$3" bash "$SCRIPT" 2>&1; }
contador() { cat "$STATE_DIR/unstick.count" 2>/dev/null || echo 0; }
check() { # descripcion, condicion (0=ok)
  if [[ "$2" == 0 ]]; then echo "  ok   $1"; else echo "  FALLA $1"; fallos=$((fallos + 1)); fi
}

echo "1) todo sano: no cuenta"
run "$SANO" 2 1 >/dev/null; [[ "$(contador)" == 0 ]]; check "contador en 0" $?

echo "2) trabado: cuenta 1, 2 y actua a la 3a"
out1="$(run "$TRABADO" 0 1)"; [[ "$(contador)" == 1 && "$out1" != *pm2* ]]; check "1a vez cuenta 1 y no actua" $?
out2="$(run "$TRABADO" 0 1)"; [[ "$(contador)" == 2 && "$out2" != *pm2* ]]; check "2a vez cuenta 2 y no actua" $?
out3="$(run "$TRABADO" 0 1)"; [[ "$out3" == *"pm2 restart shinobi"* ]]; check "3a vez decide reiniciar (DRY_RUN)" $?

echo "3) cooldown: justo despues de reiniciar no vuelve a actuar"
date +%s > "$STATE_DIR/unstick.last_restart"; rm -f "$STATE_DIR/unstick.count"
run "$TRABADO" 0 1 >/dev/null; run "$TRABADO" 0 1 >/dev/null; out="$(run "$TRABADO" 0 1)"
[[ "$out" == *"se espera"* && "$out" != *"pm2 restart"* ]]; check "espera por el cooldown" $?
echo $(( $(date +%s) - 3600 )) > "$STATE_DIR/unstick.last_restart"
out="$(run "$TRABADO" 0 1)"; [[ "$out" == *"pm2 restart shinobi"* ]]; check "pasado el cooldown vuelve a actuar" $?

echo "4) todas las camaras apagadas (no es culpa de Shinobi): no cuenta"
rm -rf "$STATE_DIR"/*; for _ in 1 2 3; do run "$TRABADO" 0 0 >/dev/null; done
[[ "$(contador)" == 0 ]]; check "contador en 0" $?

echo "5) hay ffmpeg corriendo: no cuenta"
run "$TRABADO" 1 1 >/dev/null; [[ "$(contador)" == 0 ]]; check "contador en 0" $?

echo "6) se recupera a mitad de camino: el contador se reinicia"
run "$TRABADO" 0 1 >/dev/null; run "$TRABADO" 0 1 >/dev/null; run "$SANO" 2 1 >/dev/null
[[ "$(contador)" == 0 ]]; check "contador vuelve a 0" $?

echo "7) monitores detenidos a proposito: no cuenta"
run "$APAGADO" 0 1 >/dev/null; [[ "$(contador)" == 0 ]]; check "contador en 0" $?

echo
if [[ $fallos -eq 0 ]]; then echo "TODO OK"; else echo "$fallos prueba(s) fallaron"; exit 1; fi
