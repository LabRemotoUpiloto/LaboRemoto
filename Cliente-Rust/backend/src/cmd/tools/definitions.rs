//! Definiciones (JSON schema) de las tools que se le ofrecen al modelo.

// ─────────────────────────────────────────────────────────────────────────────
// Definiciones de tools para Claude (JSON Schema)
// ─────────────────────────────────────────────────────────────────────────────

pub(super) fn tool_definitions() -> serde_json::Value {
    serde_json::json!([
        {
            "name": "conectar_raspberry",
            "description": "Verifica la conexión SSH a la Raspberry Pi (credenciales .env). Úsala antes de comandos o VNC. Si el usuario pide ESCRITORIO REMOTO, VNC o interfaz gráfica: NO es terminal — la app abrirá el escritorio LXDE embebido (como el botón Escritorio). Si pide entrar/conectar/terminal/SSH: la app abrirá terminal en el chat. Si pide cámaras, confirma que puede verlas en el chat.",
            "input_schema": { "type": "object", "properties": {}, "required": [] }
        },
        {
            "name": "estado_raspberry",
            "description": "Muestra host, puerto y usuario configurados para la Raspberry Pi (sin revelar la contraseña).",
            "input_schema": { "type": "object", "properties": {}, "required": [] }
        },
        {
            "name": "ejecutar_comando",
            "description": "Ejecuta un comando de shell en el servidor remoto vía SSH y devuelve stdout/stderr. Úsalo para diagnóstico, instalar paquetes, ver logs, etc.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "comando": { "type": "string", "description": "Comando a ejecutar (ej: 'ls -la /home/pi', 'cat /var/log/syslog | tail -20')" }
                },
                "required": ["comando"]
            }
        },
        {
            "name": "leer_archivo",
            "description": "Lee el contenido de un archivo del servidor remoto vía SFTP.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "ruta": { "type": "string", "description": "Ruta absoluta del archivo (ej: '/home/pi/cameras.json')" }
                },
                "required": ["ruta"]
            }
        },
        {
            "name": "escribir_archivo",
            "description": "Escribe/sobreescribe un archivo en el servidor remoto vía SFTP. Usa esto para editar configuraciones.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "ruta":      { "type": "string", "description": "Ruta absoluta del archivo a escribir" },
                    "contenido": { "type": "string", "description": "Contenido completo del archivo" }
                },
                "required": ["ruta", "contenido"]
            }
        },
        {
            "name": "listar_directorio",
            "description": "Lista el contenido de un directorio en el servidor remoto.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "ruta": { "type": "string", "description": "Ruta del directorio (default: ~)" }
                },
                "required": []
            }
        },
        {
            "name": "info_sistema",
            "description": "Obtiene información del sistema: CPU, RAM, disco y uptime del servidor remoto.",
            "input_schema": { "type": "object", "properties": {}, "required": [] }
        },
        {
            "name": "reiniciar_servicio",
            "description": "Reinicia un servicio systemd en el servidor remoto y muestra su estado.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "servicio": { "type": "string", "description": "Nombre del servicio (ej: 'multicam', 'nginx', 'ssh')" }
                },
                "required": ["servicio"]
            }
        },
        {
            "name": "get_terminal_output",
            "description": "Lee las últimas N líneas del buffer de la terminal interactiva del usuario. Úsalo cuando el usuario mencione un error, un comando que falló, o pida analizar lo que pasó en la terminal. NO lo uses si la pregunta es teórica o no está relacionada con la terminal activa.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "lines": { "type": "integer", "description": "Número de líneas a leer (default 60, máx 300)", "default": 60 }
                },
                "required": []
            }
        }
    ])
}


// ─────────────────────────────────────────────────────────────────────────────
// Tauri command: plan_chat — loop Claude tool_use (read-only tools)
// ─────────────────────────────────────────────────────────────────────────────

pub(super) fn plan_tool_definitions() -> serde_json::Value {
    serde_json::json!([
        {
            "name": "info_sistema",
            "description": "Obtiene información del sistema: OS, CPU, RAM, disco y uptime. Úsalo para conocer el entorno antes de planificar.",
            "input_schema": { "type": "object", "properties": {}, "required": [] }
        },
        {
            "name": "listar_directorio",
            "description": "Lista el contenido de un directorio en el servidor. Úsalo para entender la estructura existente del proyecto.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "ruta": { "type": "string", "description": "Ruta del directorio (default: ~)" }
                },
                "required": []
            }
        },
        {
            "name": "leer_archivo",
            "description": "Lee el contenido de un archivo (configuraciones, código, etc.). Úsalo para adaptar el plan al estado actual real.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "ruta": { "type": "string", "description": "Ruta absoluta del archivo" }
                },
                "required": ["ruta"]
            }
        },
        {
            "name": "get_terminal_output",
            "description": "Lee las últimas N líneas del buffer de la terminal del usuario. Úsalo para entender qué comandos corrió antes de pedir el plan.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "lines": { "type": "integer", "description": "Número de líneas a leer (default 40, máx 150)", "default": 40 }
                },
                "required": []
            }
        }
    ])
}
