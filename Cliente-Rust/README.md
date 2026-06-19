# Cliente Rust SSH/SFTP con IA y Control de Raspberry Pi

Aplicación de escritorio de última generación para gestión remota de sistemas, con enfoque especial en **educación** y **control de dispositivos IoT**. Combina la potencia y seguridad de **Rust** (Tauri) con una interfaz moderna en **React + TypeScript**.

![Vista Principal](apps/desktop/web/public/Terminalchat.png)

---

## Descripción General

La aplicación ofrece una solución integral para administradores, profesores y estudiantes. Integra un **Agente de Inteligencia Artificial** con acceso a tools reales del servidor, un sistema completo de **prácticas de laboratorio remoto** con evaluación automática, integración con **Moodle LMS**, control de hardware **Arduino**, y acceso al **escritorio gráfico** de dispositivos Raspberry Pi.

---

## Arquitectura

```
Frontend (React + TypeScript)
         ↕  invoke() / eventos Tauri
Backend (Rust + Tauri)
         ↕  SSH (russh) / SFTP (ssh2) / HTTP (reqwest)
Raspberry Pi / Servidor Remoto
```

1. **Frontend**: Gestiona estado, componentes visuales y la interacción con el usuario.  
2. **Backend Rust**: Maneja conexiones de red, cifrado, bridge VNC, agente AI y lógica crítica.  
3. **Puente Tauri**: Comandos asíncronos seguros; la UI nunca se bloquea en operaciones intensivas.

---

## Módulos del Backend (Rust)

### `cmd/ssh` — Conexión SSH Interactiva
| Comando Tauri | Descripción |
|---|---|
| `ssh_connect` | Abre una sesión SSH con PTY. Devuelve el `session_id` inmediatamente y emite `ssh_connected`/`ssh_connect_error` de forma async. |
| `ssh_ui_ready` | Señala al backend que la UI está lista; vuelca el buffer capturado durante la conexión. |
| `ssh_stdin` | Envía bytes al canal PTY. Soporta encoding `base64`. Detecta automáticamente comandos `cd` y actualiza `current_dir`. |
| `ssh_resize` | Redimensiona el PTY (cols/rows). |
| `ssh_disconnect` | Cierra la sesión, mata procesos VNC residuales y limpia la memoria de la sesión. |
| `ssh_connect_stored` | Conecta desde un host cifrado guardado (`.json.enc`). |
| `ssh_session_info` | Devuelve host, puerto, usuario e IP resuelta de la sesión activa. |

#### GPIO — Control de pines Raspberry Pi (via `raspi-gpio`)
| Comando | Descripción |
|---|---|
| `rpi_pins_status` | Lee el estado de **todos** los pines BCM (level, func, pull). |
| `rpi_pin_read` | Lee el estado de un pin específico. |
| `rpi_pin_set_mode` | Configura modo del pin: `input` / `output`. |
| `rpi_pin_set_pull` | Configura resistencia pull: `up` / `down` / `none`. |
| `rpi_pin_write_level` | Escribe nivel digital: `1` (alto) / `0` (bajo). |

---

### `cmd/sftp` — Transferencia de Archivos SFTP
| Comando | Descripción |
|---|---|
| `sftp_open` | Abre una sesión SFTP sobre la conexión SSH existente. |
| `sftp_home` | Devuelve el directorio home del usuario remoto. |
| `sftp_list` | Lista el contenido de un directorio remoto. |
| `sftp_mkdir` | Crea un directorio remoto. |
| `sftp_remove` | Elimina un archivo o directorio remoto. |
| `sftp_download_start` | Inicia la descarga de un archivo remoto (emite eventos de progreso). |
| `sftp_upload_start` | Sube un archivo local al servidor remoto. |
| `sftp_upload_dir_start` | Sube un directorio completo (recursivo). |
| `sftp_download_dir_start` | Descarga un directorio completo. |
| `sftp_cancel` | Cancela una transferencia en curso. |

---

### `cmd/ai` — Chat con IA (Claude)
| Comando | Descripción |
|---|---|
| `ai_chat` | Conversación con Claude. Soporta historial de mensajes, cancela peticiones previas. |
| `cancel_ai_chat` | Cancela una petición AI activa. |
| `ai_env_status` | Verifica si la API key de Claude está configurada. |
| `ai_test_key` | Valida la API key de Claude contra la API real. |

---

### `cmd/tools` — Agente AI con Tools Reales
El agente ejecuta un **loop Claude `tool_use`** — puede llamar tools SSH/SFTP en el servidor remoto de forma autónoma.

