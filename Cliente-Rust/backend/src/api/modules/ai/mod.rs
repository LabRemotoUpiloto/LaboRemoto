use axum::Json;
use serde::Serialize;

use crate::api::error::ApiError;
use crate::cmd::ai::ai_utils;

#[derive(Serialize)]
pub struct AiStatusResponse {
    pub has_openai_key: bool,
    pub has_claude_key: bool,
    pub has_openrouter_key: bool,
    pub model: Option<String>,
}

#[derive(Serialize)]
pub struct AiTestResponse {
    pub ok: bool,
    pub http_status: u16,
    pub auth_error: bool,
    pub rate_limited: bool,
    pub body_snippet: Option<String>,
    pub model_used: String,
    pub message: Option<String>,
}

pub async fn status() -> Result<Json<AiStatusResponse>, ApiError> {
    let s = ai_utils::ai_env_status().map_err(|e| ApiError::internal(e))?;
    Ok(Json(AiStatusResponse {
        has_openai_key: s.has_openai_key,
        has_claude_key: s.has_claude_key,
        has_openrouter_key: s.has_openrouter_key,
        model: s.model,
    }))
}

pub async fn test_key() -> Result<Json<AiTestResponse>, ApiError> {
    let r = ai_utils::ai_test_key().await.map_err(|e| ApiError::bad_request(e))?;
    Ok(Json(AiTestResponse {
        ok: r.ok,
        http_status: r.http_status,
        auth_error: r.auth_error,
        rate_limited: r.rate_limited,
        body_snippet: r.body_snippet,
        model_used: r.model_used,
        message: r.message,
    }))
}
