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
use once_cell::sync::Lazy;
use tauri::{AppHandle, Emitter};
use crate::cmd::state::SESSIONS;
use crate::cmd::ai::ai_utils::get_claude_api_key;
use super::definitions::{plan_tool_definitions, tool_definitions};
use super::ssh_helpers::{get_creds, run_ssh_exec, sftp_read, sftp_write};

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
        other => ToolResult { tool: other.to_string(), output: format!("Tool desconocida: {other}"), ok: false },
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
// Tauri command: agent_chat — loop Claude tool_use
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct AgentChatRequest {
    pub session_id: String,
    pub message: String,
    pub include_terminal_context: Option<bool>,
    pub terminal_lines: Option<usize>,
    /// ID del mensaje en el chat; habilita eventos `agent:step` en vivo.
    pub request_id: Option<String>,
}

#[tauri::command]
pub async fn agent_chat(app: AppHandle, req: AgentChatRequest) -> Result<AgentChatResponse, String> {
    let request_id = req.request_id.as_deref();
    let api_key = get_claude_api_key().ok_or("No hay Claude API key configurada")?;

    // El contexto de terminal ya NO se inyecta en el system prompt.
    // Claude lo pedirá llamando a la tool `get_terminal_output` solo cuando lo necesite.
    let system_prompt = build_system_prompt(None);

    // Mensajes iniciales
    let mut messages: Vec<serde_json::Value> = vec![
        serde_json::json!({ "role": "user", "content": req.message })
    ];

    let client = &*HTTP_CLIENT;
    let mut steps: Vec<AgentStep> = vec![];
    let mut final_answer = String::new();

    let all_tools = tool_definitions();

    // Loop: máx 8 rondas de tool use
    for _round in 0..8 {
        let body = serde_json::json!({
            "model": "claude-sonnet-4-5",
            "max_tokens": 4096,
            "system": system_prompt,
            "tools": all_tools,
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

        // Detectar respuesta de error de la API antes de procesar
        if resp_json["type"].as_str() == Some("error") {
            let err_type = resp_json["error"]["type"].as_str().unwrap_or("unknown");
            let err_msg  = resp_json["error"]["message"].as_str().unwrap_or("Error desconocido de la API");
            return Err(format!("API Claude ({err_type}): {err_msg}"));
        }

        let stop_reason = resp_json["stop_reason"].as_str().unwrap_or("end_turn");
        let content_blocks = resp_json["content"].as_array().cloned().unwrap_or_default();

        // Agregar respuesta del asistente al historial
        messages.push(serde_json::json!({ "role": "assistant", "content": content_blocks }));

        if stop_reason == "end_turn" || stop_reason == "max_tokens" {
            // Extraer texto final (incluye respuestas cortadas por max_tokens)
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
                emit_agent_step(&app, request_id, &call_step);

                // Ejecutar en hilo bloqueante (run_ssh_exec usa ssh2 sync)
                let sid = req.session_id.clone();
                let tn  = tool_name.clone();
                let inp = input.clone();
                let result = tokio::task::spawn_blocking(move || exec_tool(&sid, &tn, &inp))
                    .await
                    .unwrap_or_else(|_| ToolResult { tool: tool_name.clone(), output: "Error interno".into(), ok: false });

                let result_step = AgentStep {
                    kind: "tool_result".into(),
                    name: Some(tool_name.clone()),
                    input: None,
                    output: Some(result.output.clone()),
                };
                steps.push(result_step.clone());
                emit_agent_step(&app, request_id, &result_step);

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
}

#[tauri::command]
pub async fn plan_chat(app: AppHandle, req: PlanChatRequest) -> Result<AgentChatResponse, String> {
    let request_id = req.request_id.as_deref();
    let api_key = get_claude_api_key().ok_or("No hay Claude API key configurada")?;
    let system_prompt = build_plan_system_prompt();

    let mut messages: Vec<serde_json::Value> = vec![
        serde_json::json!({ "role": "user", "content": req.message })
    ];

    let client = &*HTTP_CLIENT;
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

        // Detectar respuesta de error de la API antes de procesar
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
                emit_agent_step(&app, request_id, &call_step);

                let sid = req.session_id.clone();
                let tn  = tool_name.clone();
                let inp = input.clone();
                let result = tokio::task::spawn_blocking(move || plan_exec_tool(&sid, &tn, &inp))
                    .await
                    .unwrap_or_else(|_| ToolResult { tool: tool_name.clone(), output: "Error interno".into(), ok: false });

                let result_step = AgentStep {
                    kind: "tool_result".into(),
                    name: Some(tool_name.clone()),
                    input: None,
                    output: Some(result.output.clone()),
                };
                steps.push(result_step.clone());
                emit_agent_step(&app, request_id, &result_step);

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
