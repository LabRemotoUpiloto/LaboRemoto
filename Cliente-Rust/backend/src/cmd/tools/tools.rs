// cmd/tools.rs — Herramientas del agente AI + loop Claude tool_use
// ─────────────────────────────────────────────────────────────────
// Tools disponibles:
//   conectar_raspberry — verifica SSH a la Pi (credenciales .env o sesión activa)
//   estado_raspberry   — host/puerto/usuario configurados (sin contraseña)
//   ejecutar_comando   — SSH exec, captura stdout/stderr
//   leer_archivo       — SFTP read
//   escribir_archivo   — SFTP write
//   listar_directorio  — SFTP ls
//   info_sistema       — CPU/RAM/disco/uptime
//   reiniciar_servicio — systemctl restart <svc>
//
// Comandos Tauri expuestos:
//   get_terminal_context  — devuelve las últimas N líneas del buffer del terminal
//   agent_chat            — loop completo Claude tool_use → ejecuta tools → respuesta final

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read;
use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;
use regex::Regex;
use tauri::{AppHandle, Emitter};
use crate::cmd::state::{CachedSsh2, SESSIONS};
use crate::cmd::ai::ai_utils::get_claude_api_key;

// Perf: cliente HTTP compartido para las llamadas a la API de Claude desde
// el loop del agente, en vez de uno nuevo por cada agent_chat/plan_chat.
static HTTP_CLIENT: Lazy<reqwest::Client> = Lazy::new(reqwest::Client::new);

fn emit_agent_step(app: &AppHandle, request_id: Option<&str>, step: &AgentStep) {
    let Some(rid) = request_id.filter(|s| !s.is_empty()) else {
        return;
    };
    let _ = app.emit(
        "agent:step",
        serde_json::json!({
            "request_id": rid,
            "step": step,
        }),
    );
}

/// Comando shell que ejecuta cada tool (para la línea de tiempo del chat).
fn shell_command_for_tool(tool_name: &str, input: &serde_json::Value) -> Option<String> {
    match tool_name {
        "conectar_raspberry" => Some(
            "echo '=== CONEXION OK ===' && hostname && whoami && uname -a".into(),
        ),
        "ejecutar_comando" => input
            .get("comando")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        "listar_directorio" => {
            let path = input.get("ruta").and_then(|v| v.as_str()).unwrap_or("~");
            Some(format!("ls -la {path}"))
        }
        "info_sistema" => Some(
            "echo '=== CPU ===' && top -bn1 | head -5 && echo '=== MEMORIA ===' && free -h && echo '=== DISCO ===' && df -h / && echo '=== UPTIME ===' && uptime".into(),
        ),
        "reiniciar_servicio" => {
            let svc = input
                .get("servicio")
                .and_then(|v| v.as_str())
                .unwrap_or("<servicio>");
            Some(format!(
                "sudo systemctl restart {svc} && sudo systemctl status {svc} --no-pager -l | head -20"
            ))
        }
        _ => None,
    }
}

/// Enriquece el input del tool_call con `comando` para la UI.
fn tool_call_input_for_timeline(tool_name: &str, input: &serde_json::Value) -> String {
    let mut map = match input {
        serde_json::Value::Object(m) => m.clone(),
        _ => serde_json::Map::new(),
    };
    if !map.contains_key("comando") {
        if let Some(cmd) = shell_command_for_tool(tool_name, input) {
            map.insert("comando".to_string(), serde_json::Value::String(cmd));
        }
    }
    serde_json::to_string(&serde_json::Value::Object(map))
        .unwrap_or_else(|_| input.to_string())
}

// ─── Resultado de una tool ────────────────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolResult {
    pub tool: String,
    pub output: String,
    pub ok: bool,
}

// ─── Paso visible en el chat (para UI) ───────────────────────────────────────
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentStep {
    pub kind: String,   // "tool_call" | "tool_result" | "thinking"
    pub name: Option<String>,
    pub input: Option<String>,
    pub output: Option<String>,
}

