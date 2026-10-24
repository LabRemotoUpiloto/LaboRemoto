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
    ComandoGuardado { titulo: String, comando: String },
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
        "leer_pines"           => tool_leer_pines(session_id),
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

// ── guardar_comando / leer_pines / cambiar_pin ────────────────────────────────

const INSTRUCCIONES_COMANDOS_Y_PINES: &str = "\n\n\
COMANDOS GUARDADOS: si la persona pide guardar algo como comando (o snippet), usa `guardar_comando` con un nombre corto y \
el comando exacto. La app lo agrega a su panel Comandos.\n\
PINES (Raspberry Pi): para saber el estado de los GPIO usa `leer_pines` (incluye lo que la persona describió de cada uno). \
Para cambiar un pin usa `cambiar_pin`: NO lo aplica, la app le pide a la persona que confirme con Aplicar. Dile qué va a \
cambiar y que lo confirme; nunca digas que ya quedó aplicado.\n\
ARCHIVOS (SFTP): para crear o editar un archivo en el servidor usa `escribir_archivo`. Para bajar un archivo o carpeta del \
servidor al computador de la persona usa `descargar_archivo` (queda en su carpeta Descargas). Para subir algo del computador \
al servidor usa `subir_archivo`: NO lo sube, la app le pide confirmar con Aplicar.";

fn tool_guardar_comando(app: &AppHandle, input: &serde_json::Value) -> (ToolResult, Option<AccionAgente>) {
    let texto = |k: &str| input.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let comando = crate::cmd::comandos::Comando {
        id: String::new(),
        titulo: texto("titulo"),
        comando: texto("comando"),
        categoria: Some(texto("categoria")).filter(|c| !c.trim().is_empty()),
        terminal: Some(texto("terminal")).filter(|t| t == "linux" || t == "powershell"),
        creado: 0.0,
        actualizado: None,
    };
    match crate::cmd::comandos::guardar(app, comando) {
        Ok(c) => (
            ToolResult { tool: "guardar_comando".into(), output: format!("Guardado en Comandos: «{}» ({})", c.titulo, c.comando), ok: true },
            Some(AccionAgente::ComandoGuardado { titulo: c.titulo, comando: c.comando }),
        ),
        Err(e) => (ToolResult { tool: "guardar_comando".into(), output: format!("No se pudo guardar: {e}"), ok: false }, None),
    }
}

fn tool_leer_pines(session_id: &str) -> ToolResult {
    match crate::cmd::ssh::gpio::leer_pines(session_id) {
        Ok(pines) if pines.is_empty() => ToolResult { tool: "leer_pines".into(), output: "raspi-gpio no devolvió pines (¿es una Raspberry Pi?)".into(), ok: false },
        Ok(pines) => {
            let lineas: Vec<String> = pines.iter().filter(|p| p.gpio <= 27).map(|p| format!(
                "GPIO {}: {}, nivel {}, pull {}",
                p.gpio,
                match p.func.as_str() { "INPUT" => "entrada", "OUTPUT" => "salida", f => f },
                p.level.map(|l| if l == 1 { "alto (1)" } else { "bajo (0)" }).unwrap_or("?"),
                p.pull.as_deref().unwrap_or("?"),
            )).collect();
            ToolResult { tool: "leer_pines".into(), output: lineas.join("\n"), ok: true }
        }
        Err(e) => ToolResult { tool: "leer_pines".into(), output: format!("No se pudieron leer los pines: {}", e.message), ok: false },
    }
}