**Modo Agente `agent_chat`** (tools completas):
| Tool Interna | Descripción |
|---|---|
| `ejecutar_comando` | Ejecuta un comando shell en el servidor via SSH. |
| `leer_archivo` | Lee el contenido de un archivo remoto vía SFTP. |
| `escribir_archivo` | Escribe/edita un archivo remoto vía SFTP. |
| `listar_directorio` | Lista el contenido de un directorio remoto. |
| `info_sistema` | Obtiene CPU, RAM, disco y uptime del servidor. |
| `reiniciar_servicio` | Reinicia un servicio `systemd` remoto. |
| `get_terminal_output` | Lee el buffer de la terminal activa (últimas N líneas). |
| *(tools MCP)* | Ejecuta tools de servidores MCP registrados (extensible). |

**Modo Plan `plan_chat`** (solo lectura): Claude inspecciona el servidor y genera un **plan de acción paso a paso** con comandos reales, sin ejecutar nada.

| Comando Tauri | Descripción |
|---|---|
| `get_terminal_context` | Devuelve las últimas N líneas del buffer SSH capturado. |
| `agent_chat` | Loop completo tool_use → tools → respuesta final. |
| `plan_chat` | Inspecciona el servidor y genera un plan (read-only). |

---

### `cmd/file_edit` — Análisis y Edición de Archivos por IA
| Comando | Descripción |
|---|---|
| `analyze_file` | Analiza un archivo remoto: explica código, detecta bugs. |
| `analyze_any_file` | Igual pero acepta contenido directo (no solo ruta). |
| `plan_file_edit` | Claude genera un plan de edición diferenciado. |
| `apply_file_edit` | Aplica el plan de edición al archivo remoto (con backup). |
| `ai_remote_edit_file` | Edición asistida por IA directamente en el servidor remoto. |
| `list_file_backups` | Lista los backups de ediciones anteriores. |
| `revert_file` | Revierte un archivo a un backup anterior. |

---

### `cmd/mcp_client` — Cliente MCP (Model Context Protocol)
Permite registrar **servidores MCP externos** (procesos locales con I/O stdio) y exponer sus tools al agente AI.

| Comando | Descripción |
|---|---|
| `mcp_register_server` | Registra un servidor MCP: lo inicia, lista sus tools y cachea los schemas en disco. |
| `mcp_list_servers` | Lista todos los servidores MCP registrados con sus tools cacheadas. |
| `mcp_remove_server` | Elimina un servidor del registro. |
| `mcp_refresh_tools` | Reconecta al servidor y actualiza el caché de tools. |

Los schemas MCP se almacenan en `%APPDATA%\upiloto\ssh-client\mcp_servers.json`.

---

### `cmd/vnc` — Escritorio Gráfico Remoto (VNC)
Permite acceder al **entorno gráfico LXDE** de la Raspberry Pi (o cualquier Linux con Xvfb) desde la app, sin necesidad de monitor físico.

**Ciclo de vida:**
1. `vnc_start` → detecta display y puerto VNC libres → arranca `Xvfb + Openbox + lxpanel + pcmanfm + x11vnc` en el servidor remoto
2. Abre un **bridge WebSocket ↔ SSH direct-tcpip** en Rust (framing WS manual, sin perder frames por timeouts)
3. Devuelve `ws_port` al frontend → noVNC se conecta al puerto local
4. `vnc_stop` → señala al bridge que pare → mata SOLO los procesos de esa sesión (no afecta otras sesiones activas)

**Características:**
- 🎨 Detecta automáticamente el wallpaper real del dispositivo (LXDE-pi, GNOME, XFCE)
- 🌐 Ícono "Servidor Web Local" en el escritorio → abre `http://localhost:10000` (Apache)
- 🔒 Aislamiento por display: cada sesión VNC tiene su Chromium, perfil y pines de proceso únicos
- 🧹 Limpieza automática en cierre de la app (`vnc_cleanup_all`)
- 📺 Modo físico (pantalla real con `x11vnc`) y modo virtual (Xvfb)

| Comando | Descripción |
|---|---|
| `vnc_start` | Inicia el entorno gráfico virtual + bridge WS. |
| `vnc_stop` | Detiene el servidor VNC y limpia los procesos remotos. |
| `vnc_status` | Devuelve el estado actual (`not_started` / `running`). |
| `vnc_cleanup_all` | Limpia **todas** las sesiones VNC residuales (se llama al cerrar la app). |

---

### `cmd/stream` — Streaming de Cámaras y WebRTC
| Comando | Descripción |
|---|---|
| `stream_start` | Abre un port-forwarding TCP local→remoto sobre la sesión SSH activa (para streaming de cámaras MJPEG). |
| `stream_stop` | Cierra el forwarding. |
| `stream_list_cameras` | Consulta el servicio `multicam` en la Pi y devuelve la lista de cámaras disponibles. |
| `stream_get_host` | Devuelve la IP del host remoto y el puerto WHEP para WebRTC directo. |
| `whep_exchange` | Realiza el intercambio SDP WHEP desde Rust (evita bloqueos CORS del WebView). |

