#!/usr/bin/env bash
# Destraba Shinobi cuando queda "online" pero sin transmitir nada.
#
# El vigilante existente (shinobi-watchdog) reinicia monitores uno por uno con la API de Shinobi, pero si Shinobi
# mismo está trabado esa API responde y no hace nada (visto tras reiniciar la Pi4: 0 procesos ffmpeg y todos los
# monitores sin estado, durante más de un día). Este script detecta ese caso y reinicia el proceso (pm2).
#
# Se considera trabado SOLO si, durante UNSTICK_MINUTES consecutivos, se cumple todo a la vez:
#   - ningún monitor activo está en Watching/Recording,
#   - no hay ningún proceso ffmpeg,
#   - al menos una cámara activa responde en su puerto (si todas están apagadas no es culpa de Shinobi).
# Después de reiniciar espera COOLDOWN_MIN minutos antes de volver a hacerlo, para no entrar en bucle.
# Pensado para un systemd timer cada minuto (ver shinobi-unstick.timer). Reusa el .env del vigilante existente.
set -euo pipefail

ENV_FILE="${ENV_FILE:-/home/pi/shinobi-watchdog/.env}"
STATE_DIR="${STATE_DIR:-/var/lib/shinobi-watchdog}"
LOG_TAG="shinobi-unstick"
PM2_BIN="${PM2_BIN:-/opt/node18/lib/node_modules/pm2/bin/pm2}"
UNSTICK_MINUTES="${UNSTICK_MINUTES:-3}"
COOLDOWN_MIN="${COOLDOWN_MIN:-30}"
DRY_RUN="${DRY_RUN:-0}"

# shellcheck disable=SC1090
[[ -f "$ENV_FILE" ]] && source "$ENV_FILE"
: "${SHINOBI_HOST:?falta SHINOBI_HOST en $ENV_FILE}"
: "${SHINOBI_API_KEY:?falta SHINOBI_API_KEY en $ENV_FILE}"
: "${SHINOBI_GROUP_KEY:?falta SHINOBI_GROUP_KEY en $ENV_FILE}"

command -v jq >/dev/null 2>&1 || { echo "falta jq" >&2; exit 1; }
mkdir -p "$STATE_DIR"
log() { logger -t "$LOG_TAG" -- "$*" 2>/dev/null || true; echo "[$LOG_TAG] $*"; }

COUNT_FILE="$STATE_DIR/unstick.count"
LAST_FILE="$STATE_DIR/unstick.last_restart"
reset() { rm -f "$COUNT_FILE"; }

# Entradas sobreescribibles solo para pruebas.
if [[ -n "${TEST_MONITORS_JSON:-}" ]]; then
  monitors_json="$TEST_MONITORS_JSON"
else
  monitors_json="$(curl -fsS -m 8 "${SHINOBI_HOST}/${SHINOBI_API_KEY}/monitor/${SHINOBI_GROUP_KEY}")" \
    || { log "no se pudo consultar Shinobi (no se hace nada)"; exit 0; }
fi

activos="$(echo "$monitors_json" | jq -c '[.[] | select((.mode // "start") != "stop")]')"
if [[ "$(echo "$activos" | jq 'length')" -eq 0 ]]; then reset; exit 0; fi

sanos="$(echo "$activos" | jq '[.[] | select((.status // "") | test("^(Watching|Recording)$"))] | length')"
procs="${TEST_FFMPEG_COUNT:-$(pgrep -c ffmpeg || true)}"

if [[ -n "${TEST_REACHABLE:-}" ]]; then
  alcanzables="$TEST_REACHABLE"
else
  alcanzables=0
  while read -r hp; do
    host="${hp%%:*}"; port="${hp##*:}"
    [[ -n "$host" && "$port" =~ ^[0-9]+$ ]] || continue
    timeout 2 bash -c "</dev/tcp/$host/$port" 2>/dev/null && alcanzables=$((alcanzables + 1))
  done < <(echo "$activos" | jq -r '.[] | "\(.host // ""):\(.port // "")"')
fi

if [[ "$sanos" -gt 0 || "$procs" -gt 0 || "$alcanzables" -eq 0 ]]; then
  reset
  exit 0
fi

n=$(( $(cat "$COUNT_FILE" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$COUNT_FILE"
log "Shinobi sin transmitir: 0 monitores sanos, 0 ffmpeg, $alcanzables camara(s) alcanzable(s) ($n/$UNSTICK_MINUTES)"
[[ "$n" -ge "$UNSTICK_MINUTES" ]] || exit 0

now="$(date +%s)"
if [[ -f "$LAST_FILE" ]] && (( now - $(cat "$LAST_FILE") < COOLDOWN_MIN * 60 )); then
  log "ya se reinicio hace menos de ${COOLDOWN_MIN} min; se espera"
  exit 0
fi

if [[ "$DRY_RUN" == 1 ]]; then log "DRY_RUN: aqui se ejecutaria 'pm2 restart shinobi'"; exit 0; fi
log "reiniciando Shinobi (pm2 restart shinobi)"
if "$PM2_BIN" restart shinobi >/dev/null 2>&1; then
  echo "$now" > "$LAST_FILE"; reset
  log "Shinobi reiniciado"
else
  log "ERROR: pm2 restart fallo"
fi
