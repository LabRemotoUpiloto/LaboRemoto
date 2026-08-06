//! cmd/nvr/shinobi — Cliente de API del NVR Shinobi
//!
//! Reemplaza el consumo de cámaras vía túnel SSH + MediaMTX
//! (`cmd::streaming::stream`) por consumo directo de la API HTTP de un NVR
//! Shinobi centralizado. No depende de ninguna sesión SSH: el NVR es
//! alcanzable directamente desde el cliente.
//!
//! La API key de Shinobi nunca se expone al frontend como valor propio:
//! el backend arma la URL de stream ya lista (la key queda embebida en la
//! URL, como exige el propio esquema de Shinobi) y el frontend solo recibe
//! esa URL final para pasarla a hls.js.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::cmd::nvr::ssh_tunnel::{self, SshTunnelConfig};
use crate::cmd::protocol::CommandError;

// ─── Config: cargada desde .env (mismo patrón que cmd::integration::moodle) ───

struct ShinobiConfig {
    api_key: String,
    tunnel: SshTunnelConfig,
}

fn clean_env_value(value: &str) -> String {
    value
        .trim()
        .trim_matches('\u{feff}')
        .trim_matches('"')
        .trim_matches('\'')
        .trim()
        .to_string()
}

fn env_var(name: &str) -> Option<String> {
    std::env::var(name).ok().map(|v| clean_env_value(&v)).filter(|v| !v.is_empty())
}

fn require_env(name: &str) -> Result<String, CommandError> {
    env_var(name).ok_or_else(|| CommandError::permanent("VALIDATION_FAILED", format!("{name} no configurado en .env")))
}

/// Carga la config de Shinobi. El NVR no es alcanzable por red pública en el
/// piloto (el router no reenvía su puerto) — se llega vía un túnel SSH
/// dedicado (ver `ssh_tunnel.rs`), no por una URL directa.
fn load_shinobi_config() -> Result<ShinobiConfig, CommandError> {
    let _ = dotenvy::dotenv();

    let api_key = require_env("SHINOBI_API_KEY")?;
    let ssh_host = require_env("SHINOBI_SSH_HOST")?;
    let ssh_user = require_env("SHINOBI_SSH_USER")?;
    let ssh_key_path = require_env("SHINOBI_SSH_KEY_PATH")?;
    let ssh_port: u16 = env_var("SHINOBI_SSH_PORT")
        .and_then(|v| v.parse().ok())
        .unwrap_or(22);
    let remote_port: u16 = env_var("SHINOBI_REMOTE_PORT")
        .and_then(|v| v.parse().ok())
        .unwrap_or(8082);

    Ok(ShinobiConfig {
        api_key,
        tunnel: SshTunnelConfig {
            host: ssh_host,
            port: ssh_port,
            user: ssh_user,
            key_path: ssh_key_path,
            remote_port,
        },
    })
}

// ─── Tipos ───

/// Cámara del NVR, ya lista para consumir desde el frontend.
/// `stream_url` es la URL HLS completa (api key incluida por Shinobi) —
/// el frontend la pasa directo a `HlsPlayer`, igual que antes con `CameraInfo`.
#[derive(Serialize, Deserialize, Clone, TS)]
#[ts(export)]
pub struct NvrCamera {
    pub id: String,
    pub name: String,
    pub status: String, // "active" | "connecting" | "offline"
    pub stream_url: String,
}

// Forma cruda de la respuesta de Shinobi: GET /{apiKey}/monitor/{groupKey}
#[derive(Deserialize)]
struct ShinobiMonitorRaw {
    mid: String,
    name: String,
    mode: String,
    status: Option<String>,
    streams: Vec<String>,
}

fn map_status(mode: &str, status: Option<&str>) -> String {
    if mode == "stop" || mode == "disabled" {
        return "offline".to_string();
    }
    match status {
        Some(s) if s.eq_ignore_ascii_case("watching") || s.eq_ignore_ascii_case("recording") => "active".to_string(),
        Some(s) if s.is_empty() => "connecting".to_string(),
        None => "connecting".to_string(),
        _ => "connecting".to_string(),
    }
}

// ─── Comandos Tauri ───

