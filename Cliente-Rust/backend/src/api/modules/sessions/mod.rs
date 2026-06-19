use axum::{Json, extract::Path};
use serde::Serialize;
use crate::api::error::ApiError;
use crate::cmd::logs::logs;

#[derive(Serialize)]
pub struct SessionLogSummary {
    pub session_id: String,
    pub user: String,
    pub host: String,
    pub port: u16,
    pub start_time: String,
    pub end_time: String,
    pub duration_seconds: i64,
    pub buffer_size_bytes: usize,
    pub command_count: Option<i32>,
}

pub async fn list_logs() -> Result<Json<Vec<SessionLogSummary>>, ApiError> {
    let entries = logs::list_session_logs().await.map_err(|e| ApiError::internal(e))?;
    let result: Vec<SessionLogSummary> = entries.into_iter().map(|m| SessionLogSummary {
        session_id: m.session_id,
        user: m.user,
        host: m.host,
        port: m.port,
        start_time: m.start_time.to_rfc3339(),
        end_time: m.end_time.to_rfc3339(),
        duration_seconds: m.duration_seconds,
        buffer_size_bytes: m.buffer_size_bytes,
        command_count: m.command_count,
    }).collect();
    Ok(Json(result))
}

pub async fn get_log_content(Path(session_id): Path<String>) -> Result<Json<serde_json::Value>, ApiError> {
    let content = logs::get_session_log_content(session_id.clone()).await
        .map_err(|_| ApiError::not_found("Log no encontrado"))?;
    Ok(Json(serde_json::json!({ "session_id": session_id, "html_content": content })))
}

pub async fn delete_log(Path(session_id): Path<String>) -> Result<Json<serde_json::Value>, ApiError> {
    logs::delete_session_log(session_id.clone()).await
        .map_err(|_| ApiError::not_found("Log no encontrado"))?;
    Ok(Json(serde_json::json!({ "status": "deleted", "session_id": session_id })))
}
