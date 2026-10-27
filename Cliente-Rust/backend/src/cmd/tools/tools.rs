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
use super::ejecucion::*;

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
    /// Lo que la app tiene que mostrar o pedirle a la persona por este paso (el `output` es solo para el modelo).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accion: Option<AccionAgente>,
}

/// Lo que hizo o propuso el agente, con datos para la interfaz (el chat no lee el texto que va para el modelo).
/// Los cambios de pin y las subidas quedan pendientes: los aplica la persona con Aplicar.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, ts_rs::TS)]
#[serde(tag = "tipo")]
#[ts(export)]
pub enum AccionAgente {
    #[serde(rename = "comandoGuardado")]
    ComandoGuardado { titulo: String, comando: String, descripcion: Option<String> },
    #[serde(rename = "cambioPin")]
    CambioPin {
        gpio: u32,
        /// "entrada" | "salida"
        modo: Option<String>,
        /// "arriba" | "abajo" | "ninguno"
        pull: Option<String>,
        nivel: Option<u8>,
    },
    #[serde(rename = "descarga")]
    Descarga {
        #[serde(rename = "rutaLocal")]
        ruta_local: String,
        #[serde(rename = "rutaRemota")]
        ruta_remota: String,
    },
    #[serde(rename = "subida")]
    Subida {
        #[serde(rename = "rutaLocal")]
        ruta_local: String,
        /// Ya con el nombre del archivo si se pidió subir «dentro» de una carpeta (terminada en /).
        #[serde(rename = "rutaRemota")]
        ruta_remota: String,
        #[serde(rename = "esCarpeta")]
        es_carpeta: bool,
    },
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
    /// Lo que la app sabe de la sesión (equipo, usuario, tipo de terminal, descripciones de los pines…), en texto.
    pub contexto: Option<String>,
    /// La conversación anterior (sin el mensaje actual), lo más viejo primero.
    pub historial: Option<Vec<MensajeHistorial>>,
}

#[derive(Deserialize, Clone)]
pub struct MensajeHistorial {
    /// "user" o "assistant"
    pub rol: String,
    pub texto: String,
}

/// La conversación anterior en el formato de la API: empieza por la persona, alterna roles (se juntan los seguidos del
/// mismo rol), recorta textos largos y se queda con los últimos.
fn mensajes_previos(historial: &[MensajeHistorial]) -> Vec<serde_json::Value> {
    let mut salida: Vec<(String, String)> = vec![];
    for m in historial.iter().rev().take(12).collect::<Vec<_>>().into_iter().rev() {
        let rol = if m.rol == "assistant" { "assistant" } else { "user" };
        let texto: String = m.texto.trim().chars().take(2000).collect();
        if texto.is_empty() { continue; }
        match salida.last_mut() {
            Some((r, t)) if r == rol => { t.push_str("\n\n"); t.push_str(&texto); }
            _ => salida.push((rol.to_string(), texto)),
        }
    }
    while salida.first().map(|(r, _)| r == "assistant").unwrap_or(false) { salida.remove(0); }
    // El mensaje actual es de la persona: lo anterior tiene que terminar en el asistente
    if salida.last().map(|(r, _)| r == "user").unwrap_or(false) { salida.pop(); }
    salida.into_iter().map(|(r, t)| serde_json::json!({ "role": r, "content": t })).collect()
}

/// Lo que el agente sabe de la sesión: equipo y usuario (el backend los tiene), el tipo de terminal, y lo que manda la app
/// (lo que solo ella sabe, como las descripciones de los pines).
fn contexto_de_sesion(session_id: &str, de_la_app: Option<&str>) -> String {
    let mut lineas = vec![];
    if let Ok(map) = SESSIONS.lock() {
        if let Some(s) = map.get(session_id) {
            lineas.push(format!("Equipo: {}@{}:{}", s.user, s.host, s.port));
        }
    }
    lineas.push("Terminal: Linux, por SSH (la terminal interactiva de la persona).".to_string());
    if let Some(extra) = de_la_app.map(str::trim).filter(|c| !c.is_empty()) {
        lineas.push(extra.to_string());
    }
    lineas.join("\n")
}

