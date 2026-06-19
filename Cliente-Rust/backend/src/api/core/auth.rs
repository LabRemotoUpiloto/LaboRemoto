use axum::{
    extract::Request,
    http::StatusCode,
    middleware::Next,
    response::Response,
    Json,
};

use crate::api::config::ApiConfig;

pub async fn auth_middleware(req: Request, next: Next) -> Result<Response, (StatusCode, Json<serde_json::Value>)> {
    let config = req
        .extensions()
        .get::<ApiConfig>()
        .cloned()
        .unwrap_or_else(ApiConfig::from_env);

    if config.token.is_empty() {
        return Ok(next.run(req).await);
    }

    let header = req
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let expected = format!("Bearer {}", config.token);

    if header == expected {
        return Ok(next.run(req).await);
    }

    let body = serde_json::json!({
        "error": { "code": "UNAUTHORIZED", "message": "Token inválido o ausente" }
    });
    Err((StatusCode::UNAUTHORIZED, Json(body)))
}
