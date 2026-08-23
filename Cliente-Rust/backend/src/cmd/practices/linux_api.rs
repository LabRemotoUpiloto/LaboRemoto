//! cmd/practices/linux_api — Cliente HTTP hacia el servicio de prácticas de
//! Linux (`practicas-linux-api`) que corre en la Raspberry Pi.
//!
//! A diferencia de las demás categorías (ver `practicas.rs`, todavía basadas
//! en `.env.practicas` + JSON local), el contenido y la validación de Linux
//! viven en un servicio propio en la Pi — este módulo es el único punto que
//! le habla por HTTP. La conexión SSH de trabajo (terminal del estudiante) no
//! pasa por acá: usa el mismo `ssh_connect` genérico que el resto de la app,
//! con el usuario resuelto de la sesión Keycloak y la contraseña pedida una
//! vez en el cliente (nunca gestionada desde este módulo).

use std::collections::HashMap;
use std::sync::Arc;

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};

use crate::cmd::protocol::CommandError;
use crate::session_manager::SessionManager;

static HTTP_CLIENT: Lazy<reqwest::Client> = Lazy::new(reqwest::Client::new);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinuxPracticeSummary {
    pub id: String,
    pub order: Option<u32>,
    pub title: String,
    pub difficulty: String,
    pub estimated_minutes: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinuxConnectionTarget {
    pub host: String,
    pub port: u16,
    pub user: String,
}

// ─── Config (.env.practicas) ───

#[derive(Debug, Clone)]
struct LinuxApiConfig {
    base_url: String,
    token: String,
    ssh_host: String,
    ssh_port: u16,
}

fn clean_env_value(value: &str) -> String {
    value.trim().trim_matches('"').trim_matches('\'').trim().to_string()
}

fn load_env_vars() -> HashMap<String, String> {
    let mut map = HashMap::new();
    let mut dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
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
                        map.entry(key.trim().to_string()).or_insert(clean_env_value(val));
                    }
                }
            }
        }
        match dir.parent() {
            Some(parent) => dir = parent,
            None => break,
        }
    }
    map
}

fn load_config() -> Result<LinuxApiConfig, CommandError> {
    let vars = load_env_vars();

    let api_host = vars.get("PRACTICE_LINUX_API_HOST").cloned().ok_or_else(|| {
        CommandError::permanent(
            "VALIDATION_FAILED",
            "PRACTICE_LINUX_API_HOST no configurado en .env.practicas",
        )
    })?;
    let api_port: u16 = vars
        .get("PRACTICE_LINUX_API_PORT")
        .and_then(|v| v.parse().ok())
        .unwrap_or(8770);
    let token = vars.get("PRACTICE_LINUX_API_TOKEN").cloned().ok_or_else(|| {
        CommandError::permanent(
            "VALIDATION_FAILED",
            "PRACTICE_LINUX_API_TOKEN no configurado en .env.practicas",
        )
    })?;

    // El host SSH puede ser distinto del host de la API (mismo caso hoy, pero
    // separado para cuando haya pool de Pis por curso — ver diseño de arquitectura).
    let ssh_host = vars.get("PRACTICE_LINUX_SSH_HOST").cloned().unwrap_or_else(|| api_host.clone());
    let ssh_port: u16 = vars
        .get("PRACTICE_LINUX_SSH_PORT")
        .and_then(|v| v.parse().ok())
        .unwrap_or(22);

    Ok(LinuxApiConfig {
        base_url: format!("http://{}:{}", api_host, api_port),
        token,
        ssh_host,
        ssh_port,
    })
}

// ─── HTTP helpers ───

fn map_reqwest_err(e: reqwest::Error, operation: &str, resource: &str) -> CommandError {
    let err = if e.is_timeout() {
        CommandError::transient(
            "OPERATION_TIMEOUT",
            format!("Timeout contactando el servicio de prácticas de Linux: {}", e),
        )
    } else {
        CommandError::transient(
            "LINUX_API_REQUEST_ERROR",
            format!("Error contactando el servicio de prácticas de Linux: {}", e),
        )
    };
    err.with_context(operation, resource)
}

async fn handle_response(
    resp: reqwest::Response,
    operation: &str,
    resource: &str,
) -> Result<serde_json::Value, CommandError> {
    let status = resp.status();
    let text = resp.text().await.map_err(|e| {
        CommandError::transient("LINUX_API_REQUEST_ERROR", format!("Error leyendo respuesta: {}", e))
            .with_context(operation, resource)
    })?;

    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err(
            CommandError::permanent("AUTH_FAILED", "Token inválido para el servicio de prácticas de Linux")
                .with_context(operation, resource),
        );
    }
    if status == reqwest::StatusCode::NOT_FOUND {
        return Err(
            CommandError::permanent("RESOURCE_NOT_FOUND", format!("No encontrado en la Pi: {}", resource))
                .with_context(operation, resource),
        );
    }
    if !status.is_success() {
        return Err(CommandError::transient(
            "LINUX_API_REQUEST_ERROR",
            format!("El servicio de prácticas respondió {}: {}", status, text),
        )
        .with_context(operation, resource));
    }

    serde_json::from_str(&text).map_err(|e| {
        CommandError::permanent("INVALID_JSON", format!("JSON inválido del servicio de prácticas: {}", e))
            .with_context(operation, resource)
    })
}

