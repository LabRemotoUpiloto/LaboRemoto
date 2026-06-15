use axum::{Json, extract::Path};
use serde::{Deserialize, Serialize};

use crate::api::error::ApiError;
use crate::cmd::ssh::gpio;
use crate::cmd::hardware::arduino;

#[derive(Deserialize)]
pub struct ModeRequest {
    pub mode: String,
}

#[derive(Deserialize)]
pub struct PullRequest {
    pub pull: String,
}

#[derive(Deserialize)]
pub struct WriteRequest {
    pub level: u8,
}

#[derive(Serialize)]
pub struct PinStatusResponse {
    pub gpio: u32,
    pub level: Option<u8>,
    pub func: String,
    pub pull: Option<String>,
}

pub async fn gpio_pins(Path(session_id): Path<String>) -> Result<Json<Vec<PinStatusResponse>>, ApiError> {
    let pins = gpio::rpi_pins_status(session_id).await.map_err(|e| ApiError::bad_request(e))?;
    let result: Vec<PinStatusResponse> = pins.into_iter().map(|p| PinStatusResponse {
        gpio: p.gpio,
        level: p.level,
        func: p.func,
        pull: p.pull,
    }).collect();
    Ok(Json(result))
}

pub async fn gpio_set_mode(
    Path((session_id, pin)): Path<(String, u32)>,
    Json(req): Json<ModeRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    gpio::rpi_pin_set_mode(session_id, pin, req.mode).await
        .map_err(|e| ApiError::bad_request(e))?;
    Ok(Json(serde_json::json!({ "status": "ok" })))
}

pub async fn gpio_set_pull(
    Path((session_id, pin)): Path<(String, u32)>,
    Json(req): Json<PullRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    gpio::rpi_pin_set_pull(session_id, pin, req.pull).await
        .map_err(|e| ApiError::bad_request(e))?;
    Ok(Json(serde_json::json!({ "status": "ok" })))
}

pub async fn gpio_write(
    Path((session_id, pin)): Path<(String, u32)>,
    Json(req): Json<WriteRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    gpio::rpi_pin_write_level(session_id, pin, req.level).await
        .map_err(|e| ApiError::bad_request(e))?;
    Ok(Json(serde_json::json!({ "status": "ok" })))
}

pub async fn gpio_read(
    Path((session_id, pin)): Path<(String, u32)>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let value = gpio::rpi_pin_read(session_id, pin).await
        .map_err(|e| ApiError::bad_request(e))?;
    Ok(Json(serde_json::json!({ "gpio": pin, "level": value.level })))
}

// ── Arduino ───────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ArduinoCmdRequest {
    pub command: String,
}

pub async fn arduino_status(Path(session_id): Path<String>) -> Result<Json<serde_json::Value>, ApiError> {
    let status = arduino::arduino_bridge_status(session_id).await
        .map_err(|e| ApiError::bad_request(e))?;
    Ok(Json(serde_json::to_value(status).map_err(|e| ApiError::internal(e.to_string()))?))
}

pub async fn arduino_send(Path(session_id): Path<String>, Json(req): Json<ArduinoCmdRequest>) -> Result<Json<serde_json::Value>, ApiError> {
    let result = arduino::arduino_send_cmd(session_id, req.command).await
        .map_err(|e| ApiError::bad_request(e))?;
    Ok(Json(serde_json::to_value(result).map_err(|e| ApiError::internal(e.to_string()))?))
}

pub async fn arduino_buffer(Path(session_id): Path<String>) -> Result<Json<serde_json::Value>, ApiError> {
    let data = arduino::arduino_read_buffer(session_id).await
        .map_err(|e| ApiError::bad_request(e))?;
    Ok(Json(serde_json::json!({ "data": data })))
}
