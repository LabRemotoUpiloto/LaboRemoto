// cmd/tools.rs — Herramientas del agente AI + loop Claude tool_use
// ─────────────────────────────────────────────────────────────────
// Tools disponibles:
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
use std::io::Read;
use crate::cmd::state::SESSIONS;
use crate::cmd::ai_utils::get_claude_api_key;

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
        "ejecutar_comando"     => tool_ejecutar_comando(session_id, input),
        "leer_archivo"         => tool_leer_archivo(session_id, input),
        "escribir_archivo"     => tool_escribir_archivo(session_id, input),
        "listar_directorio"    => tool_listar_directorio(session_id, input),
        "info_sistema"         => tool_info_sistema(session_id),
        "reiniciar_servicio"   => tool_reiniciar_servicio(session_id, input),
        "get_terminal_output"  => tool_get_terminal_output(session_id, input),
        other => ToolResult { tool: other.to_string(), output: format!("Tool desconocida: {other}"), ok: false },
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
    let (host, port, user, password) = match get_creds(session_id) {
        Ok(c) => c,
        Err(e) => return ToolResult { tool: "ejecutar_comando".into(), output: e, ok: false },
    };
    match run_ssh_exec(&host, port, &user, &password, &cmd) {
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
    let (host, port, user, password) = match get_creds(session_id) {
        Ok(c) => c,
        Err(e) => return ToolResult { tool: "leer_archivo".into(), output: e, ok: false },
    };
    match sftp_read(&host, port, &user, &password, &path) {
        Ok(content) => ToolResult { tool: "leer_archivo".into(), output: content, ok: true },
        Err(e)      => ToolResult { tool: "leer_archivo".into(), output: e, ok: false },
    }
}

// ── escribir_archivo ──────────────────────────────────────────────────────────
fn tool_escribir_archivo(session_id: &str, input: &serde_json::Value) -> ToolResult {
    let path    = match input.get("ruta").and_then(|v| v.as_str()) { Some(p) => p.to_string(), None => return ToolResult { tool: "escribir_archivo".into(), output: "Falta 'ruta'".into(), ok: false } };
    let content = match input.get("contenido").and_then(|v| v.as_str()) { Some(c) => c.to_string(), None => return ToolResult { tool: "escribir_archivo".into(), output: "Falta 'contenido'".into(), ok: false } };
    let (host, port, user, password) = match get_creds(session_id) {
        Ok(c) => c,
        Err(e) => return ToolResult { tool: "escribir_archivo".into(), output: e, ok: false },
    };
    match sftp_write(&host, port, &user, &password, &path, content.as_bytes()) {
        Ok(_)  => ToolResult { tool: "escribir_archivo".into(), output: format!("Archivo '{path}' escrito ({} bytes)", content.len()), ok: true },
        Err(e) => ToolResult { tool: "escribir_archivo".into(), output: e, ok: false },
    }
}

// ── listar_directorio ─────────────────────────────────────────────────────────
fn tool_listar_directorio(session_id: &str, input: &serde_json::Value) -> ToolResult {
    let path = input.get("ruta").and_then(|v| v.as_str()).unwrap_or("~").to_string();
    let (host, port, user, password) = match get_creds(session_id) {
        Ok(c) => c,
        Err(e) => return ToolResult { tool: "listar_directorio".into(), output: e, ok: false },
    };
    let cmd = format!("ls -la {path}");
    match run_ssh_exec(&host, port, &user, &password, &cmd) {
        Ok(out) => ToolResult { tool: "listar_directorio".into(), output: out, ok: true },
        Err(e)  => ToolResult { tool: "listar_directorio".into(), output: e, ok: false },
    }
}

