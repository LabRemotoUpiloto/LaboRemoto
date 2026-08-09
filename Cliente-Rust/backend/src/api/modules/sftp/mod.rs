use axum::{Json, extract::{Path, Query}};
use serde::{Deserialize, Serialize};

use crate::api::error::ApiError;
use crate::cmd::sftp::get_or_connect_cached;
use crate::cmd::state::SESSIONS;

#[derive(Deserialize)]
pub struct ListQuery {
    pub path: Option<String>,
}

#[derive(Serialize)]
pub struct SftpEntryResponse {
    pub name: String,
    pub path: String,
    pub kind: String,
    pub size: Option<u64>,
    pub perms: Option<String>,
    pub mtime: Option<u64>,
}

pub async fn list(Path(session_id): Path<String>, Query(q): Query<ListQuery>) -> Result<Json<Vec<SftpEntryResponse>>, ApiError> {
    let base_path = q.path.unwrap_or_else(|| ".".to_string());
    {
        let map = SESSIONS.lock().map_err(|_| ApiError::internal("Error de bloqueo"))?;
        if !map.contains_key(&session_id) { return Err(ApiError::not_found("Sesión no encontrada")); }
    }

    // Perf: reutiliza la conexión SSH/SFTP cacheada de la sesión (la misma
    // que usa el panel SFTP del escritorio) en vez de reconectar desde cero
    // en cada request HTTP.
    let entries = tokio::task::spawn_blocking(move || {
        let cached = {
            let mut map = SESSIONS.lock().map_err(|_| "Error de bloqueo".to_string())?;
            get_or_connect_cached(&mut map, &session_id)?
        };
        let mut guard = cached.lock().map_err(|_| "ssh2 lock poisoned".to_string())?;
        let sftp = guard.get_or_open_sftp().map_err(|e| e.to_string())?;
        crate::ssh_core::ssh2_sftp::list_dir(sftp, &base_path)
            .map_err(|e| e.to_string())
    }).await.map_err(|e| ApiError::internal(e.to_string()))?
    .map_err(|e| ApiError::bad_request(e))?;

    let result: Vec<SftpEntryResponse> = entries.into_iter().map(|e| SftpEntryResponse {
        name: e.name,
        path: e.path,
        kind: e.kind,
        size: e.size,
        perms: e.perms,
        mtime: e.mtime,
    }).collect();

    Ok(Json(result))
}

pub async fn home(Path(session_id): Path<String>) -> Result<Json<serde_json::Value>, ApiError> {
    let user = {
        let map = SESSIONS.lock().map_err(|_| ApiError::internal("Error de bloqueo"))?;
        let s = map.get(&session_id).ok_or_else(|| ApiError::not_found("Sesión no encontrada"))?;
        s.user.clone()
    };

    // Perf: reutiliza la conexión SSH/SFTP cacheada en vez de reconectar.
    let home = tokio::task::spawn_blocking(move || {
        let cached = {
            let mut map = SESSIONS.lock().map_err(|_| "Error de bloqueo".to_string())?;
            get_or_connect_cached(&mut map, &session_id)?
        };
        let mut guard = cached.lock().map_err(|_| "ssh2 lock poisoned".to_string())?;
        let sftp = guard.get_or_open_sftp().map_err(|e| e.to_string())?;
        use std::path::Path;
        if let Ok(p) = sftp.realpath(Path::new(".")) {
            if let Some(s) = p.to_str() { if !s.is_empty() { return Ok(s.to_string()); } }
        }
        if let Ok(p) = sftp.realpath(Path::new("~")) {
            if let Some(s) = p.to_str() { if s.starts_with('/') { return Ok(s.to_string()); } }
        }
        let user_sanit = user.split(|c| c=='\\' || c=='/').last().unwrap_or(&user);
        let guess = if user_sanit == "root" { "/root".to_string() } else { format!("/home/{}", user_sanit) };
        Ok::<String, String>(guess)
    }).await.map_err(|e| ApiError::internal(e.to_string()))?
    .map_err(|e| ApiError::bad_request(e))?;

    Ok(Json(serde_json::json!({ "path": home })))
}