---

### `cmd/arduino` — Bridge Arduino Domótica
Permite comunicarse con un **Arduino** conectado al puerto serial de la Raspberry Pi a través de un bridge HTTP (`arduino_bridge.py` escuchando en `127.0.0.1:8765`).

> Toda la comunicación va **por SSH** (sin abrir puertos adicionales). Se reutiliza la sesión ssh2 cacheada.

| Comando | Descripción |
|---|---|
| `arduino_bridge_status` | Consulta `/status` del bridge: puerto serial detectado, si está abierto, errores. |
| `arduino_send_cmd` | Envía un comando al Arduino vía POST `/cmd` y devuelve la respuesta. |
| `arduino_read_buffer` | Lee líneas espontáneas del buffer del Arduino (eventos sin solicitud). |

Ver `docs/arduino_domotica.md` para instalación del servicio en la Pi.

---

### `cmd/practicas` — Sistema de Prácticas de Laboratorio
Gestiona un catálogo de prácticas configuradas en `.env.practicas`. Soporta múltiples categorías (Eve3 — robots, Linux, Circuitos) con configuración por práctica.

| Comando | Descripción |
|---|---|
| `practicas_list_categories` | Devuelve todas las categorías y prácticas (sin contraseñas). |
| `practicas_get_config` | Devuelve la configuración completa de una práctica (con credenciales, para uso interno). |
| `practicas_run_setup` | Ejecuta los comandos de setup de una práctica (ej: iniciar el robot Eve3 vía SSH). Emite eventos `practice:log` con el progreso. |

**Estructura de una práctica:**
- `connection`: host, puerto, usuario, comandos de setup pre-práctica (pueden apuntar a un host diferente)
- `terminal`: comandos permitidos, directorio de trabajo, permisos de navegación y nano
- `panels`: si mostrar cámara, contexto del chat IA, tutorial
- Tutorial y contexto pueden cargarse desde `practicas/<id>.json`

---

### `cmd/practice_validator` — Validador Automático de Prácticas
Analiza el historial de comandos SSH del estudiante y determina si cumplió los objetivos de la práctica.

**Reglas de validación:**
- `command_executed`: Verifica si el estudiante ejecutó un comando específico.
- `file_created`: Verifica si creó un archivo con cierta extensión.

| Comando | Descripción |
|---|---|
| `validate_practice_progress` | Analiza el historial y devuelve un objeto `PracticeValidation` con porcentaje, puntos y detalle por objetivo. |
| `calculate_practice_grade` | Calcula la calificación numérica (para Moodle) basada en el porcentaje de objetivos cumplidos. |

El umbral de aprobación es **60%** de objetivos cumplidos.

---

### `cmd/moodle` — Integración con Moodle LMS
Permite sincronizar tareas, verificar entregas y calificar estudiantes directamente en Moodle.

> Requiere `MOODLE_URL` y `MOODLE_TOKEN` en `.env`.

| Comando | Descripción |
|---|---|
| `moodle_sync_assignment` | Obtiene info de la tarea, del usuario y verifica si ya la entregó. |
| `moodle_prepare_grade` | Prepara el payload de calificación (NO la envía). |
| `moodle_submit_grade_direct` | Envía la calificación a Moodle via `mod_assign_save_grade`. Resuelve `user_id` por `username` si es necesario. |

**Manejo de permisos:** Si el token no tiene capability para ciertas operaciones (ej: ver entregas ajenas), el módulo genera placeholders en lugar de fallar, para que el flujo educativo no se interrumpa.

---

### `cmd/logs` — Sistema de Logs de Sesión
| Comando | Descripción |
|---|---|
| `save_session_log` | Guarda un log completo de sesión SSH. |
| `save_session_log_fragment` | Guarda un fragmento incremental de log. |
| `list_session_logs` | Lista todos los logs guardados. |
| `get_session_log` / `get_session_log_content` | Lee el contenido de un log. |
| `delete_session_log` | Elimina un log. |
| `cleanup_old_session_logs` | Limpia logs anteriores a N días. |

---

### `cmd/local` — Sistema de Archivos Local
| Comando | Descripción |
|---|---|
| `local_home_dir` | Devuelve el directorio home del usuario local. |
| `local_list_dir` | Lista un directorio local. |
| `local_list_drives` | Lista las unidades disponibles (Windows: C:, D:, etc.). |
| `save_text_file` | Guarda un archivo de texto localmente. |
| `chat_history_load` | Carga el historial de chat guardado. |
| `chat_history_save` | Guarda el historial de chat. |
| `chat_history_delete_entry` | Elimina una entrada del historial. |

---

### `cmd/hosts` — Gestión de Hosts Cifrados
Almacena hosts (credenciales) cifrados localmente con **ChaCha20Poly1305**.