/// Lista las cámaras (monitors) de un Group de Shinobi, con la URL de
/// stream HLS ya resuelta. `group_key` identifica el dispositivo de
/// práctica (1 dispositivo = 1 Group, ver docs/plan-shinobi-nvr.md).
#[tauri::command]
pub async fn nvr_list_cameras(group_key: String) -> Result<Vec<NvrCamera>, CommandError> {
    let config = load_shinobi_config()?;
    let local_port = ssh_tunnel::ensure_tunnel(&config.tunnel).await?;
    let base_url = format!("http://127.0.0.1:{local_port}");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| CommandError::internal("HTTP_CLIENT_ERROR", e.to_string()))?;

    let url = format!("{}/{}/monitor/{}", base_url, config.api_key, group_key);

    let response = client.get(&url).send().await.map_err(|e| {
        let err = if e.is_timeout() {
            CommandError::transient("OPERATION_TIMEOUT", format!("Timeout consultando NVR: {e}")).with_retry_after(2000)
        } else {
            CommandError::transient("COMMUNICATION_ERROR", format!("Error consultando NVR: {e}")).with_retry_after(2000)
        };
        err.with_context("nvr_list_cameras", &group_key)
    })?;

    let status = response.status();
    let text = response.text().await.map_err(|e| {
        CommandError::transient("COMMUNICATION_ERROR", format!("Error leyendo respuesta del NVR: {e}"))
            .with_context("nvr_list_cameras", &group_key)
    })?;

    if !status.is_success() {
        let err = if status.as_u16() == 401 || status.as_u16() == 403 {
            CommandError::permanent("AUTH_FAILED", format!("NVR respondió {status}: credenciales inválidas"))
        } else if status.is_server_error() {
            CommandError::transient("COMMUNICATION_ERROR", format!("NVR respondió con error de servidor {status}"))
                .with_retry_after(3000)
        } else {
            CommandError::permanent("VALIDATION_FAILED", format!("NVR respondió {status}: {text}"))
        };
        return Err(err.with_context("nvr_list_cameras", &group_key));
    }

    // Shinobi devuelve `{"ok":false,"msg":"..."}` (no un array) cuando el
    // group_key no existe o la key no tiene permiso — hay que distinguirlo
    // del caso normal (array de monitors) antes de intentar parsear como tal.
    if let Ok(err_body) = serde_json::from_str::<serde_json::Value>(&text) {
        if err_body.get("ok").and_then(|v| v.as_bool()) == Some(false) {
            let msg = err_body.get("msg").and_then(|v| v.as_str()).unwrap_or("Not Authorized");
            return Err(CommandError::permanent("AUTH_FAILED", format!("NVR rechazó la solicitud: {msg}"))
                .with_context("nvr_list_cameras", &group_key));
        }
    }

    let monitors: Vec<ShinobiMonitorRaw> = serde_json::from_str(&text).map_err(|e| {
        CommandError::permanent("INVALID_DATA", format!("JSON inválido del NVR: {e}"))
            .with_context("nvr_list_cameras", &group_key)
    })?;

    Ok(monitors
        .into_iter()
        .map(|m| {
            let stream_path = m.streams.first().cloned().unwrap_or_default();
            NvrCamera {
                status: map_status(&m.mode, m.status.as_deref()),
                stream_url: format!("{}{}", base_url, stream_path),
                id: m.mid,
                name: m.name,
            }
        })
        .collect())
}

/// Cierra el túnel SSH hacia el NVR (equivalente a `stream_stop` del módulo legacy).
#[tauri::command]
pub async fn nvr_disconnect() {
    ssh_tunnel::disconnect().await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn map_status_stop_is_offline() {
        assert_eq!(map_status("stop", Some("Watching")), "offline");
    }

    #[test]
    fn map_status_watching_is_active() {
        assert_eq!(map_status("start", Some("Watching")), "active");
    }

    #[test]
    fn map_status_missing_is_connecting() {
        assert_eq!(map_status("start", None), "connecting");
    }

    /// Smoke test end-to-end contra el NVR piloto real (túnel SSH + Shinobi).
    /// Requiere SHINOBI_* en backend/.env. No corre en CI normal:
    /// `cargo test -- --ignored nvr_e2e_smoke_test_against_pilot`
    #[tokio::test]
    #[ignore]
    async fn nvr_e2e_smoke_test_against_pilot() {
        let cameras = nvr_list_cameras("pilabpiloto".to_string())
            .await
            .expect("nvr_list_cameras contra el piloto debería responder");
        assert!(!cameras.is_empty(), "se esperaba al menos Camara1");
        let cam = &cameras[0];
        assert!(cam.stream_url.starts_with("http://127.0.0.1:"));
        assert!(cam.stream_url.contains("/hls/pilabpiloto/"));
        println!("OK: {} → {}", cam.id, cam.stream_url);
    }
}