async fn api_get(config: &LinuxApiConfig, path: &str) -> Result<serde_json::Value, CommandError> {
    let url = format!("{}{}", config.base_url, path);
    let resp = HTTP_CLIENT
        .get(&url)
        .header("Authorization", format!("Bearer {}", config.token))
        .send()
        .await
        .map_err(|e| map_reqwest_err(e, "linux_api_get", path))?;
    handle_response(resp, "linux_api_get", path).await
}

async fn api_post(
    config: &LinuxApiConfig,
    path: &str,
    body: &serde_json::Value,
) -> Result<serde_json::Value, CommandError> {
    let url = format!("{}{}", config.base_url, path);
    let resp = HTTP_CLIENT
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.token))
        .json(body)
        .send()
        .await
        .map_err(|e| map_reqwest_err(e, "linux_api_post", path))?;
    handle_response(resp, "linux_api_post", path).await
}

async fn current_username(manager: &Arc<dyn SessionManager>) -> Result<String, CommandError> {
    let info = manager
        .session_info()
        .await
        .map_err(|e| CommandError::internal("SESSION_ERROR", e.to_string()))?;
    info.map(|s| s.preferred_username)
        .ok_or_else(|| CommandError::permanent("AUTH_FAILED", "No hay sesión activa"))
}

// ─── Comandos Tauri ───

/// Lista los módulos de Linux disponibles (metadata liviana). Función libre
/// (no `#[tauri::command]`) para que `practicas.rs` también pueda llamarla
/// al armar la categoría "linux" de `practicas_list_categories`.
pub async fn fetch_linux_summaries() -> Result<Vec<LinuxPracticeSummary>, CommandError> {
    let config = load_config()?;
    let value = api_get(&config, "/practices").await?;
    serde_json::from_value(value).map_err(|e| {
        CommandError::permanent("INVALID_JSON", format!("No se pudo interpretar la lista de módulos: {}", e))
    })
}

#[tauri::command]
pub async fn practicas_linux_list() -> Result<Vec<LinuxPracticeSummary>, CommandError> {
    fetch_linux_summaries().await
}

/// Devuelve el contenido completo en bloques de un módulo (objective, blocks,
/// hints, validation_rules — ver diseño de arquitectura). Se pasa como JSON
/// crudo al frontend: el schema de bloques todavía está en evolución.
#[tauri::command]
pub async fn practicas_linux_get_module(practice_id: String) -> Result<serde_json::Value, CommandError> {
    let config = load_config()?;
    api_get(&config, &format!("/practices/{}", practice_id)).await
}

/// Valida el progreso del estudiante autenticado contra las reglas del
/// módulo. El `student` NO viene del cliente — se resuelve server-side desde
/// la sesión Keycloak activa, para que no se pueda falsear.
#[tauri::command]
pub async fn practicas_linux_validate(
    practice_id: String,
    command_history: Vec<String>,
    manager: tauri::State<'_, Arc<dyn SessionManager>>,
) -> Result<serde_json::Value, CommandError> {
    let manager = manager.inner().clone();
    let student = current_username(&manager).await?;
    let config = load_config()?;

    let body = serde_json::json!({
        "student": student,
        "command_history": command_history,
    });

    api_post(&config, &format!("/practices/{}/validate", practice_id), &body).await
}

/// Host/puerto/usuario para que el frontend abra la sesión SSH de trabajo del
/// estudiante — el usuario es su username de Keycloak (mismo del Active
/// Directory de la U con el que la Pi ya le crea su homedir). La contraseña
/// NO se resuelve acá: se le pide al estudiante en un diálogo nativo justo
/// antes de conectar, y nunca pasa por este backend salvo para abrir el
/// socket SSH (mismo camino que ya usa `ssh_connect` para el resto de la app).
#[tauri::command]
pub async fn practicas_linux_connection_target(
    manager: tauri::State<'_, Arc<dyn SessionManager>>,
) -> Result<LinuxConnectionTarget, CommandError> {
    let manager = manager.inner().clone();
    let user = current_username(&manager).await?;
    let config = load_config()?;

    Ok(LinuxConnectionTarget {
        host: config.ssh_host,
        port: config.ssh_port,
        user,
    })
}