/// Valida el cambio pedido y lo deja PENDIENTE: la app muestra Aplicar/Cancelar y es la persona quien lo aplica.
fn tool_cambiar_pin(input: &serde_json::Value) -> (ToolResult, Option<AccionAgente>) {
    let gpio = input.get("gpio").and_then(|v| v.as_u64());
    let modo = input.get("modo").and_then(|v| v.as_str());
    let pull = input.get("pull").and_then(|v| v.as_str());
    let nivel = input.get("nivel").and_then(|v| v.as_u64());
    let error = |m: &str| (ToolResult { tool: "cambiar_pin".into(), output: m.to_string(), ok: false }, None);
    let Some(gpio) = gpio.filter(|g| *g <= 27) else { return error("GPIO inválido: debe ser un número BCM de 0 a 27") };
    if modo.is_some_and(|m| m != "entrada" && m != "salida") { return error("modo debe ser «entrada» o «salida»"); }
    if pull.is_some_and(|p| p != "arriba" && p != "abajo" && p != "ninguno") { return error("pull debe ser «arriba», «abajo» o «ninguno»"); }
    if nivel.is_some_and(|n| n > 1) { return error("nivel debe ser 0 o 1"); }
    if modo.is_none() && pull.is_none() && nivel.is_none() { return error("No hay nada que cambiar: indica modo, pull o nivel"); }
    let mut partes = vec![];
    if let Some(m) = modo { partes.push(format!("modo {m}")); }
    if let Some(p) = pull { partes.push(format!("pull {p}")); }
    if let Some(n) = nivel { partes.push(format!("nivel {}", if n == 1 { "alto" } else { "bajo" })); }
    (
        ToolResult {
            tool: "cambiar_pin".into(),
            output: format!("PENDIENTE DE CONFIRMAR: GPIO {gpio}, {}. La app le muestra a la persona Aplicar y Cancelar; todavía no está aplicado.", partes.join(", ")),
            ok: true,
        },
        Some(AccionAgente::CambioPin { gpio: gpio as u32, modo: modo.map(String::from), pull: pull.map(String::from), nivel: nivel.map(|n| n as u8) }),
    )
}

// ── descargar_archivo / subir_archivo ─────────────────────────────────────────

/// Nombre libre en `carpeta`: si `nombre` ya existe, «nombre (1).ext», «nombre (2).ext»…
fn nombre_libre(carpeta: &std::path::Path, nombre: &str) -> std::path::PathBuf {
    let primero = carpeta.join(nombre);
    if !primero.exists() { return primero; }
    let (base, ext) = match nombre.rfind('.') {
        Some(i) if i > 0 => (&nombre[..i], &nombre[i..]),
        _ => (nombre, ""),
    };
    (1..1000).map(|n| carpeta.join(format!("{base} ({n}){ext}"))).find(|p| !p.exists()).unwrap_or(primero)
}

fn carpeta_descargas() -> Option<std::path::PathBuf> {
    let dirs = directories::UserDirs::new()?;
    Some(dirs.download_dir().map(|d| d.to_path_buf()).unwrap_or_else(|| dirs.home_dir().to_path_buf()))
}

/// Comillas simples para el shell remoto.
fn comillas(s: &str) -> String { format!("'{}'", s.replace('\'', "'\\''")) }

