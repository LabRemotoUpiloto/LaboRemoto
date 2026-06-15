use axum::Json;
use serde::Serialize;

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub app: String,
    pub version: String,
    pub api: String,
}

pub async fn health_handler() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".into(),
        app: "Cliente SSH Unipiloto".into(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        api: "enabled".into(),
    })
}
