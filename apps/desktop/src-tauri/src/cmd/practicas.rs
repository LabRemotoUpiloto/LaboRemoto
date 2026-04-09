// cmd/practicas.rs — Módulo Rust para el sistema de prácticas de laboratorio.
// Lee la configuración desde .env.practicas y expone comandos Tauri al frontend.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

// ─── Tipos serializables para el frontend ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PracticeCategory {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub color: String,
    pub practices: Vec<Practice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Practice {
    pub id: String,
    pub name: String,
    pub description: String,
    pub difficulty: String, // "beginner" | "intermediate" | "advanced"
    pub connection: PracticeConnection,
    pub terminal: TerminalConfig,
    pub panels: PanelConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PracticeConnection {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    /// Comandos SSH de setup pre-práctica (ej: levantar servidor del robot)
    pub setup_commands: Vec<SetupCommand>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetupCommand {
    /// Host al que conectarse para ejecutar este setup (puede ser otro equipo, ej: el robot)
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    /// Directorio donde ejecutar
    pub working_dir: String,
    /// Comando a ejecutar
    pub command: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalConfig {
    pub allowed_commands: Vec<String>,
    pub working_directory: String,
    pub allow_navigation: bool,
    pub allow_nano: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PanelConfig {
    pub camera: bool,
    pub chat: bool,
    pub chat_context: String,
    pub chat_tutorial: String,
}

// ─── Helper: leer variables del .env.practicas ───

fn load_practices_env() -> HashMap<String, String> {
    let mut map = HashMap::new();

    // Buscar .env.practicas desde CARGO_MANIFEST_DIR hacia arriba
    let mut dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    loop {
        let candidate = dir.join(".env.practicas");
        if candidate.exists() {
            if let Ok(content) = std::fs::read_to_string(&candidate) {
                for line in content.lines() {
                    let trimmed = line.trim();
                    if trimmed.is_empty() || trimmed.starts_with('#') {
                        continue;
                    }
                    if let Some((key, val)) = trimmed.split_once('=') {
                        map.insert(key.trim().to_string(), val.trim().to_string());
                    }
                }
            }
            break;
        }
        match dir.parent() {
            Some(parent) => dir = parent,
            None => break,
        }
    }

    map
}

fn env_get(vars: &HashMap<String, String>, key: &str) -> String {
    vars.get(key).cloned().unwrap_or_default()
}

fn env_get_u16(vars: &HashMap<String, String>, key: &str, default: u16) -> u16 {
    vars.get(key)
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn env_get_bool(vars: &HashMap<String, String>, key: &str) -> bool {
    vars.get(key)
        .map(|v| v.to_lowercase() == "true" || v == "1")
        .unwrap_or(false)
}

fn env_get_cmds(vars: &HashMap<String, String>, key: &str) -> Vec<String> {
    vars.get(key)
        .map(|v| v.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect())
        .unwrap_or_default()
}

// ─── Helper: leer contexto desde JSON ───
fn load_practice_json(id: &str) -> (String, String) {
    let mut dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    loop {
        let candidate = dir.join("practicas").join(format!("{}.json", id));
        if candidate.exists() {
            if let Ok(content) = std::fs::read_to_string(&candidate) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    let ctx = val.get("context").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let tut = val.get("tutorial").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    return (ctx, tut);
                }
            }
        }
        match dir.parent() {
            Some(parent) => dir = parent,
            None => break,
        }
    }
    ("".to_string(), "".to_string())
}

// ─── Construir categorías desde .env.practicas ───

fn build_categories(vars: &HashMap<String, String>) -> Vec<PracticeCategory> {
    let mut categories = Vec::new();

    // ── Eve3 ──
    let rpi_host = env_get(vars, "PRACTICE_EVE3_RPI_HOST");
    let rpi_port = env_get_u16(vars, "PRACTICE_EVE3_RPI_PORT", 22);
    let rpi_user = env_get(vars, "PRACTICE_EVE3_RPI_USER");
    let rpi_password = env_get(vars, "PRACTICE_EVE3_RPI_PASSWORD");

    let robot_host = env_get(vars, "PRACTICE_EVE3_ROBOT_HOST");
    let robot_port = env_get_u16(vars, "PRACTICE_EVE3_ROBOT_PORT", 22);
    let robot_user = env_get(vars, "PRACTICE_EVE3_ROBOT_USER");
    let robot_password = env_get(vars, "PRACTICE_EVE3_ROBOT_PASSWORD");
    let robot_script_dir = env_get(vars, "PRACTICE_EVE3_ROBOT_SCRIPT_DIR");
    let robot_script_cmd = env_get(vars, "PRACTICE_EVE3_ROBOT_SCRIPT_CMD");

    let mut eve3_practices = Vec::new();

    // Práctica 1
    let p1_name = env_get(vars, "PRACTICE_EVE3_P1_NAME");
    if !p1_name.is_empty() {
        eve3_practices.push(Practice {
            id: "eve3-p1".into(),
            name: p1_name,
            description: env_get(vars, "PRACTICE_EVE3_P1_DESC"),
            difficulty: env_get(vars, "PRACTICE_EVE3_P1_DIFFICULTY"),
            connection: PracticeConnection {
                host: rpi_host.clone(),
                port: rpi_port,
                user: rpi_user.clone(),
                password: rpi_password.clone(),
                setup_commands: vec![
                    SetupCommand {
                        host: robot_host.clone(),
                        port: robot_port,
                        user: robot_user.clone(),
                        password: robot_password.clone(),
                        working_dir: robot_script_dir.clone(),
                        command: robot_script_cmd.clone(),
                    }
                ],
            },
            terminal: TerminalConfig {
                allowed_commands: env_get_cmds(vars, "PRACTICE_EVE3_P1_ALLOWED_CMDS"),
                working_directory: env_get(vars, "PRACTICE_EVE3_P1_WORKING_DIR"),
                allow_navigation: env_get_bool(vars, "PRACTICE_EVE3_P1_ALLOW_NAV"),
                allow_nano: env_get_bool(vars, "PRACTICE_EVE3_P1_ALLOW_NANO"),
            },
            panels: {
                let (json_ctx, json_tut) = load_practice_json("eve3-p1");
                let fallback_ctx = env_get(vars, "PRACTICE_EVE3_P1_CHAT_CONTEXT");
                PanelConfig {
                    camera: env_get_bool(vars, "PRACTICE_EVE3_P1_CAMERA"),
                    chat: true,
                    chat_context: if !json_ctx.is_empty() { json_ctx } else { fallback_ctx },
                    chat_tutorial: json_tut,
                }
            },
        });
    }

    // Práctica 2
    let p2_name = env_get(vars, "PRACTICE_EVE3_P2_NAME");
    if !p2_name.is_empty() {
        eve3_practices.push(Practice {
            id: "eve3-p2".into(),
            name: p2_name,
            description: env_get(vars, "PRACTICE_EVE3_P2_DESC"),
            difficulty: env_get(vars, "PRACTICE_EVE3_P2_DIFFICULTY"),
            connection: PracticeConnection {
                host: rpi_host.clone(),
                port: rpi_port,
                user: rpi_user.clone(),
                password: rpi_password.clone(),
                setup_commands: vec![
                    SetupCommand {
                        host: robot_host.clone(),
                        port: robot_port,
                        user: robot_user.clone(),
                        password: robot_password.clone(),
                        working_dir: robot_script_dir.clone(),
                        command: robot_script_cmd.clone(),
                    }
                ],
            },
            terminal: TerminalConfig {
                allowed_commands: env_get_cmds(vars, "PRACTICE_EVE3_P2_ALLOWED_CMDS"),
                working_directory: env_get(vars, "PRACTICE_EVE3_P2_WORKING_DIR"),
                allow_navigation: env_get_bool(vars, "PRACTICE_EVE3_P2_ALLOW_NAV"),
                allow_nano: env_get_bool(vars, "PRACTICE_EVE3_P2_ALLOW_NANO"),
            },
            panels: {
                let (json_ctx, json_tut) = load_practice_json("eve3-p2");
                let fallback_ctx = env_get(vars, "PRACTICE_EVE3_P2_CHAT_CONTEXT");
                PanelConfig {
                    camera: env_get_bool(vars, "PRACTICE_EVE3_P2_CAMERA"),
                    chat: true,
                    chat_context: if !json_ctx.is_empty() { json_ctx } else { fallback_ctx },
                    chat_tutorial: json_tut,
                }
            },
        });
    }

    categories.push(PracticeCategory {
        id: "eve3".into(),
        name: "Eve3".into(),
        description: "Prácticas con el robot Eve3 — Control y programación robótica".into(),
        icon: "robot".into(),
        color: "#10b981".into(),
        practices: eve3_practices,
    });

    // ── Linux (futuro) ──
    categories.push(PracticeCategory {
        id: "linux".into(),
        name: "Linux".into(),
        description: "Fundamentos de administración y comandos Linux".into(),
        icon: "terminal".into(),
        color: "#f59e0b".into(),
        practices: Vec::new(),
    });

    // ── Circuitos (futuro) ──
    categories.push(PracticeCategory {
        id: "circuitos".into(),
        name: "Circuitos".into(),
        description: "Prácticas de electrónica y diseño de circuitos".into(),
        icon: "circuit".into(),
        color: "#8b5cf6".into(),
        practices: Vec::new(),
    });

    categories
}

// ─── Comandos Tauri ───

/// Devuelve todas las categorías con sus prácticas (sin contraseñas)
#[tauri::command]
pub fn practicas_list_categories() -> Result<Vec<PracticeCategory>, String> {
    let vars = load_practices_env();
    let mut categories = build_categories(&vars);

    // Sanitizar: no enviar contraseñas al frontend
    for cat in &mut categories {
        for p in &mut cat.practices {
            p.connection.password = String::new();
            for sc in &mut p.connection.setup_commands {
                sc.password = String::new();
            }
        }
    }

    Ok(categories)
}

/// Devuelve la configuración completa de una práctica (para uso interno al iniciar)
#[tauri::command]
pub fn practicas_get_config(practice_id: String) -> Result<Practice, String> {
    let vars = load_practices_env();
    let categories = build_categories(&vars);

    for cat in &categories {
        for p in &cat.practices {
            if p.id == practice_id {
                return Ok(p.clone());
            }
        }
    }

    Err(format!("Práctica no encontrada: {}", practice_id))
}

/// Ejecuta los comandos de setup de una práctica (ej: levantar servidor del robot)
/// Emite eventos `practice:log` con el progreso paso a paso.
/// Devuelve el resultado de cada comando de setup.
#[tauri::command]
pub async fn practicas_run_setup(app: tauri::AppHandle, practice_id: String) -> Result<Vec<String>, String> {
    use tauri::Emitter;

    let vars = load_practices_env();
    let categories = build_categories(&vars);

    let practice = categories.iter()
        .flat_map(|c| c.practices.iter())
        .find(|p| p.id == practice_id)
        .ok_or_else(|| format!("Práctica no encontrada: {}", practice_id))?
        .clone();

    let _ = app.emit("practice:log", serde_json::json!({
        "practice_id": practice_id,
        "level": "info",
        "message": format!("🚀 Iniciando práctica: {}", practice.name)
    }));

    let mut results = Vec::new();

    for (i, setup) in practice.connection.setup_commands.iter().enumerate() {
        if setup.host.is_empty() || setup.command.is_empty() {
            continue;
        }

        let host = setup.host.clone();
        let port = setup.port;
        let user = setup.user.clone();
        let password = setup.password.clone();
        let working_dir = setup.working_dir.clone();
        let command = setup.command.clone();
        let step_label = format!("Setup #{} — {}@{}:{}", i + 1, user, host, port);

        // Log: Connecting
        let _ = app.emit("practice:log", serde_json::json!({
            "practice_id": practice_id,
            "level": "info",
            "message": format!("🔌 Conectando por SSH al robot ({}@{}:{})...", user, host, port)
        }));

        let app_clone = app.clone();
        let pid = practice_id.clone();

        let result = tokio::task::spawn_blocking(move || -> Result<String, String> {
            // 1. TCP connect
            let tcp = match std::net::TcpStream::connect(format!("{}:{}", host, port)) {
                Ok(tcp) => {
                    let _ = app_clone.emit("practice:log", serde_json::json!({
                        "practice_id": pid,
                        "level": "success",
                        "message": format!("✅ Conexión TCP exitosa a {}:{}", host, port)
                    }));
                    tcp
                }
                Err(e) => {
                    let msg = format!("❌ Error de conexión a {}:{} — {}", host, port, e);
                    let _ = app_clone.emit("practice:log", serde_json::json!({
                        "practice_id": pid,
                        "level": "error",
                        "message": msg
                    }));
                    return Err(msg);
                }
            };

            // 2. SSH handshake + auth
            let _ = app_clone.emit("practice:log", serde_json::json!({
                "practice_id": pid,
                "level": "info",
                "message": format!("🔑 Autenticando como '{}'...", user)
            }));

            let mut sess = ssh2::Session::new().map_err(|e| e.to_string())?;
            sess.set_tcp_stream(tcp);

            if let Err(e) = sess.handshake() {
                let msg = format!("❌ Error en handshake SSH — {}", e);
                let _ = app_clone.emit("practice:log", serde_json::json!({
                    "practice_id": pid,
                    "level": "error",
                    "message": msg
                }));
                return Err(msg);
            }

            if let Err(e) = sess.userauth_password(&user, &password) {
                let msg = format!("❌ Autenticación rechazada para '{}' — {}", user, e);
                let _ = app_clone.emit("practice:log", serde_json::json!({
                    "practice_id": pid,
                    "level": "error",
                    "message": msg
                }));
                return Err(msg);
            }

            let _ = app_clone.emit("practice:log", serde_json::json!({
                "practice_id": pid,
                "level": "success",
                "message": format!("✅ Autenticación exitosa como '{}'", user)
            }));

            // 3. Execute setup command
            let full_cmd = if working_dir.is_empty() {
                command.clone()
            } else {
                format!("cd {} && nohup {} > /dev/null 2>&1 &", working_dir, command)
            };

            let _ = app_clone.emit("practice:log", serde_json::json!({
                "practice_id": pid,
                "level": "info",
                "message": format!("⚙️ Ejecutando: {}", command)
            }));

            let mut ch = match sess.channel_session() {
                Ok(ch) => ch,
                Err(e) => {
                    let msg = format!("❌ Error abriendo canal SSH — {}", e);
                    let _ = app_clone.emit("practice:log", serde_json::json!({
                        "practice_id": pid,
                        "level": "error",
                        "message": msg
                    }));
                    return Err(msg);
                }
            };

            if let Err(e) = ch.exec(&full_cmd) {
                let msg = format!("❌ Error ejecutando script — {}", e);
                let _ = app_clone.emit("practice:log", serde_json::json!({
                    "practice_id": pid,
                    "level": "error",
                    "message": msg
                }));
                return Err(msg);
            }

            use std::io::Read;
            let mut output = String::new();
            let _ = ch.read_to_string(&mut output);
            let _ = ch.wait_close();
            let exit = ch.exit_status().unwrap_or(-1);

            if exit == 0 || exit == -1 {
                let _ = app_clone.emit("practice:log", serde_json::json!({
                    "practice_id": pid,
                    "level": "success",
                    "message": format!("✅ Script ejecutado correctamente (exit: {})", exit)
                }));
            } else {
                let _ = app_clone.emit("practice:log", serde_json::json!({
                    "practice_id": pid,
                    "level": "warning",
                    "message": format!("⚠️ Script terminó con código: {} — {}", exit, output.trim())
                }));
            }

            Ok(format!("{}: exit={}", step_label, exit))
        })
        .await
        .map_err(|e| format!("Task join error: {}", e))?;

        results.push(result?);
    }

    // Log: Now connecting to workspace (Raspberry)
    let _ = app.emit("practice:log", serde_json::json!({
        "practice_id": practice_id,
        "level": "info",
        "message": format!("🖥️ Conectando al workspace ({}@{}:{})...", practice.connection.user, practice.connection.host, practice.connection.port)
    }));

    Ok(results)
}