/// Baja un archivo o una carpeta del servidor a Descargas, con la misma transferencia de la vista Archivos.
async fn tool_descargar_archivo(app: &AppHandle, session_id: &str, input: &serde_json::Value) -> (ToolResult, Option<AccionAgente>) {
    let fallo = |m: String| (ToolResult { tool: "descargar_archivo".into(), output: m, ok: false }, None);
    let Some(ruta) = input.get("ruta_remota").and_then(|v| v.as_str()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty()) else {
        return fallo("Falta 'ruta_remota'".into());
    };
    // ~ y rutas relativas: desde la carpeta personal en el servidor
    let sid = session_id.to_string();
    let r = ruta.clone();
    let consulta = tokio::task::spawn_blocking(move || {
        let ruta_shell = if r == "~" { "\"$HOME\"".to_string() } else if let Some(resto) = r.strip_prefix("~/") { format!("\"$HOME\"/{}", comillas(resto)) } else { comillas(&r) };
        run_ssh_exec(&sid, &format!("cd ~ && p=$(realpath -e -- {ruta_shell} 2>/dev/null) && {{ [ -d \"$p\" ] && echo \"dir $p\" || echo \"file $p\"; }} || echo nada"))
    }).await;
    let salida = match consulta {
        Ok(Ok(s)) => s.trim().to_string(),
        Ok(Err(e)) => return fallo(format!("No se pudo revisar la ruta en el servidor: {e}")),
        Err(_) => return fallo("Error interno".into()),
    };
    let (es_carpeta, absoluta) = match salida.split_once(' ') {
        Some(("dir", p)) => (true, p.to_string()),
        Some(("file", p)) => (false, p.to_string()),
        _ => return fallo(format!("No existe en el servidor: {ruta}")),
    };
    let Some(destino) = carpeta_descargas() else { return fallo("No se encontró la carpeta Descargas".into()) };
    let nombre = absoluta.rsplit('/').next().filter(|n| !n.is_empty()).unwrap_or("descarga").to_string();
    let local = nombre_libre(&destino, &nombre).to_string_lossy().to_string();
    let inicio = if es_carpeta {
        crate::cmd::sftp::transfers::sftp_download_dir_start(app.clone(), session_id.to_string(), absoluta.clone(), local.clone()).await
    } else {
        crate::cmd::sftp::transfers::sftp_download_start_impl(app.clone(), session_id.to_string(), absoluta.clone(), local.clone()).await
    };
    match inicio {
        Ok(_) => (
            ToolResult {
                tool: "descargar_archivo".into(),
                output: format!("Descargando a {local} (desde {absoluta}). El progreso se ve en Archivos."),
                ok: true,
            },
            Some(AccionAgente::Descarga { ruta_local: local, ruta_remota: absoluta }),
        ),
        Err(e) => fallo(format!("No se pudo descargar: {e}")),
    }
}