/// Lo último que mostró la terminal, sin códigos de color, para que el agente sepa dónde está parada la persona.
fn terminal_reciente(session_id: &str, lineas: usize) -> Option<String> {
    let crudo = get_terminal_context(session_id.to_string(), Some(120)).ok()?;
    let limpio = crate::cmd::ssh::carpeta::limpiar_ansi(&crudo);
    let todas: Vec<&str> = limpio.lines().filter(|l| !l.trim().is_empty()).collect();
    let desde = todas.len().saturating_sub(lineas);
    let texto = todas[desde..].join("\n");
    let texto: String = texto.chars().rev().take(3000).collect::<Vec<_>>().into_iter().rev().collect();
    if texto.trim().is_empty() { None } else { Some(texto) }
}

#[tauri::command]
pub async fn agent_chat(app: AppHandle, req: AgentChatRequest) -> Result<AgentChatResponse, String> {
    let request_id = req.request_id.as_deref();
    let api_key = get_claude_api_key().ok_or("No hay Claude API key configurada")?;

    // Lo último de la terminal va en el prompt (corto); si necesita más, el agente usa `get_terminal_output`.
    let terminal = if req.include_terminal_context.unwrap_or(false) {
        terminal_reciente(&req.session_id, req.terminal_lines.unwrap_or(40).min(80))
    } else {
        None
    };
    let mut system_prompt = build_system_prompt(terminal.as_deref());
    let sesion = contexto_de_sesion(&req.session_id, req.contexto.as_deref());
    if !sesion.is_empty() {
        system_prompt.push_str("\n\n=== SESIÓN ===\n");
        system_prompt.push_str(&sesion);
        system_prompt.push_str("\n=== FIN DE LA SESIÓN ===");
    }
    system_prompt.push_str(INSTRUCCIONES_COMANDOS_Y_PINES);

    // La conversación anterior y el mensaje actual
    let mut messages: Vec<serde_json::Value> = mensajes_previos(req.historial.as_deref().unwrap_or(&[]));
    messages.push(serde_json::json!({ "role": "user", "content": req.message }));

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
                    accion: None,
                };
                steps.push(call_step.clone());
                emit_agent_step(&app, request_id, &call_step);

                // Las herramientas que la app tiene que mostrar devuelven además su acción (datos para la interfaz). Las demás
                // corren en un hilo bloqueante (run_ssh_exec usa ssh2 sync).
                let (result, accion) = match tool_name.as_str() {
                    "guardar_comando" => tool_guardar_comando(&app, &input),
                    "descargar_archivo" => tool_descargar_archivo(&app, &req.session_id, &input).await,
                    "cambiar_pin" => tool_cambiar_pin(&input),
                    "subir_archivo" => tool_subir_archivo(&input),
                    _ => {
                        let sid = req.session_id.clone();
                        let tn  = tool_name.clone();
                        let inp = input.clone();
                        let r = tokio::task::spawn_blocking(move || exec_tool(&sid, &tn, &inp))
                            .await
                            .unwrap_or_else(|_| ToolResult { tool: tool_name.clone(), output: "Error interno".into(), ok: false });
                        (r, None)
                    }
                };

                let result_step = AgentStep {
                    kind: "tool_result".into(),
                    name: Some(tool_name.clone()),
                    input: None,
                    output: Some(result.output.clone()),
                    accion,
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
                    accion: None,
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
                    accion: None,
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

#[cfg(test)]
mod pruebas_agente {
    use super::*;

    fn m(rol: &str, texto: &str) -> MensajeHistorial { MensajeHistorial { rol: rol.into(), texto: texto.into() } }

    #[test]
    fn la_accion_llega_a_la_app_con_su_tipo() {
        let v = serde_json::to_value(AccionAgente::Descarga { ruta_local: "C:/d/a.csv".into(), ruta_remota: "/home/pi/a.csv".into() }).unwrap();
        assert_eq!(v, serde_json::json!({ "tipo": "descarga", "rutaLocal": "C:/d/a.csv", "rutaRemota": "/home/pi/a.csv" }));
        // Los pasos sin acción no la mandan
        let paso = AgentStep { kind: "tool_result".into(), name: None, input: None, output: None, accion: None };
        assert!(serde_json::to_value(paso).unwrap().get("accion").is_none());
    }

    #[test]
    fn el_historial_empieza_por_la_persona_alterna_y_termina_en_el_asistente() {
        let h = vec![m("assistant", "hola"), m("user", "a"), m("user", "b"), m("assistant", "c"), m("user", "colgado")];
        let v = mensajes_previos(&h);
        assert_eq!(v.len(), 2);
        assert_eq!(v[0]["role"], "user");
        assert_eq!(v[0]["content"], "a\n\nb");
        assert_eq!(v[1]["role"], "assistant");
    }

    #[test]
    fn cambiar_pin_valida_y_queda_pendiente() {
        let (ok, accion) = tool_cambiar_pin(&serde_json::json!({ "gpio": 17, "modo": "salida", "nivel": 1 }));
        assert!(ok.ok);
        assert!(ok.output.starts_with("PENDIENTE DE CONFIRMAR: GPIO 17, modo salida, nivel alto"));
        assert_eq!(accion, Some(AccionAgente::CambioPin { gpio: 17, modo: Some("salida".into()), pull: None, nivel: Some(1) }));
        for malo in [serde_json::json!({ "gpio": 40, "nivel": 1 }), serde_json::json!({ "gpio": 4 }), serde_json::json!({ "gpio": 4, "modo": "pwm" })] {
            let (r, a) = tool_cambiar_pin(&malo);
            assert!(!r.ok && a.is_none());
        }
    }

    #[test]
    fn descargar_no_pisa_lo_que_ya_esta() {
        let dir = std::env::temp_dir().join(format!("laboremoto-descargas-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(nombre_libre(&dir, "datos.csv"), dir.join("datos.csv"));
        std::fs::write(dir.join("datos.csv"), "x").unwrap();
        std::fs::write(dir.join("datos (1).csv"), "x").unwrap();
        assert_eq!(nombre_libre(&dir, "datos.csv"), dir.join("datos (2).csv"));
        std::fs::write(dir.join("Makefile"), "x").unwrap();
        assert_eq!(nombre_libre(&dir, "Makefile"), dir.join("Makefile (1)"));
    }

    #[test]
    fn subir_queda_pendiente_y_solo_si_el_archivo_existe() {
        let archivo = std::env::temp_dir().join(format!("laboremoto-subir-{}.txt", uuid::Uuid::new_v4()));
        std::fs::write(&archivo, "hola").unwrap();
        let (ok, accion) = tool_subir_archivo(&serde_json::json!({ "ruta_local": archivo.to_string_lossy(), "ruta_remota": "/home/pi/" }));
        assert!(ok.ok);
        assert!(ok.output.starts_with("PENDIENTE DE CONFIRMAR: subir el archivo (4 bytes)"));
        let nombre = archivo.file_name().unwrap().to_string_lossy().to_string();
        assert_eq!(accion, Some(AccionAgente::Subida { ruta_local: archivo.to_string_lossy().to_string(), ruta_remota: format!("/home/pi/{nombre}"), es_carpeta: false }));
        assert!(!tool_subir_archivo(&serde_json::json!({ "ruta_local": "C:/no/existe.txt", "ruta_remota": "/tmp/" })).0.ok);
        assert!(!tool_subir_archivo(&serde_json::json!({ "ruta_local": "", "ruta_remota": "/tmp/" })).0.ok);
    }
}
