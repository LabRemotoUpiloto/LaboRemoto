//! cmd/practices/linux_api — Cliente HTTP hacia el servicio de prácticas de
//! Linux (`practicas-linux-api`) que corre en la Raspberry Pi.
//!
//! A diferencia de las demás categorías (ver `practicas.rs`, basadas en JSON
//! local), el contenido y la validación de Linux viven en un servicio propio
//! en la Pi — este módulo es el único punto que
//! le habla por HTTP. La conexión SSH de trabajo (terminal del estudiante) no
//! pasa por acá: usa el mismo `ssh_connect` genérico que el resto de la app,
//! con el usuario resuelto de la sesión Keycloak y la contraseña pedida una
//! vez en el cliente (nunca gestionada desde este módulo).

use std::sync::Arc;

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};

use crate::cmd::practices::linux_tunnel::{self, TunnelConfig};
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

// ─── Config (.env, raíz del repo — variables PRACTICE_LINUX_*) ───
//
// Antes vivía en un `.env.practicas` aparte con su propio parser manual
// (mismo patrón que practicas.rs para Eve3/Circuitos, duplicado). Se
// consolidó en el único `.env` de la app: `dotenvy::dotenv()` ya lo carga al
// arrancar (ver lib.rs), así que alcanza con leer el entorno del proceso.

#[derive(Debug, Clone)]
struct LinuxApiConfig {
    tunnel: TunnelConfig,
    token: String,
    ssh_host: String,
    ssh_port: u16,
}

fn env_var(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|v| !v.trim().is_empty())
}

fn load_config() -> Result<LinuxApiConfig, CommandError> {
    let missing = |key: &str| {
        CommandError::permanent("VALIDATION_FAILED", format!("{key} no configurado en .env"))
    };

    // Cuenta de servicio restringida (sin shell, forwarding local limitado a
    // un único puerto en la Pi vía PermitOpen) — ver linux_tunnel.rs. Es el
    // único camino habilitado hoy hacia la API; no hay modo "HTTP directo"
    // porque el puerto 8770 no está expuesto a internet (a propósito).
    let tunnel_host = env_var("PRACTICE_LINUX_TUNNEL_HOST").ok_or_else(|| missing("PRACTICE_LINUX_TUNNEL_HOST"))?;
    let tunnel_port: u16 = env_var("PRACTICE_LINUX_TUNNEL_PORT").and_then(|v| v.parse().ok()).unwrap_or(22);
    let tunnel_user = env_var("PRACTICE_LINUX_TUNNEL_USER").ok_or_else(|| missing("PRACTICE_LINUX_TUNNEL_USER"))?;
    let tunnel_password = env_var("PRACTICE_LINUX_TUNNEL_PASSWORD").ok_or_else(|| missing("PRACTICE_LINUX_TUNNEL_PASSWORD"))?;
    let remote_port: u16 = env_var("PRACTICE_LINUX_API_REMOTE_PORT").and_then(|v| v.parse().ok()).unwrap_or(8770);

    let token = env_var("PRACTICE_LINUX_API_TOKEN").ok_or_else(|| missing("PRACTICE_LINUX_API_TOKEN"))?;

    // El host SSH de trabajo (terminal del estudiante) es independiente del
    // host del túnel de servicio — separado para cuando haya pool de Pis por
    // curso (ver diseño de arquitectura).
    let ssh_host = env_var("PRACTICE_LINUX_SSH_HOST").unwrap_or_else(|| tunnel_host.clone());
    let ssh_port: u16 = env_var("PRACTICE_LINUX_SSH_PORT").and_then(|v| v.parse().ok()).unwrap_or(22);

    Ok(LinuxApiConfig {
        tunnel: TunnelConfig {
            host: tunnel_host,
            port: tunnel_port,
            user: tunnel_user,
            password: tunnel_password,
            remote_host: "127.0.0.1".to_string(),
            remote_port,
        },
        token,
        ssh_host,
        ssh_port,
    })
}

async fn resolve_base_url(config: &LinuxApiConfig) -> Result<String, CommandError> {
    let local_port = linux_tunnel::ensure_tunnel(config.tunnel.clone())
        .await
        .map_err(|e| CommandError::transient("LINUX_TUNNEL_ERROR", format!("No se pudo establecer el túnel hacia la Pi: {e}")))?;
    Ok(format!("http://127.0.0.1:{local_port}"))
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
    let base_url = resolve_base_url(config).await?;
    let url = format!("{}{}", base_url, path);
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
    let base_url = resolve_base_url(config).await?;
    let url = format!("{}{}", base_url, path);
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
    let username = current_username(&manager).await?;
    let config = load_config()?;

    // El AD de la U exige el dominio en el login. La Pi usa sssd con
    // use_fully_qualified_names=true (ver /etc/sssd/sssd.conf,
    // domain/upiloto.edu) — el nombre canónico que resuelve ahí es
    // "usuario@upiloto.edu" (verificado con getent y con una conexión real),
    // no el formato NetBIOS "UPILOTO\usuario" que usa el resto de la app
    // para SSH manual. El username de Keycloak (preferred_username) no trae
    // el dominio, así que se agrega acá.
    let user = format!("{username}@upiloto.edu");

    Ok(LinuxConnectionTarget {
        host: config.ssh_host,
        port: config.ssh_port,
        user,
    })
}