/// Valida lo pedido y lo deja PENDIENTE: la app muestra Aplicar/Cancelar y es la persona quien sube.
fn tool_subir_archivo(input: &serde_json::Value) -> (ToolResult, Option<AccionAgente>) {
    let fallo = |m: &str| (ToolResult { tool: "subir_archivo".into(), output: m.to_string(), ok: false }, None);
    let local = input.get("ruta_local").and_then(|v| v.as_str()).unwrap_or("").trim();
    let remota = input.get("ruta_remota").and_then(|v| v.as_str()).unwrap_or("").trim();
    if local.is_empty() || remota.is_empty() { return fallo("Faltan 'ruta_local' y 'ruta_remota'"); }
    let ruta = std::path::Path::new(local);
    let Ok(meta) = std::fs::metadata(ruta) else { return fallo("Ese archivo no existe en el computador de la persona") };
    let que = if meta.is_dir() { "la carpeta".to_string() } else { format!("el archivo ({} bytes)", meta.len()) };
    let destino = crate::cmd::sftp::transfers::destino_remoto(local, remota);
    (
        ToolResult {
            tool: "subir_archivo".into(),
            output: format!("PENDIENTE DE CONFIRMAR: subir {que} {local} a {destino}. La app le muestra a la persona Aplicar y Cancelar; todavía no se subió."),
            ok: true,
        },
        Some(AccionAgente::Subida { ruta_local: local.to_string(), ruta_remota: destino, es_carpeta: meta.is_dir() }),
    )
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
            "name": "guardar_comando",
            "description": "Guarda un comando en el panel Comandos de la persona (sus comandos guardados, antes snippets), para ejecutarlo luego con un clic. Úsalo cuando pida guardar algo como comando o snippet.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "titulo": { "type": "string", "description": "Nombre corto (p. ej. «Temperatura»)" },
                    "comando": { "type": "string", "description": "El comando exacto" },
                    "categoria": { "type": "string", "description": "Opcional (p. ej. «Servicios»)" },
                    "terminal": { "type": "string", "enum": ["linux", "powershell"], "description": "Dónde sirve; omítelo si sirve en cualquiera" }
                },
                "required": ["titulo", "comando"]
            }
        },
        {
            "name": "descargar_archivo",
            "description": "Baja un archivo o una carpeta del servidor de la sesión al computador de la persona (a su carpeta Descargas, sin pisar nada). Acepta rutas absolutas, con ~ o relativas a la carpeta personal.",
            "input_schema": {
                "type": "object",
                "properties": { "ruta_remota": { "type": "string", "description": "Ruta en el servidor (p. ej. ~/proyecto/datos.csv)" } },
                "required": ["ruta_remota"]
            }
        },
        {
            "name": "subir_archivo",
            "description": "Propone subir un archivo o carpeta del computador de la persona al servidor. NO lo sube: la app le pide confirmar. Si la ruta remota termina en /, se sube dentro de esa carpeta con el mismo nombre.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "ruta_local": { "type": "string", "description": "Ruta completa en el computador de la persona (p. ej. C:\\Users\\ana\\Desktop\\leds.py)" },
                    "ruta_remota": { "type": "string", "description": "Destino en el servidor (absoluto, p. ej. /home/pi/proyecto/ o /home/pi/proyecto/leds.py)" }
                },
                "required": ["ruta_local", "ruta_remota"]
            }
        },
        {
            "name": "leer_pines",
            "description": "Lee el estado actual de los pines GPIO de la Raspberry Pi de la sesión (modo, nivel y pull de cada uno). Úsalo antes de explicar o cambiar pines.",
            "input_schema": { "type": "object", "properties": {}, "required": [] }
        },
        {
            "name": "cambiar_pin",
            "description": "Propone cambiar un pin GPIO (numeración BCM). NO lo aplica: la app le pide a la persona que confirme. Indica al menos uno de modo, pull o nivel.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "gpio": { "type": "integer", "description": "Número BCM (0 a 27)" },
                    "modo": { "type": "string", "enum": ["entrada", "salida"] },
                    "pull": { "type": "string", "enum": ["arriba", "abajo", "ninguno"] },
                    "nivel": { "type": "integer", "enum": [0, 1], "description": "Solo para salida: 1 alto, 0 bajo" }
                },
                "required": ["gpio"]
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

/// Lo último que mostró la terminal, sin códigos de color, para que el agente sepa dónde está parada la persona.
fn terminal_reciente(session_id: &str, lineas: usize) -> Option<String> {
    static ANSI: Lazy<regex::Regex> = Lazy::new(|| regex::Regex::new(r"\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07|\r").unwrap());
    let crudo = get_terminal_context(session_id.to_string(), Some(120)).ok()?;
    let limpio = ANSI.replace_all(&crudo, "");
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
    if let Some(ctx) = req.contexto.as_deref().filter(|c| !c.trim().is_empty()) {
        system_prompt.push_str("\n\n=== SESIÓN ===\n");
        system_prompt.push_str(ctx);
        system_prompt.push_str("\n=== FIN DE LA SESIÓN ===");
    }
    system_prompt.push_str(INSTRUCCIONES_COMANDOS_Y_PINES);

    // La conversación anterior y el mensaje actual
    let mut messages: Vec<serde_json::Value> = mensajes_previos(req.historial.as_deref().unwrap_or(&[]));
    messages.push(serde_json::json!({ "role": "user", "content": req.message }));

    let client = &*HTTP_CLIENT;
    let mut steps: Vec<AgentStep> = vec![];
    let mut final_answer = String::new();

    // Construir lista de tools: built-in + MCP (cargadas desde caché en disco)
    let mut all_tools = tool_definitions();
    let mcp_defs = crate::cmd::integration::mcp_client::load_mcp_tool_defs();
    if let Some(arr) = all_tools.as_array_mut() {
        arr.extend(mcp_defs);
    }

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