| Comando | Descripción |
|---|---|
| `save_host_encrypted` | Guarda un host cifrado con password maestra. |
| `load_host_encrypted` | Carga y descifra un host. |
| `save_host_master` / `load_host_master` | Guarda/carga host con clave maestra global. |
| `list_hosts_entries` | Lista todos los hosts guardados. |
| `list_hosts_files` | Lista los archivos `.json.enc` de hosts. |
| `delete_host_file` | Elimina un archivo de host. |

---

### `cmd/pdf_reports` — Reportes PDF
| Comando | Descripción |
|---|---|
| `save_pdf_base64` | Guarda un PDF (pasado como Base64 desde `html2pdf.js`) en el directorio de logs local. |

---

### Memoria Efímera de Sesión (`state`)
Almacenamiento clave-valor en RAM, por sesión, para que el frontend y el agente AI compartan datos temporales.

| Comando | Descripción |
|---|---|
| `mem_put` | Guarda un valor en la memoria de la sesión. |
| `mem_get` | Obtiene un valor de la memoria de la sesión. |
| `mem_clear` | Limpia toda la memoria de la sesión. |
| `mem_push_terminal_result` | Agrega el resultado de un comando al contexto AI de la sesión. |

---

## Configuración

### `.env` (variables principales)
```env
ANTHROPIC_API_KEY=sk-ant-...   # Claude API key
MOODLE_URL=https://moodle.universidad.edu
MOODLE_TOKEN=abc123...         # Token de API de Moodle (requiere permisos de profesor)
```

### `.env.practicas` (sistema de prácticas)
```env
# Categoría Eve3 — Robot
PRACTICE_EVE3_RPI_HOST=192.168.1.x
PRACTICE_EVE3_RPI_PORT=22
PRACTICE_EVE3_RPI_USER=labiot
PRACTICE_EVE3_RPI_PASSWORD=...

# Robot (host de setup)
PRACTICE_EVE3_ROBOT_HOST=192.168.1.y
PRACTICE_EVE3_ROBOT_SCRIPT_DIR=/home/pi/robot
PRACTICE_EVE3_ROBOT_SCRIPT_CMD=./start_server.sh

# Práctica 1
PRACTICE_EVE3_P1_NAME=Control básico de robot Eve3
PRACTICE_EVE3_P1_DESC=Controla el robot con el teclado
PRACTICE_EVE3_P1_DIFFICULTY=beginner
PRACTICE_EVE3_P1_ALLOWED_CMDS=ls,python,cd
PRACTICE_EVE3_P1_WORKING_DIR=/home/labiot/eve3
PRACTICE_EVE3_P1_MOODLE_ASSIGNMENT_ID=5
PRACTICE_EVE3_P1_CAMERA=true
```

### Tutoriales JSON (`practicas/<id>.json`)
```json
{
  "context": "Contexto para el asistente IA (privado, no visible al estudiante)",
  "tutorial": "## Tutorial\nPaso 1: Ejecuta `ls` para ver los archivos..."
}
```

---

## Tecnologías

| Capa | Tecnología | Uso |
|---|---|---|
| Backend | Rust + Tauri | Núcleo, comandos seguros |
| SSH Terminal | `russh` (async) | Terminal interactiva PTY |
| SSH/SFTP General | `ssh2` / libssh2 | SFTP, GPIO, VNC setup, Arduino |
| Frontend | React + TypeScript | UI completa |
| IA | Claude (Anthropic) | Chat, agente, edición de archivos |
| VNC | noVNC + bridge Rust | Escritorio remoto gráfico |
| Cifrado | ChaCha20Poly1305 | Credenciales locales |
| Hashing | Argon2 | Contraseñas maestras |
| LMS | Moodle REST API | Calificación automática |
| IoT | raspi-gpio, Arduino serial | Control hardware |
| Video | MediaMTX (WebRTC/WHEP) | Streaming multi-cámara |
| Protocolos | MCP (stdio JSON-RPC 2.0) | Extensión de tools del agente |

---

## Flujo educativo completo

```
Profesor configura .env.practicas + JSON de tutorial
         ↓
Estudiante abre la app → Página de Prácticas
         ↓
Selecciona práctica → practicas_run_setup (inicia robot/servidor)
         ↓
Se abre sesión SSH al workspace (Raspberry Pi)
         ↓
Terminal con comandos restringidos + Chat IA contextual + Cámara
         ↓
Agente IA monitorea buffer terminal → practice_validator analiza historial
         ↓
Al completar → calculate_practice_grade → moodle_submit_grade_direct
         ↓
Calificación enviada automáticamente a Moodle ✓
```

---

![Entorno Gráfico Remoto](apps/desktop/web/public/vnc_preview.jpeg)

---

*Desarrollado con ❤️ usando Rust y React.*
