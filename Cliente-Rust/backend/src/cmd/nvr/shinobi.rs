//! cmd/nvr/shinobi — Cliente de API del NVR Shinobi (vía broker)
//!
//! Consume el catálogo de cámaras a través del broker desplegado en la Pi
//! (`infra/nvr-broker`, expuesto públicamente en `NVR_BROKER_HOST/nvr/...`
//! vía el mismo túnel SSH inverso + nginx que ya usa Keycloak). El cliente
//! nunca tiene la `SHINOBI_API_KEY` real ni una clave SSH hacia la Pi — solo
//! manda el access_token de Keycloak (el mismo que ya tiene por el login) y
//! el broker decide si autoriza, sin exponer ningún secreto al cliente.
//!
//! Reemplaza el diseño anterior (túnel SSH propio vía `ssh_tunnel.rs` +
//! `SHINOBI_SSH_KEY_PATH`), que dependía de una clave privada presente en el
//! disco de cada instalación — inviable para un build distribuido (ver
//! commit que retira `ssh_tunnel.rs`).

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use ts_rs::TS;

use crate::cmd::protocol::CommandError;
use crate::session_manager::SessionManager;

/// Host público del broker (Pi vía túnel inverso + nginx en AWS, mismo
/// mecanismo que expone Keycloak). No es un secreto — es una URL pública,
/// igual que `KEYCLOAK_BASE_URL`.
const NVR_BROKER_HOST: &str = "http://52.14.162.232";

// Perf: cliente HTTP compartido — `nvr_list_cameras` se sondea
// periódicamente desde el panel de cámaras; reconstruir el cliente (y su
// pool TCP/TLS) en cada poll era puro desperdicio.
static HTTP_CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .unwrap_or_default()
});

// ─── Tipos ───

/// Cámara del NVR, ya lista para consumir desde el frontend.
/// `stream_url` es la URL HLS completa contra el broker (nunca contra
/// Shinobi directo, nunca con la API key real embebida) — el frontend la
/// pasa directo a `HlsPlayer`, igual que antes con `CameraInfo`.
#[derive(Serialize, Deserialize, Clone, TS)]
#[ts(export)]
pub struct NvrCamera {
    pub id: String,
    pub name: String,
    pub status: String, // "active" | "connecting" | "offline"
    pub stream_url: String,
}

// Forma cruda de la respuesta del broker: GET /nvr/monitor/{groupKey}
// (el broker reenvía el shape de Shinobi tal cual, solo reescribe streams)
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
/// stream HLS ya resuelta contra el broker. `group_key` identifica el
/// dispositivo de práctica (1 dispositivo = 1 Group, ver
/// docs/plan-shinobi-nvr.md). Requiere sesión activa (access_token de
/// Keycloak) — el broker lo valida contra el JWKS institucional.
#[tauri::command]
pub async fn nvr_list_cameras(
    group_key: String,
    manager: tauri::State<'_, Arc<dyn SessionManager>>,
) -> Result<Vec<NvrCamera>, CommandError> {
    let access_token = manager
        .get_access_token()
        .await
        .map_err(|e| CommandError::internal("SESSION_ERROR", e.to_string()))?
        .ok_or_else(|| {
            CommandError::permanent("AUTH_REQUIRED", "Debes iniciar sesión para ver las cámaras")
        })?;

    let client = &*HTTP_CLIENT;

    let url = format!("{}/nvr/monitor/{}", NVR_BROKER_HOST, group_key);

    let response = client.get(&url).bearer_auth(&access_token).send().await.map_err(|e| {
        let err = if e.is_timeout() {
            CommandError::transient("OPERATION_TIMEOUT", format!("Timeout consultando el NVR: {e}")).with_retry_after(2000)
        } else {
            CommandError::transient("COMMUNICATION_ERROR", format!("Error consultando el NVR: {e}")).with_retry_after(2000)
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
            CommandError::permanent("AUTH_FAILED", format!("Broker NVR respondió {status}: sesión inválida o expirada"))
        } else if status.is_server_error() {
            CommandError::transient("COMMUNICATION_ERROR", format!("Broker NVR respondió con error de servidor {status}"))
                .with_retry_after(3000)
        } else {
            CommandError::permanent("VALIDATION_FAILED", format!("Broker NVR respondió {status}: {text}"))
        };
        return Err(err.with_context("nvr_list_cameras", &group_key));
    }

    // El broker puede devolver el error de Shinobi tal cual
    // (`{"ok":false,"msg":"..."}`) si el group_key no existe.
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
                stream_url: format!("{}{}", NVR_BROKER_HOST, stream_path),
                id: m.mid,
                name: m.name,
            }
        })
        .collect())
}

/// No-op: ya no hay túnel SSH propio que cerrar (el broker gestiona sus
/// sesiones internamente con TTL). Se mantiene el comando por compatibilidad
/// con el frontend (`useNvrCameras` lo llama al detener/desmontar).
#[tauri::command]
pub async fn nvr_disconnect() {}

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
}
