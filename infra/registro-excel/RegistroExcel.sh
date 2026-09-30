#!/bin/bash
# RegistroExcel.sh — fuente de la verdad de las conexiones al laboratorio.
#
# Lee en vivo el auth.log de la Pi4 y, por cada conexión SSH con contraseña
# (las cuentas institucionales de los estudiantes entran así), manda el
# registro a Power Automate, que lo guarda en el Excel y avisa en Teams. Al
# cerrarse la sesión manda el mismo registro con la hora de desconexión.
#
# Despliegue en la Pi4: /var/log/RegistroExcel.sh, servicio `registroExcel`.
# El webhook NO va en este archivo: /etc/registroExcel.env (WEBHOOK_URL="...",
# modo 600, dueño root).

LOG_FILE="${LOG_FILE:-/var/log/auth.log}"
JSON_FILE="${JSON_FILE:-/var/log/shellRegistros.json}"
ENV_FILE="${ENV_FILE:-/etc/registroExcel.env}"

# Cuentas técnicas que no son personas: svc-practicas es el túnel interno que
# la app mantiene abierto hacia la API de prácticas.
IGNORAR_USUARIOS=" svc-practicas "

# shellcheck source=/dev/null
source "$ENV_FILE" || { echo "ERROR: no se pudo leer $ENV_FILE"; exit 1; }
[ -n "$WEBHOOK_URL" ] || { echo "ERROR: falta WEBHOOK_URL en $ENV_FILE"; exit 1; }

[ -s "$JSON_FILE" ] || echo "[]" > "$JSON_FILE"

enviar() {
    curl -sS -X POST -H "Content-Type: application/json" -d @- "$WEBHOOK_URL"
    echo
}

ignorado() { [[ "$IGNORAR_USUARIOS" == *" $1 "* ]]; }

registrar_conexion() {
    local nuevo=$1 tmp
    tmp=$(mktemp)
    jq ". += [$nuevo]" "$JSON_FILE" > "$tmp" && mv "$tmp" "$JSON_FILE"
    echo "$nuevo" | enviar
}

# Marca la desconexión de una sesión registrada como activa y escribe el
# registro actualizado. No escribe nada si la sesión nunca se registró
# (entradas con llave, cuentas ignoradas, sesiones de antes de arrancar):
# mandarle `null` al flujo es lo que producía TriggerInputSchemaMismatch.
cerrar_registro() {
    local sid=$1 hd=$2 registro tmp
    registro=$(jq -c --arg sid "$sid" \
        'map(select(.session_id == $sid and .hora_desconexion == "Activo")) | .[0] // empty' "$JSON_FILE")
    [ -n "$registro" ] || return 0
    tmp=$(mktemp)
    jq --arg sid "$sid" --arg hd "$hd" \
        'map(if (.session_id == $sid and .hora_desconexion == "Activo") then .hora_desconexion = $hd else . end)' \
        "$JSON_FILE" > "$tmp" && mv "$tmp" "$JSON_FILE"
    echo "$registro" | jq -c --arg hd "$hd" '.hora_desconexion = $hd'
}

tail -Fn0 "$LOG_FILE" | while read -r line; do
    if echo "$line" | grep -qE 'sshd\[[0-9]+\]: Accepted (password|keyboard-interactive)'; then
        fecha=$(echo "$line" | awk '{print $1, $2, $3}')
        ip=$(echo "$line" | awk '{print $(NF-3)}')
        usuario=$(echo "$line" | awk '{print $9}' | sed 's/port.//' | sed 's/\\\\\\\\/\\/g')
        session_id=$(echo "$line" | grep -oP 'sshd\[\K[0-9]+(?=\])')
        ignorado "$usuario" && continue

        nuevo=$(jq -nc --arg id "${usuario}_${session_id}" --arg usuario "$usuario" --arg hc "$fecha" \
            --arg ip "$ip" --arg sid "$session_id" \
            '{ID: $id, usuario: $usuario, session_id: $sid, hora_conexion: $hc, hora_desconexion: "Activo", ip: $ip}')
        registrar_conexion "$nuevo"
        echo "Usuario $usuario conectado (session_id: $session_id) desde IP $ip."

    # Solo cierres de sesiones SSH (no los de sudo ni cron, que también dicen
    # "session closed for user").
    elif echo "$line" | grep -qE 'sshd\[[0-9]+\]: pam_unix\(sshd:session\): session closed for user'; then
        fecha=$(echo "$line" | awk '{print $1, $2, $3}')
        session_id=$(echo "$line" | grep -oP 'sshd\[\K[0-9]+(?=\])')
        registro=$(cerrar_registro "$session_id" "$fecha")
        [ -n "$registro" ] || continue
        echo "$registro" | enviar
        echo "Usuario $(echo "$registro" | jq -r .usuario) desconectado (session_id: $session_id) a las $fecha."
    fi
done
