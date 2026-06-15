use axum::{Json, extract::Path};
use serde::{Deserialize, Serialize};
use crate::storage;
use crate::api::error::ApiError;

#[derive(Serialize)]
pub struct HostEntry {
    pub id: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub name: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateHostRequest {
    pub id: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub name: Option<String>,
}

fn strip_password(entry: &serde_json::Value) -> HostEntry {
    let file = entry.get("file").and_then(|v| v.as_str()).unwrap_or("");
    let payload = entry.get("payload");
    let host = payload.and_then(|p| p.get("host")).and_then(|v| v.as_str()).unwrap_or("");
    let port = payload.and_then(|p| p.get("port")).and_then(|v| v.as_u64()).unwrap_or(22) as u16;
    let user = payload.and_then(|p| p.get("user")).and_then(|v| v.as_str()).unwrap_or("");
    let name = payload.and_then(|p| p.get("name")).and_then(|v| v.as_str()).map(|s| s.to_string());
    HostEntry {
        id: file.to_string(),
        host: host.to_string(),
        port,
        user: user.to_string(),
        name,
    }
}

pub async fn list_hosts() -> Result<Json<Vec<HostEntry>>, ApiError> {
    let entries = storage::list_hosts_entries().map_err(|e| ApiError::internal(e.to_string()))?;
    let cleaned: Vec<HostEntry> = entries.iter().map(|e| strip_password(e)).collect();
    Ok(Json(cleaned))
}

pub async fn get_host(Path(id): Path<String>) -> Result<Json<HostEntry>, ApiError> {
    let json_str = if id.ends_with(".json.enc") {
        storage::load_host_from_file(&id).map_err(|_| ApiError::not_found("Host no encontrado"))?
    } else {
        storage::load_host_with_master(&id).map_err(|_| ApiError::not_found("Host no encontrado"))?
    };
    let v: serde_json::Value = serde_json::from_str(&json_str).map_err(|_| ApiError::internal("Error al decodificar"))?;
    let entry = HostEntry {
        id: id.clone(),
        host: v.get("host").and_then(|s| s.as_str()).unwrap_or("").to_string(),
        port: v.get("port").and_then(|p| p.as_u64()).unwrap_or(22) as u16,
        user: v.get("user").and_then(|s| s.as_str()).unwrap_or("").to_string(),
        name: v.get("name").and_then(|s| s.as_str()).map(|s| s.to_string()),
    };
    Ok(Json(entry))
}

pub async fn create_host(Json(payload): Json<CreateHostRequest>) -> Result<Json<serde_json::Value>, ApiError> {
    let json_payload = serde_json::to_string(&serde_json::json!({
        "host": payload.host,
        "port": payload.port,
        "user": payload.user,
        "password": payload.password,
        "name": payload.name,
    })).map_err(|e| ApiError::internal(e.to_string()))?;
    storage::save_host_with_master(&payload.id, &json_payload)
        .map_err(|e| ApiError::internal(e.to_string()))?;
    Ok(Json(serde_json::json!({ "status": "created", "id": payload.id })))
}

pub async fn delete_host(Path(id): Path<String>) -> Result<Json<serde_json::Value>, ApiError> {
    storage::delete_host(&id).map_err(|_| ApiError::not_found("Host no encontrado"))?;
    Ok(Json(serde_json::json!({ "status": "deleted", "id": id })))
}