// ── info_sistema ──────────────────────────────────────────────────────────────
fn tool_info_sistema(session_id: &str) -> ToolResult {
    let (host, port, user, password) = match get_creds(session_id) {
        Ok(c) => c,
        Err(e) => return ToolResult { tool: "info_sistema".into(), output: e, ok: false },
    };
    let cmd = "echo '=== CPU ===' && top -bn1 | head -5 && echo '=== MEMORIA ===' && free -h && echo '=== DISCO ===' && df -h / && echo '=== UPTIME ===' && uptime";
    match run_ssh_exec(&host, port, &user, &password, cmd) {
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
    let (host, port, user, password) = match get_creds(session_id) {
        Ok(c) => c,
        Err(e) => return ToolResult { tool: "reiniciar_servicio".into(), output: e, ok: false },
    };
    let cmd = format!("sudo systemctl restart {svc} && sudo systemctl status {svc} --no-pager -l | head -20");
    match run_ssh_exec(&host, port, &user, &password, &cmd) {
        Ok(out) => ToolResult { tool: "reiniciar_servicio".into(), output: out, ok: true },
        Err(e)  => ToolResult { tool: "reiniciar_servicio".into(), output: e, ok: false },
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers SSH/SFTP
// ─────────────────────────────────────────────────────────────────────────────

fn get_creds(session_id: &str) -> Result<(String, u16, String, String), String> {
    let map = SESSIONS.lock().map_err(|e| e.to_string())?;
    let s = map.get(session_id).ok_or("Sesión no encontrada")?;
    Ok((s.host.clone(), s.port, s.user.clone(), s.password.clone()))
}

fn run_ssh_exec(host: &str, port: u16, user: &str, password: &str, cmd: &str) -> Result<String, String> {
    let (_tcp, sess) = crate::ssh::ssh2_sftp::connect_password(host, port, user, password)
        .map_err(|e| format!("SSH: {e}"))?;
    sess.set_blocking(true);
    sess.set_timeout(30_000);
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

fn sftp_read(host: &str, port: u16, user: &str, password: &str, path: &str) -> Result<String, String> {
    let (_tcp, sess) = crate::ssh::ssh2_sftp::connect_password(host, port, user, password)
        .map_err(|e| format!("SSH: {e}"))?;
    let sftp = sess.sftp().map_err(|e| format!("SFTP: {e}"))?;
    let mut f = sftp.open(std::path::Path::new(path)).map_err(|e| format!("open '{path}': {e}"))?;
    let mut content = String::new();
    f.read_to_string(&mut content).map_err(|e| format!("read: {e}"))?;
    if content.len() > 32_768 {
        content.truncate(32_768);
        content.push_str("\n[...truncado a 32KB]");
    }
    Ok(content)
}

fn sftp_write(host: &str, port: u16, user: &str, password: &str, path: &str, data: &[u8]) -> Result<(), String> {
    let (_tcp, sess) = crate::ssh::ssh2_sftp::connect_password(host, port, user, password)
        .map_err(|e| format!("SSH: {e}"))?;
    let sftp = sess.sftp().map_err(|e| format!("SFTP: {e}"))?;
    use std::io::Write;
    let mut f = sftp.create(std::path::Path::new(path)).map_err(|e| format!("create '{path}': {e}"))?;
    f.write_all(data).map_err(|e| format!("write: {e}"))?;
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Definiciones de tools para Claude (JSON Schema)
// ─────────────────────────────────────────────────────────────────────────────

fn tool_definitions() -> serde_json::Value {
    serde_json::json!([
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
// Tauri command: agent_chat — loop Claude tool_use
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct AgentChatRequest {
    pub session_id: String,
    pub message: String,
    pub include_terminal_context: Option<bool>,
    pub terminal_lines: Option<usize>,
}

#[tauri::command]
pub async fn agent_chat(req: AgentChatRequest) -> Result<AgentChatResponse, String> {
    let api_key = get_claude_api_key().ok_or("No hay Claude API key configurada")?;

    // El contexto de terminal ya NO se inyecta en el system prompt.
    // Claude lo pedirá llamando a la tool `get_terminal_output` solo cuando lo necesite.
    let system_prompt = build_system_prompt(None);

    // Mensajes iniciales
    let mut messages: Vec<serde_json::Value> = vec![
        serde_json::json!({ "role": "user", "content": req.message })
    ];

    let client = reqwest::Client::new();
    let mut steps: Vec<AgentStep> = vec![];
    let mut final_answer = String::new();

    // Loop: máx 8 rondas de tool use
    for _round in 0..8 {
        let body = serde_json::json!({
            "model": "claude-sonnet-4-5",
            "max_tokens": 4096,
            "system": system_prompt,
            "tools": tool_definitions(),
            "messages": messages
        });

        let resp = client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("HTTP: {e}"))?;

        let resp_json: serde_json::Value = resp.json().await.map_err(|e| format!("JSON: {e}"))?;

        let stop_reason = resp_json["stop_reason"].as_str().unwrap_or("end_turn");
        let content_blocks = resp_json["content"].as_array().cloned().unwrap_or_default();

        // Agregar respuesta del asistente al historial
        messages.push(serde_json::json!({ "role": "assistant", "content": content_blocks }));

        if stop_reason == "end_turn" {
            // Extraer texto final
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

                steps.push(AgentStep {
                    kind: "tool_call".into(),
                    name: Some(tool_name.clone()),
                    input: Some(input.to_string()),
                    output: None,
                });

                // Ejecutar en hilo bloqueante (run_ssh_exec usa ssh2 sync)
                let sid = req.session_id.clone();
                let tn  = tool_name.clone();
                let inp = input.clone();
                let result = tokio::task::spawn_blocking(move || exec_tool(&sid, &tn, &inp))
                    .await
                    .unwrap_or_else(|_| ToolResult { tool: tool_name.clone(), output: "Error interno".into(), ok: false });

                steps.push(AgentStep {
                    kind: "tool_result".into(),
                    name: Some(tool_name.clone()),
                    input: None,
                    output: Some(result.output.clone()),
                });

                tool_results.push(serde_json::json!({
                    "type": "tool_result",
                    "tool_use_id": tool_id,
                    "content": result.output
                }));
            }

            // Agregar resultados de tools al historial
            messages.push(serde_json::json!({ "role": "user", "content": tool_results }));
        } else {
            // stop_reason inesperado
            break;
        }
    }

    if final_answer.is_empty() {
        final_answer = "No se obtuvo respuesta del agente.".to_string();
    }

    Ok(AgentChatResponse { answer: final_answer, steps })
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
}

#[tauri::command]
pub async fn plan_chat(req: PlanChatRequest) -> Result<AgentChatResponse, String> {
    let api_key = get_claude_api_key().ok_or("No hay Claude API key configurada")?;
    let system_prompt = build_plan_system_prompt();

    let mut messages: Vec<serde_json::Value> = vec![
        serde_json::json!({ "role": "user", "content": req.message })
    ];

    let client = reqwest::Client::new();
    let mut steps: Vec<AgentStep> = vec![];
    let mut final_answer = String::new();

    for _round in 0..6 {
        let body = serde_json::json!({
            "model": "claude-sonnet-4-5",
            "max_tokens": 4096,
            "system": system_prompt,
            "tools": plan_tool_definitions(),
            "messages": messages
        });

        let resp = client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("HTTP: {e}"))?;

        let resp_json: serde_json::Value = resp.json().await.map_err(|e| format!("JSON: {e}"))?;

        let stop_reason = resp_json["stop_reason"].as_str().unwrap_or("end_turn");
        let content_blocks = resp_json["content"].as_array().cloned().unwrap_or_default();

        messages.push(serde_json::json!({ "role": "assistant", "content": content_blocks }));

        if stop_reason == "end_turn" {
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

                steps.push(AgentStep {
                    kind: "tool_call".into(),
                    name: Some(tool_name.clone()),
                    input: Some(input.to_string()),
                    output: None,
                });

                let sid = req.session_id.clone();
                let tn  = tool_name.clone();
                let inp = input.clone();
                let result = tokio::task::spawn_blocking(move || plan_exec_tool(&sid, &tn, &inp))
                    .await
                    .unwrap_or_else(|_| ToolResult { tool: tool_name.clone(), output: "Error interno".into(), ok: false });

                steps.push(AgentStep {
                    kind: "tool_result".into(),
                    name: Some(tool_name.clone()),
                    input: None,
                    output: Some(result.output.clone()),
                });

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

    if final_answer.is_empty() {
        final_answer = "No se pudo generar el plan.".to_string();
    }

    Ok(AgentChatResponse { answer: final_answer, steps })
}

fn build_system_prompt(terminal_ctx: Option<&str>) -> String {
    let mut s = String::from(
        "Eres 'Kernel', un asistente experto en Linux y sistemas embebidos con acceso a herramientas reales del servidor remoto.\n\
        Puedes ejecutar comandos, leer y editar archivos, ver el estado del sistema y reiniciar servicios.\n\
        IMPORTANTE: Cuando uses una herramienta, espera el resultado antes de continuar. \
        Basa tus respuestas SOLO en los resultados reales de las herramientas.\n\
        Responde siempre en el idioma del usuario (español si habla español)."
    );
    if let Some(ctx) = terminal_ctx {
        s.push_str("\n\n=== CONTEXTO DEL TERMINAL (últimas salidas) ===\n");
        s.push_str(ctx);
        s.push_str("\n=== FIN DEL CONTEXTO ===");
    }
    s
}
