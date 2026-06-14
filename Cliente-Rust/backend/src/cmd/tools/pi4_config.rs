//! Credenciales Raspberry Pi desde variables de entorno (.env).
//! Usadas por el agente cuando no hay sesión SSH interactiva activa.

use once_cell::sync::Lazy;
use std::sync::Mutex;

/// ID de sesión sintético que indica «usar PI4_* del .env».
pub const PI4_ENV_SESSION_ID: &str = "__pi4_env__";

pub const DEFAULT_PI4_HOST: &str = "200.115.181.211";
pub const DEFAULT_PI4_PORT: u16 = 9000;

#[derive(Debug, Clone)]
pub struct Pi4Creds {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
}

static DID_DOTENV: Lazy<Mutex<bool>> = Lazy::new(|| Mutex::new(false));

fn ensure_dotenv() {
    if let Ok(mut g) = DID_DOTENV.lock() {
        if !*g {
            let _ = dotenvy::dotenv();
            let mut dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
            loop {
                let _ = dotenvy::from_path(dir.join(".env"));
                if dir.join(".env").exists() {
                    break;
                }
                match dir.parent() {
                    Some(parent) => dir = parent,
                    None => break,
                }
            }
            *g = true;
        }
    }
}

fn trim_env(raw: &str) -> String {
    raw.trim().trim_matches('"').trim_matches('\'').to_string()
}

fn env_var(keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Ok(raw) = std::env::var(key) {
            let v = trim_env(&raw);
            if !v.is_empty() {
                return Some(v);
            }
        }
    }
    None
}

/// Parsea el valor tras `KEY=` tolerando comillas sin cerrar y caracteres especiales.
fn parse_dotenv_value(raw: &str) -> String {
    let s = raw.trim();
    if s.is_empty() {
        return String::new();
    }
    if s.starts_with('\'') {
        let inner = &s[1..];
        if let Some(end) = inner.rfind('\'') {
            return inner[..end].to_string();
        }
        return inner.to_string();
    }
    if s.starts_with('"') {
        let inner = &s[1..];
        if let Some(end) = inner.rfind('"') {
            let quoted = &inner[..end];
            return quoted.replace("\"\"", "\"").replace("\\\"", "\"");
        }
        // Comilla de apertura sin cierre (común en .env editados a mano)
        return inner.replace("\"\"", "\"").replace("\\\"", "\"");
    }
    s.to_string()
}

/// Lee PI4_* directamente del archivo .env (fallback si dotenvy falla con la contraseña).
fn load_pi4_from_env_files() -> Option<(String, String, Option<String>, Option<u16>)> {
    let mut dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    loop {
        let path = dir.join(".env");
        if path.is_file() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                let mut user = None;
                let mut password = None;
                let mut host = None;
                let mut port = None;
                for line in content.lines() {
                    let line = line.trim();
                    if line.is_empty() || line.starts_with('#') {
                        continue;
                    }
                    let Some((key, raw_val)) = line.split_once('=') else {
                        continue;
                    };
                    let key = key.trim();
                    let val = parse_dotenv_value(raw_val);
                    if val.is_empty() {
                        continue;
                    }
                    match key {
                        "PI4_USER" | "pi4_user" if user.is_none() => user = Some(val),
                        "PI4_PASSWORD" | "pi4_password" if password.is_none() => password = Some(val),
                        "PI4_HOST" | "pi4_host" if host.is_none() => host = Some(val),
                        "PI4_PORT" | "pi4_port" if port.is_none() => port = val.parse().ok(),
                        _ => {}
                    }
                }
                if let (Some(u), Some(p)) = (user, password) {
                    return Some((u, p, host, port));
                }
            }
        }
        match dir.parent() {
            Some(parent) => dir = parent,
            None => break,
        }
    }
    None
}

/// Carga host, puerto, usuario y contraseña de la Raspberry desde .env.
pub fn load_pi4_creds() -> Option<Pi4Creds> {
    ensure_dotenv();

    let user = env_var(&["PI4_USER", "pi4_user"]);
    let password = env_var(&["PI4_PASSWORD", "pi4_password"]);
    let host = env_var(&["PI4_HOST", "pi4_host"]);
    let port = env_var(&["PI4_PORT", "pi4_port"]).and_then(|p| p.parse().ok());

    if let (Some(user), Some(password)) = (user, password) {
        return Some(Pi4Creds {
            host: host.unwrap_or_else(|| DEFAULT_PI4_HOST.to_string()),
            port: port.unwrap_or(DEFAULT_PI4_PORT),
            user,
            password,
        });
    }

    let (user, password, host, port) = load_pi4_from_env_files()?;
    Some(Pi4Creds {
        host: host.unwrap_or_else(|| DEFAULT_PI4_HOST.to_string()),
        port: port.unwrap_or(DEFAULT_PI4_PORT),
        user,
        password,
    })
}

pub fn pi4_configured() -> bool {
    load_pi4_creds().is_some()
}

/// Resumen seguro (sin contraseña) para mostrar al agente/usuario.
pub fn pi4_status_summary() -> String {
    match load_pi4_creds() {
        Some(c) => format!(
            "Raspberry Pi configurada en .env\n  host: {}\n  port: {}\n  user: {}\n  password: [configurada, {} caracteres]",
            c.host,
            c.port,
            c.user,
            c.password.len()
        ),
        None => format!(
            "Raspberry Pi NO configurada. Define PI4_USER y PI4_PASSWORD en Cliente-Rust/.env \
             (opcional: PI4_HOST, PI4_PORT; por defecto {DEFAULT_PI4_HOST}:{DEFAULT_PI4_PORT})."
        ),
    }
}

#[tauri::command]
pub fn pi4_agent_ready() -> bool {
    pi4_configured()
}
