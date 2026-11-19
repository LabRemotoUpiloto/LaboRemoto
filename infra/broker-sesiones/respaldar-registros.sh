#!/bin/sh
# infra/broker-sesiones/respaldar-registros.sh — copia diaria de los registros de la terminal de las prácticas.
#
# Deja una carpeta por día en RESPALDOS_DIR/AAAA-MM-DD con todo lo de REGISTROS_DIR (el índice registros.jsonl y la carpeta
# de cada estudiante). Los archivos que no cambiaron entre un día y otro son enlaces duros al del día anterior (rsync
# --link-dest), así que cada día solo ocupa lo nuevo. Se conservan los últimos DIAS_GUARDAR días.
#
# Protege contra un borrado o un bug del broker; NO contra la pérdida del disco ni contra quien entre a la Pi: para eso
# hace falta una copia en otro equipo (ver el README de esta carpeta).
#
# Los registros llevan nombres de estudiantes: todo se crea con permisos 700/600.
#
# Variables (todas opcionales):
#   REGISTROS_DIR   origen   (por defecto /opt/laboremoto-brokers/data/registros)
#   RESPALDOS_DIR   destino  (por defecto /opt/laboremoto-brokers/data/respaldos)
#   DIAS_GUARDAR    cuántos días de copias se conservan (por defecto 14)
set -eu
umask 077

ORIGEN="${REGISTROS_DIR:-/opt/laboremoto-brokers/data/registros}"
DESTINO="${RESPALDOS_DIR:-/opt/laboremoto-brokers/data/respaldos}"
GUARDAR="${DIAS_GUARDAR:-14}"

log() { logger -t respaldo-registros -- "$*" 2>/dev/null || true; echo "$*"; }

case "$GUARDAR" in ''|*[!0-9]*|0) log "DIAS_GUARDAR inválido: $GUARDAR"; exit 2 ;; esac
[ -d "$ORIGEN" ] || { log "no existe el origen: $ORIGEN"; exit 1; }

mkdir -p "$DESTINO"
chmod 700 "$DESTINO"

HOY=$(date +%F)
NUEVO="$DESTINO/$HOY"
TEMPORAL="$DESTINO/.$HOY.en-curso"

# La copia más reciente que ya existe (sin contar la de hoy), para reutilizar sus archivos.
PREVIA=$(ls -1 "$DESTINO" | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' | grep -v "^$HOY\$" | tail -n 1 || true)

rm -rf "$TEMPORAL"
if [ -n "$PREVIA" ]; then
  rsync -a --link-dest="$DESTINO/$PREVIA" "$ORIGEN/" "$TEMPORAL/"
else
  rsync -a "$ORIGEN/" "$TEMPORAL/"
fi

# Se publica al final y de una vez: nunca queda una copia de hoy a medias con su nombre definitivo.
rm -rf "$NUEVO"
mv "$TEMPORAL" "$NUEVO"

# Retención: las carpetas con nombre de fecha más viejas que las últimas GUARDAR.
ls -1 "$DESTINO" | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' | sort -r | tail -n +"$((GUARDAR + 1))" | while read -r viejo; do
  rm -rf "${DESTINO:?}/$viejo"
done

ARCHIVOS=$(find "$NUEVO" -type f | wc -l)
CARPETAS=$(find "$NUEVO" -mindepth 1 -maxdepth 1 -type d | wc -l)
log "copia $HOY lista: $ARCHIVOS archivos, $CARPETAS carpetas de estudiantes (se guardan los últimos $GUARDAR días)"