// ─── Respuesta final del agent_chat ──────────────────────────────────────────
#[derive(Debug, Serialize)]
pub struct AgentChatResponse {
    pub answer: String,
    pub steps: Vec<AgentStep>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Tauri command: get_terminal_context
// ─────────────────────────────────────────────────────────────────────────────
#[tauri::command]
pub fn get_terminal_context(session_id: String, lines: Option<usize>) -> Result<String, String> {
    let n = lines.unwrap_or(100).min(300);
    let map = SESSIONS.lock().map_err(|e| e.to_string())?;
    let sess = map.get(&session_id).ok_or("Sesión no encontrada")?;
    let buf = sess.terminal_buf.lock().map_err(|e| e.to_string())?;
    let chunks: Vec<&String> = buf.iter().rev().take(n).collect::<Vec<_>>().into_iter().rev().collect();
    Ok(chunks.into_iter().cloned().collect::<String>())
}

// ─────────────────────────────────────────────────────────────────────────────
// Ejecución interna de cada tool
// ─────────────────────────────────────────────────────────────────────────────

fn exec_tool(session_id: &str, tool_name: &str, input: &serde_json::Value) -> ToolResult {
    match tool_name {
        "conectar_raspberry"   => tool_conectar_raspberry(session_id),
        "estado_raspberry"     => tool_estado_raspberry(),
        "ejecutar_comando"     => tool_ejecutar_comando(session_id, input),
        "leer_archivo"         => tool_leer_archivo(session_id, input),
        "escribir_archivo"     => tool_escribir_archivo(session_id, input),
        "listar_directorio"    => tool_listar_directorio(session_id, input),
        "info_sistema"         => tool_info_sistema(session_id),
        "reiniciar_servicio"   => tool_reiniciar_servicio(session_id, input),
        "get_terminal_output"  => tool_get_terminal_output(session_id, input),
        other => {
            // Intentar resolverlo como tool MCP registrada
            if let Some((output, ok)) = crate::cmd::integration::mcp_client::exec_mcp_call(other, input) {
                ToolResult { tool: other.to_string(), output, ok }
            } else {
                ToolResult { tool: other.to_string(), output: format!("Tool desconocida: {other}"), ok: false }
            }
        }
    }
}

// ── conectar_raspberry / estado_raspberry ─────────────────────────────────────
fn tool_estado_raspberry() -> ToolResult {
    ToolResult {
        tool: "estado_raspberry".into(),
        output: crate::cmd::tools::pi4_config::pi4_status_summary(),
        ok: crate::cmd::tools::pi4_config::pi4_configured(),
    }
}

fn tool_conectar_raspberry(session_id: &str) -> ToolResult {
    let (host, port, user, _password) = match get_creds(session_id) {
        Ok(c) => c,
        Err(e) => return ToolResult { tool: "conectar_raspberry".into(), output: e, ok: false },
    };
    let cmd = "echo '=== CONEXION OK ===' && hostname && whoami && uname -a";
    match run_ssh_exec(session_id, cmd) {
        Ok(out) => ToolResult {
            tool: "conectar_raspberry".into(),
            output: format!("Conectado a {user}@{host}:{port}\n{out}"),
            ok: true,
        },
        Err(e) => ToolResult { tool: "conectar_raspberry".into(), output: e, ok: false },
    }
}

// ── get_terminal_output ───────────────────────────────────────────────────────
fn tool_get_terminal_output(session_id: &str, input: &serde_json::Value) -> ToolResult {
    let lines = input.get("lines").and_then(|v| v.as_u64()).unwrap_or(60) as usize;
    let lines = lines.min(300);
    match get_terminal_context(session_id.to_string(), Some(lines)) {
        Ok(ctx) if !ctx.trim().is_empty() => ToolResult {
            tool: "get_terminal_output".into(),
            output: ctx,
            ok: true,
        },
        Ok(_) => ToolResult {
            tool: "get_terminal_output".into(),
            output: "El buffer de la terminal está vacío (no se ha ejecutado ningún comando aún).".into(),
            ok: true,
        },
        Err(e) => ToolResult { tool: "get_terminal_output".into(), output: e, ok: false },
    }
}

// ── ejecutar_comando ──────────────────────────────────────────────────────────
fn tool_ejecutar_comando(session_id: &str, input: &serde_json::Value) -> ToolResult {
    let cmd = match input.get("comando").and_then(|v| v.as_str()) {
        Some(c) => c.to_string(),
        None => return ToolResult { tool: "ejecutar_comando".into(), output: "Falta parámetro 'comando'".into(), ok: false },
    };
    match run_ssh_exec(session_id, &cmd) {
        Ok(out) => ToolResult { tool: "ejecutar_comando".into(), output: out, ok: true },
        Err(e)  => ToolResult { tool: "ejecutar_comando".into(), output: e, ok: false },
    }
}

// ── leer_archivo ─────────────────────────────────────────────────────────────
fn tool_leer_archivo(session_id: &str, input: &serde_json::Value) -> ToolResult {
    let path = match input.get("ruta").and_then(|v| v.as_str()) {
        Some(p) => p.to_string(),
        None => return ToolResult { tool: "leer_archivo".into(), output: "Falta parámetro 'ruta'".into(), ok: false },
    };
    match sftp_read(session_id, &path) {
        Ok(content) => ToolResult { tool: "leer_archivo".into(), output: content, ok: true },
        Err(e)      => ToolResult { tool: "leer_archivo".into(), output: e, ok: false },
    }
}

// ── escribir_archivo ──────────────────────────────────────────────────────────
fn tool_escribir_archivo(session_id: &str, input: &serde_json::Value) -> ToolResult {
    let path    = match input.get("ruta").and_then(|v| v.as_str()) { Some(p) => p.to_string(), None => return ToolResult { tool: "escribir_archivo".into(), output: "Falta 'ruta'".into(), ok: false } };
    let content = match input.get("contenido").and_then(|v| v.as_str()) { Some(c) => c.to_string(), None => return ToolResult { tool: "escribir_archivo".into(), output: "Falta 'contenido'".into(), ok: false } };
    match sftp_write(session_id, &path, content.as_bytes()) {
        Ok(_)  => ToolResult { tool: "escribir_archivo".into(), output: format!("Archivo '{path}' escrito ({} bytes)", content.len()), ok: true },
        Err(e) => ToolResult { tool: "escribir_archivo".into(), output: e, ok: false },
    }
}

// ── listar_directorio ─────────────────────────────────────────────────────────
fn tool_listar_directorio(session_id: &str, input: &serde_json::Value) -> ToolResult {
    let path = input.get("ruta").and_then(|v| v.as_str()).unwrap_or("~").to_string();
    let cmd = format!("ls -la {path}");
    match run_ssh_exec(session_id, &cmd) {
        Ok(out) => ToolResult { tool: "listar_directorio".into(), output: out, ok: true },
        Err(e)  => ToolResult { tool: "listar_directorio".into(), output: e, ok: false },
    }
}

// ── info_sistema ──────────────────────────────────────────────────────────────
fn tool_info_sistema(session_id: &str) -> ToolResult {
    let cmd = "echo '=== CPU ===' && top -bn1 | head -5 && echo '=== MEMORIA ===' && free -h && echo '=== DISCO ===' && df -h / && echo '=== UPTIME ===' && uptime";
    match run_ssh_exec(session_id, cmd) {
        Ok(out) => ToolResult { tool: "info_sistema".into(), output: out, ok: true },
        Err(e)  => ToolResult { tool: "info_sistema".into(), output: e, ok: false },
    }
}

// ── reiniciar_servicio ────────────────────────────────────────────────────────
fn tool_reiniciar_servicio(session_id: &str, input: &serde_json::Value) -> ToolResult {
    let svc = match input.get("servicio").and_then(|v| v.as_str()) {
        Some(s) => s.to_string(),
        None => return ToolResult { tool: "reiniciar_servicio".into(), output: "Falta parámetro 'servicio'".into(), ok: false },
    };
    let cmd = format!("sudo systemctl restart {svc} && sudo systemctl status {svc} --no-pager -l | head -20");
    match run_ssh_exec(session_id, &cmd) {
        Ok(out) => ToolResult { tool: "reiniciar_servicio".into(), output: out, ok: true },
        Err(e)  => ToolResult { tool: "reiniciar_servicio".into(), output: e, ok: false },
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers SSH/SFTP
// ─────────────────────────────────────────────────────────────────────────────

fn get_creds(session_id: &str) -> Result<(String, u16, String, String), String> {
    if session_id == crate::cmd::tools::pi4_config::PI4_ENV_SESSION_ID {
        crate::cmd::tools::pi4_config::load_pi4_creds()
            .map(|c| (c.host, c.port, c.user, c.password))
            .ok_or_else(|| {
                "Raspberry Pi no configurada. Define PI4_USER y PI4_PASSWORD en Cliente-Rust/.env."
                    .to_string()
            })
    } else {
        let map = SESSIONS.lock().map_err(|e| e.to_string())?;
        let s = map.get(session_id).ok_or("Sesión no encontrada")?;
        Ok((s.host.clone(), s.port, s.user.clone(), s.password.clone()))
    }
}

// Cache de conexiones SSH reutilizadas entre llamadas a tools dentro del
// loop del agente. Perf: antes de esto, CADA tool call (ejecutar_comando,
// leer_archivo, escribir_archivo, ...) hacía un connect_password completo
// (TCP + handshake + auth) desde cero — una conversación de agente con 8
// rondas podía pagar 8 handshakes SSH. Separado de `SESSIONS.sftp_cached`
// porque `session_id` aquí puede ser el pseudo-id de la Pi configurada por
// .env (`PI4_ENV_SESSION_ID`), que no tiene entrada en `SESSIONS`.
static TOOL_SSH_CACHE: Lazy<Mutex<HashMap<String, Arc<Mutex<CachedSsh2>>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

fn evict_tool_ssh(session_id: &str) {
    if let Ok(mut cache) = TOOL_SSH_CACHE.lock() {
        cache.remove(session_id);
    }
}

fn get_or_connect_tool_ssh(session_id: &str) -> Result<Arc<Mutex<CachedSsh2>>, String> {
    if let Some(existing) = TOOL_SSH_CACHE.lock().map_err(|e| e.to_string())?.get(session_id).cloned() {
        return Ok(existing);
    }

    // El handshake se hace SIN el lock del cache tomado, para no bloquear
    // otras tool calls concurrentes mientras este conecta.
    let (host, port, user, password) = get_creds(session_id)?;
    let (tcp, sess) = crate::ssh_core::ssh2_sftp::connect_password(&host, port, &user, &password)
        .map_err(|e| format!("SSH: {e}"))?;
    sess.set_blocking(true);
    sess.set_timeout(30_000);
    let arc = Arc::new(Mutex::new(CachedSsh2::new(tcp, sess)));

    let mut cache = TOOL_SSH_CACHE.lock().map_err(|e| e.to_string())?;
    if let Some(existing) = cache.get(session_id).cloned() {
        return Ok(existing);
    }
    cache.insert(session_id.to_string(), arc.clone());
    Ok(arc)
}

fn run_ssh_exec(session_id: &str, cmd: &str) -> Result<String, String> {
    fn exec_once(sess: &ssh2::Session, cmd: &str) -> Result<String, String> {
        let mut ch = sess.channel_session().map_err(|e| format!("Canal: {e}"))?;
        ch.exec(cmd).map_err(|e| format!("exec: {e}"))?;
        let mut stdout = String::new();
        ch.read_to_string(&mut stdout).map_err(|e| format!("read: {e}"))?;
        let mut stderr_buf = String::new();
        ch.stderr().read_to_string(&mut stderr_buf).ok();
        ch.wait_close().ok();
        let exit_code = ch.exit_status().unwrap_or(-1);
        let mut out = stdout;
        if !stderr_buf.is_empty() { out.push_str(&format!("\n[stderr]: {stderr_buf}")); }
        if exit_code != 0 { out.push_str(&format!("\n[exit: {exit_code}]")); }
        Ok(if out.is_empty() { "(sin salida)".to_string() } else { out.trim_end().to_string() })
    }

    let arc = get_or_connect_tool_ssh(session_id)?;
    let first = {
        let guard = arc.lock().map_err(|_| "ssh2 lock poisoned".to_string())?;
        exec_once(&guard.sess, cmd)
    };
    match first {
        Ok(out) => Ok(out),
        Err(_) => {
            // La conexión cacheada puede haberse caído (sesión SSH remota
            // cerrada); se reconecta una vez antes de fallar.
            evict_tool_ssh(session_id);
            let arc2 = get_or_connect_tool_ssh(session_id)?;
            let guard = arc2.lock().map_err(|_| "ssh2 lock poisoned".to_string())?;
            exec_once(&guard.sess, cmd)
        }
    }
}

fn sftp_read(session_id: &str, path: &str) -> Result<String, String> {
    fn read_once(guard: &mut CachedSsh2, path: &str) -> Result<String, String> {
        let sftp = guard.get_or_open_sftp().map_err(|e| format!("SFTP: {e}"))?;
        let mut f = sftp.open(std::path::Path::new(path)).map_err(|e| format!("open '{path}': {e}"))?;
        let mut content = String::new();
        f.read_to_string(&mut content).map_err(|e| format!("read: {e}"))?;
        if content.len() > 32_768 {
            content.truncate(32_768);
            content.push_str("\n[...truncado a 32KB]");
        }
        Ok(content)
    }

    let arc = get_or_connect_tool_ssh(session_id)?;
    let first = {
        let mut guard = arc.lock().map_err(|_| "ssh2 lock poisoned".to_string())?;
        read_once(&mut guard, path)
    };
    match first {
        Ok(v) => Ok(v),
        Err(_) => {
            evict_tool_ssh(session_id);
            let arc2 = get_or_connect_tool_ssh(session_id)?;
            let mut guard = arc2.lock().map_err(|_| "ssh2 lock poisoned".to_string())?;
            read_once(&mut guard, path)
        }
    }
}

fn sftp_write(session_id: &str, path: &str, data: &[u8]) -> Result<(), String> {
    fn write_once(guard: &mut CachedSsh2, path: &str, data: &[u8]) -> Result<(), String> {
        use std::io::Write;
        let sftp = guard.get_or_open_sftp().map_err(|e| format!("SFTP: {e}"))?;
        let mut f = sftp.create(std::path::Path::new(path)).map_err(|e| format!("create '{path}': {e}"))?;
        f.write_all(data).map_err(|e| format!("write: {e}"))?;
        Ok(())
    }

    let arc = get_or_connect_tool_ssh(session_id)?;
    let first = {
        let mut guard = arc.lock().map_err(|_| "ssh2 lock poisoned".to_string())?;
        write_once(&mut guard, path, data)
    };
    match first {
        Ok(()) => Ok(()),
        Err(_) => {
            evict_tool_ssh(session_id);
            let arc2 = get_or_connect_tool_ssh(session_id)?;
            let mut guard = arc2.lock().map_err(|_| "ssh2 lock poisoned".to_string())?;
            write_once(&mut guard, path, data)
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Definiciones de tools para Claude (JSON Schema)
// ─────────────────────────────────────────────────────────────────────────────

fn tool_definitions() -> serde_json::Value {
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
// Enrutamiento de modelo (Claude / OpenAI / OpenRouter) — mismo criterio que
// cmd::ai::ai::ai_chat_impl ("/" para OpenRouter, "claude*" para Claude),
// factorizado acá porque agent_chat y plan_chat también lo necesitan y antes
// tenían "claude-sonnet-4-5" fijo sin mirar el modelo que el usuario eligió
// en el selector del chat.
// ─────────────────────────────────────────────────────────────────────────────

enum ModelRoute {
    Claude { api_key: String, model: String },
    OpenAiCompatible { api_key: String, model: String, base_url: String, extra_headers: Vec<(String, String)> },
}

fn resolve_model_route(model_selection: Option<&str>) -> Result<ModelRoute, String> {
    let raw = model_selection.filter(|s| !s.is_empty()).unwrap_or("claude-sonnet-4-6");
    let model = raw.to_string();
    let is_claude = model.starts_with("claude") && !model.contains('/');

    if model.contains('/') {
        let key = crate::cmd::ai::ai_utils::get_openrouter_api_key().ok_or("OPENROUTER_API_KEY no configurada")?;
        return Ok(ModelRoute::OpenAiCompatible {
            api_key: key,
            model,
            base_url: "https://openrouter.ai/api/v1/chat/completions".to_string(),
            extra_headers: vec![
                ("HTTP-Referer".to_string(), "https://github.com/ssh-ai-client".to_string()),
                ("X-Title".to_string(), "SSH AI Client".to_string()),
            ],
        });
    }
    if is_claude {
        let key = get_claude_api_key().ok_or("No hay Claude API key configurada")?;
        return Ok(ModelRoute::Claude { api_key: key, model });
    }
    let key = crate::cmd::ai::ai_utils::get_openai_api_key().ok_or("OPENAI_API_KEY no configurada")?;
    Ok(ModelRoute::OpenAiCompatible {
        api_key: key,
        model,
        base_url: "https://api.openai.com/v1/chat/completions".to_string(),
        extra_headers: vec![],
    })
}

/// Heurística barata para detectar que la respuesta final se coló en inglés
/// a pesar del "responde siempre en español" del system prompt -- pasa con
/// modelos gratis pequeños bajo presión de tokens. Ignora bloques de código
/// e inline code (`` `..` ``), donde el inglés es normal y esperado (nombres
/// de comandos, flags, rutas).
fn looks_like_english(text: &str) -> bool {
    let mut cleaned = String::new();
    let mut in_fence = false;
    for line in text.lines() {
        if line.trim_start().starts_with("```") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence { continue; }
        let mut in_inline = false;
        for ch in line.chars() {
            if ch == '`' { in_inline = !in_inline; continue; }
            if !in_inline { cleaned.push(ch); }
        }
        cleaned.push('\n');
    }
    let lower = cleaned.to_lowercase();
    let words: Vec<&str> = lower
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .collect();
    if words.len() < 6 {
        return false;
    }
    const EN: &[&str] = &[
        "the", "and", "you", "your", "is", "are", "we", "this", "that", "with", "for",
        "have", "should", "would", "here", "now", "let", "need", "will", "can", "could",
        "what", "when", "where", "how", "why", "not", "but", "from", "about", "output",
        "respond", "user",
    ];
    const ES: &[&str] = &[
        "el", "la", "los", "las", "de", "que", "es", "para", "con", "una", "uno", "por",
        "se", "no", "en", "del", "al", "su", "como", "mas", "pero", "desde", "sobre",
        "este", "esta", "estos", "estas", "cuando", "donde",
    ];
    let en_count = words.iter().filter(|w| EN.contains(w)).count();
    let es_count = words.iter().filter(|w| ES.contains(w)).count();
    en_count >= 3 && en_count > es_count * 2
}

/// Le pide al mismo modelo/proveedor que reescriba una respuesta en español,
/// preservando comandos y bloques de código -- usado como último recurso
/// cuando `looks_like_english` detecta que la respuesta final se coló en
/// inglés. Devuelve `None` si la llamada falla; el llamador se queda con el
/// texto original en ese caso (mejor una respuesta en inglés que ninguna).
async fn translate_answer_to_spanish(
    api_key: &str,
    model: &str,
    base_url: Option<&str>,
    extra_headers: &[(String, String)],
    is_claude: bool,
    text: &str,
) -> Option<String> {
    let client = &*HTTP_CLIENT;
    let instruction = format!(
        "Reescribe el siguiente texto COMPLETAMENTE en español, preservando intactos \
        los bloques de código, comandos y nombres técnicos/rutas. No expliques que lo \
        tradujiste ni agregues comentarios -- entrega únicamente el texto reescrito.\n\n\
        ---\n{text}"
    );

    if is_claude {
        let body = serde_json::json!({
            "model": model,
            "max_tokens": 1500,
            "messages": [{ "role": "user", "content": instruction }]
        });
        let resp = client
            .post("https://api.anthropic.com/v1/messages")
            .header("anthropic-version", "2023-06-01")
            .header("x-api-key", api_key)
            .json(&body)
            .send()
            .await
            .ok()?;
        let j: serde_json::Value = resp.json().await.ok()?;
        j["content"][0]["text"].as_str().map(|s| s.to_string())
    } else {
        let url = base_url.unwrap_or("https://api.openai.com/v1/chat/completions");
        let mut body = serde_json::json!({
            "model": model,
            "max_tokens": 1500,
            "temperature": 0.1,
            "messages": [{ "role": "user", "content": instruction }]
        });
        if url.contains("openrouter.ai") {
            body["reasoning"] = serde_json::json!({ "exclude": true });
        }
        let mut req = client.post(url).bearer_auth(api_key).json(&body);
        for (k, v) in extra_headers {
            req = req.header(k.as_str(), v.as_str());
        }
        let resp = req.send().await.ok()?;
        let j: serde_json::Value = resp.json().await.ok()?;
        j["choices"][0]["message"]["content"].as_str().map(|s| s.to_string())
    }
}

/// Si `answer` se detecta en inglés, intenta una reescritura en español con
/// el mismo modelo/ruta antes de devolvérselo al usuario.
async fn ensure_spanish_answer(answer: &mut String, model_selection: Option<&str>) {
    if !looks_like_english(answer) {
        return;
    }
    let Ok(route) = resolve_model_route(model_selection) else { return };
    let translated = match route {
        ModelRoute::Claude { api_key, model } => {
            translate_answer_to_spanish(&api_key, &model, None, &[], true, answer).await
        }
        ModelRoute::OpenAiCompatible { api_key, model, base_url, extra_headers } => {
            translate_answer_to_spanish(&api_key, &model, Some(&base_url), &extra_headers, false, answer).await
        }
    };
    if let Some(t) = translated {
        if !t.trim().is_empty() && !looks_like_english(&t) {
            *answer = t;
        }
    }
}

/// Convierte tool_definitions()/plan_tool_definitions() (formato Claude:
/// name/description/input_schema) al formato "function calling" que usan los
/// modelos OpenAI-compatibles (OpenRouter/OpenAI directo):
/// {"type":"function","function":{name,description,parameters}}. Una sola
/// fuente de verdad para el esquema de cada tool, convertida al vuelo según
/// a qué proveedor se enruta el request.
fn claude_tools_to_openai(claude_tools: &serde_json::Value) -> serde_json::Value {
    let arr = claude_tools.as_array().cloned().unwrap_or_default();
    let converted: Vec<serde_json::Value> = arr
        .into_iter()
        .map(|t| {
            serde_json::json!({
                "type": "function",
                "function": {
                    "name": t.get("name").cloned().unwrap_or(serde_json::Value::Null),
                    "description": t.get("description").cloned().unwrap_or(serde_json::Value::Null),
                    "parameters": t.get("input_schema").cloned().unwrap_or_else(|| serde_json::json!({"type":"object","properties":{}})),
                }
            })
        })
        .collect();
    serde_json::Value::Array(converted)
}

/// Loop de tool-calling contra la API real de Claude (Messages API, bloques
/// `tool_use`/`tool_result`). Extraído de lo que antes vivía duplicado dentro
/// de agent_chat y plan_chat -- ambos lo llaman pasando sus propias tools/
/// system_prompt/exec_tool.
#[allow(clippy::too_many_arguments)]
async fn run_claude_tool_loop(
    app: &AppHandle,
    request_id: Option<&str>,
    session_id: &str,
    api_key: &str,
    model: &str,
    system_prompt: &str,
    tools: &serde_json::Value,
    mut messages: Vec<serde_json::Value>,
    exec: fn(&str, &str, &serde_json::Value) -> ToolResult,
    max_rounds: u32,
) -> Result<AgentChatResponse, String> {
    let client = &*HTTP_CLIENT;
    let mut steps: Vec<AgentStep> = vec![];
    let mut final_answer = String::new();

    for _round in 0..max_rounds {
        let body = serde_json::json!({
            "model": model,
            "max_tokens": 4096,
            "system": system_prompt,
            "tools": tools,
            "messages": messages
        });

        let resp = client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("HTTP: {e}"))?;

        let resp_json: serde_json::Value = resp.json().await.map_err(|e| format!("JSON: {e}"))?;

        if resp_json["type"].as_str() == Some("error") {
            let err_type = resp_json["error"]["type"].as_str().unwrap_or("unknown");
            let err_msg  = resp_json["error"]["message"].as_str().unwrap_or("Error desconocido de la API");
            return Err(format!("API Claude ({err_type}): {err_msg}"));
        }

        let stop_reason = resp_json["stop_reason"].as_str().unwrap_or("end_turn");
        let content_blocks = resp_json["content"].as_array().cloned().unwrap_or_default();

        messages.push(serde_json::json!({ "role": "assistant", "content": content_blocks }));

        if stop_reason == "end_turn" || stop_reason == "max_tokens" {
            for block in &content_blocks {
                if block["type"].as_str() == Some("text") {
                    if let Some(t) = block["text"].as_str() {
                        final_answer.push_str(t);
                    }
                }
            }
            break;
        }

        if stop_reason == "tool_use" {
            let mut tool_results: Vec<serde_json::Value> = vec![];

            for block in &content_blocks {
                if block["type"].as_str() != Some("tool_use") { continue; }
                let tool_name = block["name"].as_str().unwrap_or("").to_string();
                let tool_id   = block["id"].as_str().unwrap_or("").to_string();
                let input     = block["input"].clone();

                let call_step = AgentStep {
                    kind: "tool_call".into(),
                    name: Some(tool_name.clone()),
                    input: Some(tool_call_input_for_timeline(&tool_name, &input)),
                    output: None,
                };
                steps.push(call_step.clone());
                emit_agent_step(app, request_id, &call_step);

                let sid = session_id.to_string();
                let tn  = tool_name.clone();
                let inp = input.clone();
                let result = tokio::task::spawn_blocking(move || exec(&sid, &tn, &inp))
                    .await
                    .unwrap_or_else(|_| ToolResult { tool: tool_name.clone(), output: "Error interno".into(), ok: false });

                let result_step = AgentStep {
                    kind: "tool_result".into(),
                    name: Some(tool_name.clone()),
                    input: None,
                    output: Some(result.output.clone()),
                };
                steps.push(result_step.clone());
                emit_agent_step(app, request_id, &result_step);

                tool_results.push(serde_json::json!({
                    "type": "tool_result",
                    "tool_use_id": tool_id,
                    "content": result.output
                }));
            }

            messages.push(serde_json::json!({ "role": "user", "content": tool_results }));
        } else {
            break;
        }
    }

    // Se agotaron las rondas sin que el modelo soltara texto final (se la
    // pasó llamando tools) -- en vez de dejar al usuario sin nada, se fuerza
    // UNA llamada mas sin `tools` para que resuma lo que ya se junto. Vale
    // la pena sobre todo con modelos mas chicos/gratis, que tienden a
    // explorar de mas antes de responder.
    if final_answer.trim().is_empty() {
        let body = serde_json::json!({
            "model": model,
            "max_tokens": 1024,
            "system": system_prompt,
            "messages": messages
        });
        if let Ok(resp) = client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
        {
            if let Ok(j) = resp.json::<serde_json::Value>().await {
                if let Some(blocks) = j["content"].as_array() {
                    for block in blocks {
                        if block["type"].as_str() == Some("text") {
                            if let Some(t) = block["text"].as_str() {
                                final_answer.push_str(t);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(AgentChatResponse { answer: final_answer, steps })
}

/// Algunos modelos gratis de OpenRouter no llenan el campo
/// estructurado `tool_calls` de la respuesta -- en vez de eso, escriben la
/// llamada como texto plano dentro de `content` con un formato pseudo-XML
/// (variante del estilo Hermes/NousResearch, anterior al function calling
/// oficial de OpenAI): `<tool_call><function=nombre><parameter=clave>
/// valor</parameter></function></tool_call>`. Sin este parser, ese texto
/// crudo se le mostraba al usuario tal cual como si fuera la respuesta
/// final (visto en vivo con un modelo gratis intentando llamar
/// `ejecutar_comando`). Se detecta y se sintetiza un tool_call como si el
/// proveedor lo hubiera devuelto bien.
fn parse_fallback_tool_call(content: &str) -> Option<serde_json::Value> {
    static FUNC_RE: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r"(?s)<tool_call>\s*<function=([A-Za-z_][\w]*)>(.*?)</function>\s*</tool_call>").unwrap()
    });
    static PARAM_RE: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r"(?s)<parameter=([A-Za-z_][\w]*)>\s*(.*?)\s*</parameter>").unwrap()
    });

    let caps = FUNC_RE.captures(content)?;
    let name = caps.get(1)?.as_str().to_string();
    let inner = caps.get(2)?.as_str();

    let mut args = serde_json::Map::new();
    for pc in PARAM_RE.captures_iter(inner) {
        args.insert(pc[1].to_string(), serde_json::Value::String(pc[2].to_string()));
    }

    Some(serde_json::json!({
        "id": format!("fallback-{}", uuid::Uuid::new_v4()),
        "type": "function",
        "function": {
            "name": name,
            "arguments": serde_json::Value::Object(args).to_string(),
        }
    }))
}

/// Loop de tool-calling contra un endpoint OpenAI-compatible (OpenRouter,
/// OpenAI directo) -- mismo rol que run_claude_tool_loop pero
/// con el shape de function calling de OpenAI: `tool_calls` en la respuesta
/// (arguments viene como STRING JSON, hay que parsearlo), y los resultados
/// se agregan como mensajes `role":"tool"` con `tool_call_id`, no como un
/// bloque `tool_result` dentro de un mensaje de usuario como en Claude.
#[allow(clippy::too_many_arguments)]
async fn run_openai_tool_loop(
    app: &AppHandle,
    request_id: Option<&str>,
    session_id: &str,
    api_key: &str,
    model: &str,
    base_url: &str,
    extra_headers: &[(String, String)],
    system_prompt: &str,
    tools: &serde_json::Value,
    mut messages: Vec<serde_json::Value>,
    exec: fn(&str, &str, &serde_json::Value) -> ToolResult,
    max_rounds: u32,
) -> Result<AgentChatResponse, String> {
    let client = &*HTTP_CLIENT;
    let mut steps: Vec<AgentStep> = vec![];
    let mut final_answer = String::new();

    // OpenAI-style: el system prompt va como mensaje al principio del historial,
    // no como campo aparte (a diferencia de Claude).
    messages.insert(0, serde_json::json!({ "role": "system", "content": system_prompt }));

    // Modelos "reasoning" (frecuentes entre los gratis de OpenRouter) pueden
    // gastar el presupuesto de tokens pensando antes de llamar a una tool --
    // se le pide al proveedor que excluya ese bloque, mismo criterio que ya
    // usa cmd::ai::ai::ai_chat_impl para el modo Consulta.
    let wants_reasoning_exclude = base_url.contains("openrouter.ai");

    for _round in 0..max_rounds {
        let mut body = serde_json::json!({
            "model": model,
            "max_tokens": 4096,
            "temperature": 0.1,
            "tools": tools,
            "messages": messages
        });
        if wants_reasoning_exclude {
            body["reasoning"] = serde_json::json!({ "exclude": true });
        }

        let mut req_builder = client.post(base_url).bearer_auth(api_key).json(&body);
        for (k, v) in extra_headers {
            req_builder = req_builder.header(k.as_str(), v.as_str());
        }

        let resp = req_builder.send().await.map_err(|e| format!("HTTP: {e}"))?;
        let status = resp.status();
        let resp_json: serde_json::Value = resp.json().await.map_err(|e| format!("JSON: {e}"))?;

        if !status.is_success() || resp_json.get("error").is_some() {
            let err_msg = resp_json["error"]["message"].as_str()
                .or_else(|| resp_json["error"].as_str())
                .unwrap_or("Error desconocido de la API");
            return Err(format!("API modelo ({status}): {err_msg}"));
        }

        let message = resp_json["choices"][0]["message"].clone();
        let mut tool_calls = message["tool_calls"].as_array().cloned().unwrap_or_default();

        // Fallback: el modelo no llenó `tool_calls` pero el texto trae el
        // patrón pseudo-XML de function calling (ver parse_fallback_tool_call).
        let mut synthesized_from_text = false;
        if tool_calls.is_empty() {
            if let Some(content_str) = message["content"].as_str() {
                if let Some(fallback_call) = parse_fallback_tool_call(content_str) {
                    tool_calls = vec![fallback_call];
                    synthesized_from_text = true;
                }
            }
        }

        // El historial debe reflejar lo que realmente se va a ejecutar --
        // si se sintetizó un tool_call que el proveedor no puso en
        // `tool_calls`, se agrega ese campo a mano antes de empujar el
        // mensaje (si no, en la ronda siguiente el modelo no "sabe" que ya
        // intentó llamar la tool y puede repetir el mismo texto crudo).
        if synthesized_from_text {
            let mut msg_with_calls = message.clone();
            msg_with_calls["tool_calls"] = serde_json::Value::Array(tool_calls.clone());
            messages.push(msg_with_calls);
        } else {
            messages.push(message.clone());
        }

        if tool_calls.is_empty() {
            if let Some(t) = message["content"].as_str() {
                final_answer.push_str(t);
            }
            break;
        }

        for call in &tool_calls {
            let tool_id = call["id"].as_str().unwrap_or("").to_string();
            let tool_name = call["function"]["name"].as_str().unwrap_or("").to_string();
            let args_str = call["function"]["arguments"].as_str().unwrap_or("{}");
            let input: serde_json::Value = serde_json::from_str(args_str).unwrap_or_else(|_| serde_json::json!({}));

            let call_step = AgentStep {
                kind: "tool_call".into(),
                name: Some(tool_name.clone()),
                input: Some(tool_call_input_for_timeline(&tool_name, &input)),
                output: None,
            };
            steps.push(call_step.clone());
            emit_agent_step(app, request_id, &call_step);

            let sid = session_id.to_string();
            let tn  = tool_name.clone();
            let inp = input.clone();
            let result = tokio::task::spawn_blocking(move || exec(&sid, &tn, &inp))
                .await
                .unwrap_or_else(|_| ToolResult { tool: tool_name.clone(), output: "Error interno".into(), ok: false });

            let result_step = AgentStep {
                kind: "tool_result".into(),
                name: Some(tool_name.clone()),
                input: None,
                output: Some(result.output.clone()),
            };
            steps.push(result_step.clone());
            emit_agent_step(app, request_id, &result_step);

            messages.push(serde_json::json!({
                "role": "tool",
                "tool_call_id": tool_id,
                "content": result.output
            }));
        }
    }

    // Mismo caso que run_claude_tool_loop: se agotaron las rondas en medio
    // de tool_calls sin que el modelo soltara una respuesta final -- se
    // fuerza una última llamada sin `tools` para que resuma lo encontrado.
    if final_answer.trim().is_empty() {
        let mut body = serde_json::json!({
            "model": model,
            "max_tokens": 1024,
            "temperature": 0.1,
            "messages": messages
        });
        if wants_reasoning_exclude {
            body["reasoning"] = serde_json::json!({ "exclude": true });
        }
        let mut req_builder = client.post(base_url).bearer_auth(api_key).json(&body);
        for (k, v) in extra_headers {
            req_builder = req_builder.header(k.as_str(), v.as_str());
        }
        if let Ok(resp) = req_builder.send().await {
            if let Ok(j) = resp.json::<serde_json::Value>().await {
                if let Some(t) = j["choices"][0]["message"]["content"].as_str() {
                    // Sin `tools` el proveedor no debería devolver un tool_call,
                    // pero algunos modelos gratis igual sueltan el pseudo-XML
                    // como texto plano (visto en vivo) -- si eso pasa no se
                    // deja escapar crudo al usuario: se ejecuta esa última
                    // tool de verdad y se pide un resumen final ya sin margen
                    // para que vuelva a intentar otra tool call.
                    if let Some(fallback_call) = parse_fallback_tool_call(t) {
                        let tool_name = fallback_call["function"]["name"].as_str().unwrap_or("").to_string();
                        let args_str = fallback_call["function"]["arguments"].as_str().unwrap_or("{}");
                        let input: serde_json::Value = serde_json::from_str(args_str).unwrap_or_else(|_| serde_json::json!({}));

                        let sid = session_id.to_string();
                        let tn = tool_name.clone();
                        let inp = input.clone();
                        let result = tokio::task::spawn_blocking(move || exec(&sid, &tn, &inp))
                            .await
                            .unwrap_or_else(|_| ToolResult { tool: tool_name.clone(), output: "Error interno".into(), ok: false });

                        let result_step = AgentStep {
                            kind: "tool_result".into(),
                            name: Some(tool_name.clone()),
                            input: None,
                            output: Some(result.output.clone()),
                        };
                        steps.push(result_step.clone());
                        emit_agent_step(app, request_id, &result_step);

                        messages.push(serde_json::json!({ "role": "assistant", "content": t }));
                        messages.push(serde_json::json!({
                            "role": "user",
                            "content": format!(
                                "Resultado de {tool_name}: {}\n\nResume ahora la respuesta final en lenguaje natural para el usuario, sin usar tool calls ni XML.",
                                result.output
                            )
                        }));

                        let mut body2 = serde_json::json!({
                            "model": model,
                            "max_tokens": 1024,
                            "temperature": 0.1,
                            "messages": messages
                        });
                        if wants_reasoning_exclude {
                            body2["reasoning"] = serde_json::json!({ "exclude": true });
                        }
                        let mut req2 = client.post(base_url).bearer_auth(api_key).json(&body2);
                        for (k, v) in extra_headers {
                            req2 = req2.header(k.as_str(), v.as_str());
                        }
                        if let Ok(resp2) = req2.send().await {
                            if let Ok(j2) = resp2.json::<serde_json::Value>().await {
                                if let Some(t2) = j2["choices"][0]["message"]["content"].as_str() {
                                    if parse_fallback_tool_call(t2).is_none() {
                                        final_answer.push_str(t2);
                                    }
                                }
                            }
                        }
                    } else {
                        final_answer.push_str(t);
                    }
                }
            }
        }
    }

    Ok(AgentChatResponse { answer: final_answer, steps })
}

// ─────────────────────────────────────────────────────────────────────────────
// Tauri command: agent_chat — loop de tool_use (Claude o proveedor OpenAI-
// compatible, según el modelo que haya elegido el usuario en el selector)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct AgentChatRequest {
    pub session_id: String,
    pub message: String,
    pub include_terminal_context: Option<bool>,
    pub terminal_lines: Option<usize>,
    /// ID del mensaje en el chat; habilita eventos `agent:step` en vivo.
    pub request_id: Option<String>,
    /// Modelo elegido en el selector del chat (ver AVAILABLE_MODELS del
    /// frontend). None/vacío cae a Claude por compatibilidad hacia atrás.
    pub model_selection: Option<String>,
}

#[tauri::command]
pub async fn agent_chat(app: AppHandle, req: AgentChatRequest) -> Result<AgentChatResponse, String> {
    let request_id = req.request_id.as_deref();

    // El contexto de terminal ya NO se inyecta en el system prompt.
    // El modelo lo pedirá llamando a la tool `get_terminal_output` solo cuando lo necesite.
    let system_prompt = build_system_prompt(None);

    let messages: Vec<serde_json::Value> = vec![
        serde_json::json!({ "role": "user", "content": req.message })
    ];

    // Construir lista de tools: built-in + MCP (cargadas desde caché en disco)
    let mut all_tools = tool_definitions();
    let mcp_defs = crate::cmd::integration::mcp_client::load_mcp_tool_defs();
    if let Some(arr) = all_tools.as_array_mut() {
        arr.extend(mcp_defs);
    }

    let route = resolve_model_route(req.model_selection.as_deref())?;
    let mut result = match route {
        ModelRoute::Claude { api_key, model } => {
            run_claude_tool_loop(&app, request_id, &req.session_id, &api_key, &model, &system_prompt, &all_tools, messages, exec_tool, 8).await?
        }
        ModelRoute::OpenAiCompatible { api_key, model, base_url, extra_headers } => {
            let openai_tools = claude_tools_to_openai(&all_tools);
            run_openai_tool_loop(&app, request_id, &req.session_id, &api_key, &model, &base_url, &extra_headers, &system_prompt, &openai_tools, messages, exec_tool, 8).await?
        }
    };

    ensure_spanish_answer(&mut result.answer, req.model_selection.as_deref()).await;

    if result.answer.is_empty() {
        result.answer = "No se obtuvo respuesta del agente.".to_string();
    }

    Ok(result)
}

// ─────────────────────────────────────────────────────────────────────────────
// Tauri command: plan_chat — loop Claude tool_use (read-only tools)
// ─────────────────────────────────────────────────────────────────────────────

fn plan_tool_definitions() -> serde_json::Value {
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

fn plan_exec_tool(session_id: &str, tool_name: &str, input: &serde_json::Value) -> ToolResult {
    match tool_name {
        "info_sistema"        => tool_info_sistema(session_id),
        "listar_directorio"   => tool_listar_directorio(session_id, input),
        "leer_archivo"        => tool_leer_archivo(session_id, input),
        "get_terminal_output" => tool_get_terminal_output(session_id, input),
        other => ToolResult { tool: other.to_string(), output: format!("Tool no disponible en modo Plan: {other}"), ok: false },
    }
}

fn build_plan_system_prompt() -> String {
    String::from(
        "Eres 'Kernel', un arquitecto de soluciones para servidores Linux y proyectos de software.\n\
        \n\
        FLUJO OBLIGATORIO:\n\
        1. Antes de generar el plan, usa las herramientas disponibles para inspeccionar el servidor \
           (info_sistema, listar_directorio, leer_archivo, get_terminal_output) y conocer el estado real.\n\
        2. Basa el plan ÚNICAMENTE en lo que encontraste — sin asumir qué hay instalado.\n\
        3. Genera el plan final con este formato:\n\
        \n\
        **Objetivo:** [qué se va a lograr en 1 línea]\n\
        \n\
        **Fase 1 — [nombre]**\n\
        - Pasos concretos con comandos reales y ejecutables directamente en la terminal\n\
        - Criterio de éxito\n\
        \n\
        **Fase 2 — [nombre]** ... (máx 5 fases)\n\
        \n\
        **⚠ Advertencias:** dependencias, riesgos o prerequisitos encontrados.\n\
        \n\
        REGLAS DE COMANDOS:\n\
        - PROHIBIDO usar editores interactivos (nano, vim, vi, emacs). USA SIEMPRE here-document:\n\
          cat > /ruta/archivo.ext <<'EOF'\n\
          (contenido del archivo)\n\
          EOF\n\
        - Todos los comandos deben poder pegarse y ejecutarse directamente sin intervención manual.\n\
        - Para scripts bash/python multi-línea, usar obligatoriamente el patrón here-doc.\n\
        \n\
        Responde siempre en español. No des opciones alternativas, solo el camino óptimo."
    )
}

#[derive(Deserialize)]
pub struct PlanChatRequest {
    pub session_id: String,
    pub message: String,
    pub request_id: Option<String>,
    /// Modelo elegido en el selector del chat -- mismo criterio que AgentChatRequest.
    pub model_selection: Option<String>,
}

#[tauri::command]
pub async fn plan_chat(app: AppHandle, req: PlanChatRequest) -> Result<AgentChatResponse, String> {
    let request_id = req.request_id.as_deref();
    let system_prompt = build_plan_system_prompt();
    let messages: Vec<serde_json::Value> = vec![
        serde_json::json!({ "role": "user", "content": req.message })
    ];
    let tools = plan_tool_definitions();

    let route = resolve_model_route(req.model_selection.as_deref())?;
    let mut result = match route {
        ModelRoute::Claude { api_key, model } => {
            run_claude_tool_loop(&app, request_id, &req.session_id, &api_key, &model, &system_prompt, &tools, messages, plan_exec_tool, 6).await?
        }
        ModelRoute::OpenAiCompatible { api_key, model, base_url, extra_headers } => {
            let openai_tools = claude_tools_to_openai(&tools);
            run_openai_tool_loop(&app, request_id, &req.session_id, &api_key, &model, &base_url, &extra_headers, &system_prompt, &openai_tools, messages, plan_exec_tool, 6).await?
        }
    };

    ensure_spanish_answer(&mut result.answer, req.model_selection.as_deref()).await;

    if result.answer.is_empty() {
        result.answer = "No se pudo generar el plan.".to_string();
    }

    Ok(result)
}

fn build_system_prompt(terminal_ctx: Option<&str>) -> String {
    let pi4_hint = if crate::cmd::tools::pi4_config::pi4_configured() {
        "\n\
        RASPBERRY PI: Las credenciales del laboratorio están en .env (PI4_USER, PI4_PASSWORD). \
        Si el usuario pide conectarse a la Raspberry sin terminal abierta, usa primero \
        `estado_raspberry` y luego `conectar_raspberry`; después ejecuta_comando, leer_archivo, etc. \
        Si pide ver las cámaras o streams de video, usa `conectar_raspberry` y confirma que puede verlas en el chat. \
        Si pide ESCRITORIO REMOTO o VNC: usa `conectar_raspberry` y di que abrirá el escritorio gráfico (NO la terminal). \
        Si pide terminal, SSH o shell: entonces sí terminal en el chat."
    } else {
        ""
    };
    let mut s = String::from(
        "Eres 'Kernel', un asistente experto en Linux y sistemas embebidos con acceso a herramientas reales del servidor remoto.\n\
        Puedes ejecutar comandos, leer y editar archivos, ver el estado del sistema y reiniciar servicios.\n\
        IMPORTANTE: Cuando uses una herramienta, espera el resultado antes de continuar. \
        Basa tus respuestas SOLO en los resultados reales de las herramientas.\n\
        Responde siempre en el idioma del usuario (español si habla español)."
    );
    s.push_str(pi4_hint);
    if let Some(ctx) = terminal_ctx {
        s.push_str("\n\n=== CONTEXTO DEL TERMINAL (últimas salidas) ===\n");
        s.push_str(ctx);
        s.push_str("\n=== FIN DEL CONTEXTO ===");
    }
    s
}

#[cfg(test)]
mod fallback_tool_call_tests {
    use super::*;

    #[test]
    fn parses_real_world_pseudo_xml_tool_call() {
        // Ejemplo real visto con un modelo gratis de OpenRouter que no
        // llenó `tool_calls` estructurado.
        let content = "<tool_call> <function=ejecutar_comando>\n<parameter=comando> stty sane </parameter>\n</function> </tool_call>";
        let parsed = parse_fallback_tool_call(content).expect("debería parsear");
        assert_eq!(parsed["function"]["name"], "ejecutar_comando");
        let args: serde_json::Value = serde_json::from_str(parsed["function"]["arguments"].as_str().unwrap()).unwrap();
        assert_eq!(args["comando"], "stty sane");
    }

    #[test]
    fn parses_multiple_parameters() {
        let content = "<tool_call><function=escribir_archivo><parameter=ruta>/tmp/x.txt</parameter><parameter=contenido>hola mundo</parameter></function></tool_call>";
        let parsed = parse_fallback_tool_call(content).expect("debería parsear");
        assert_eq!(parsed["function"]["name"], "escribir_archivo");
        let args: serde_json::Value = serde_json::from_str(parsed["function"]["arguments"].as_str().unwrap()).unwrap();
        assert_eq!(args["ruta"], "/tmp/x.txt");
        assert_eq!(args["contenido"], "hola mundo");
    }

    #[test]
    fn returns_none_for_plain_text() {
        assert!(parse_fallback_tool_call("Esta es una respuesta normal sin tool calls.").is_none());
    }
}
