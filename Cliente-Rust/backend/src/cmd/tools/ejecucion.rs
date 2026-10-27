//! Ejecución de cada tool del agente (comandos, archivos, pines, descargas y subidas).

use tauri::AppHandle;
use super::ssh_helpers::{get_creds, run_ssh_exec, sftp_read, sftp_write};
use super::tools::{get_terminal_context, AccionAgente, ToolResult};

// ─────────────────────────────────────────────────────────────────────────────
// Ejecución interna de cada tool
// ─────────────────────────────────────────────────────────────────────────────

pub(super) fn exec_tool(session_id: &str, tool_name: &str, input: &serde_json::Value) -> ToolResult {
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
        other => ToolResult { tool: other.to_string(), output: format!("Tool desconocida: {other}"), ok: false },
    }
}

// ── guardar_comando / leer_pines / cambiar_pin ────────────────────────────────

pub(super) const INSTRUCCIONES_COMANDOS_Y_PINES: &str = "\n\n\
COMANDOS GUARDADOS: si la persona pide guardar algo como comando (o snippet), usa `guardar_comando` con un nombre corto y \
el comando exacto, y una descripción de para qué sirve. La app lo agrega a su panel Comandos.\n\
PINES (Raspberry Pi): para saber el estado de los GPIO usa `leer_pines` (incluye lo que la persona describió de cada uno). \
Para cambiar un pin usa `cambiar_pin`: NO lo aplica, la app le pide a la persona que confirme con Aplicar. Dile qué va a \
cambiar y que lo confirme; nunca digas que ya quedó aplicado.\n\
ARCHIVOS (SFTP): para crear o editar un archivo en el servidor usa `escribir_archivo`. Para bajar un archivo o carpeta del \
servidor al computador de la persona usa `descargar_archivo` (queda en su carpeta Descargas). Para subir algo del computador \
al servidor usa `subir_archivo`: NO lo sube, la app le pide confirmar con Aplicar.";

pub(super) fn tool_guardar_comando(app: &AppHandle, input: &serde_json::Value) -> (ToolResult, Option<AccionAgente>) {
    let texto = |k: &str| input.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let comando = crate::cmd::comandos::Comando {
        id: String::new(),
        titulo: texto("titulo"),
        comando: texto("comando"),
        descripcion: Some(texto("descripcion")).filter(|d| !d.trim().is_empty()),
        categoria: Some(texto("categoria")).filter(|c| !c.trim().is_empty()),
        terminal: Some(texto("terminal")).filter(|t| t == "linux" || t == "powershell"),
        creado: 0.0,
        actualizado: None,
    };
    match crate::cmd::comandos::guardar(app, comando) {
        Ok(c) => (
            ToolResult { tool: "guardar_comando".into(), output: format!("Guardado en Comandos: «{}» ({})", c.titulo, c.comando), ok: true },
            Some(AccionAgente::ComandoGuardado { titulo: c.titulo, comando: c.comando, descripcion: c.descripcion }),
        ),
        Err(e) => (ToolResult { tool: "guardar_comando".into(), output: format!("No se pudo guardar: {e}"), ok: false }, None),
    }
}

pub(super) fn tool_leer_pines(session_id: &str) -> ToolResult {
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
pub(super) fn tool_cambiar_pin(input: &serde_json::Value) -> (ToolResult, Option<AccionAgente>) {
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
pub(super) fn nombre_libre(carpeta: &std::path::Path, nombre: &str) -> std::path::PathBuf {
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
pub(super) async fn tool_descargar_archivo(app: &AppHandle, session_id: &str, input: &serde_json::Value) -> (ToolResult, Option<AccionAgente>) {
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
pub(super) fn tool_subir_archivo(input: &serde_json::Value) -> (ToolResult, Option<AccionAgente>) {
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
pub(super) fn tool_estado_raspberry() -> ToolResult {
    ToolResult {
        tool: "estado_raspberry".into(),
        output: crate::cmd::tools::pi4_config::pi4_status_summary(),
        ok: crate::cmd::tools::pi4_config::pi4_configured(),
    }
}

pub(super) fn tool_conectar_raspberry(session_id: &str) -> ToolResult {
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
pub(super) fn tool_get_terminal_output(session_id: &str, input: &serde_json::Value) -> ToolResult {
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
pub(super) fn tool_ejecutar_comando(session_id: &str, input: &serde_json::Value) -> ToolResult {
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
pub(super) fn tool_leer_archivo(session_id: &str, input: &serde_json::Value) -> ToolResult {
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
pub(super) fn tool_escribir_archivo(session_id: &str, input: &serde_json::Value) -> ToolResult {
    let path    = match input.get("ruta").and_then(|v| v.as_str()) { Some(p) => p.to_string(), None => return ToolResult { tool: "escribir_archivo".into(), output: "Falta 'ruta'".into(), ok: false } };
    let content = match input.get("contenido").and_then(|v| v.as_str()) { Some(c) => c.to_string(), None => return ToolResult { tool: "escribir_archivo".into(), output: "Falta 'contenido'".into(), ok: false } };
    match sftp_write(session_id, &path, content.as_bytes()) {
        Ok(_)  => ToolResult { tool: "escribir_archivo".into(), output: format!("Archivo '{path}' escrito ({} bytes)", content.len()), ok: true },
        Err(e) => ToolResult { tool: "escribir_archivo".into(), output: e, ok: false },
    }
}

// ── listar_directorio ─────────────────────────────────────────────────────────
pub(super) fn tool_listar_directorio(session_id: &str, input: &serde_json::Value) -> ToolResult {
    let path = input.get("ruta").and_then(|v| v.as_str()).unwrap_or("~").to_string();
    let cmd = format!("ls -la {path}");
    match run_ssh_exec(session_id, &cmd) {
        Ok(out) => ToolResult { tool: "listar_directorio".into(), output: out, ok: true },
        Err(e)  => ToolResult { tool: "listar_directorio".into(), output: e, ok: false },
    }
}

// ── info_sistema ──────────────────────────────────────────────────────────────
pub(super) fn tool_info_sistema(session_id: &str) -> ToolResult {
    let cmd = "echo '=== CPU ===' && top -bn1 | head -5 && echo '=== MEMORIA ===' && free -h && echo '=== DISCO ===' && df -h / && echo '=== UPTIME ===' && uptime";
    match run_ssh_exec(session_id, cmd) {
        Ok(out) => ToolResult { tool: "info_sistema".into(), output: out, ok: true },
        Err(e)  => ToolResult { tool: "info_sistema".into(), output: e, ok: false },
    }
}

// ── reiniciar_servicio ────────────────────────────────────────────────────────
pub(super) fn tool_reiniciar_servicio(session_id: &str, input: &serde_json::Value) -> ToolResult {
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
