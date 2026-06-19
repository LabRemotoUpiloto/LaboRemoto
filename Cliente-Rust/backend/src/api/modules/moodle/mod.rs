use axum::Json;
use serde::Deserialize;

use crate::api::error::ApiError;
use crate::cmd::integration::moodle;

#[derive(Deserialize)]
pub struct SyncAssignmentRequest {
    pub assignment_id: u32,
    pub username: String,
}

#[derive(Deserialize)]
pub struct PrepareGradeRequest {
    pub assignment_id: u32,
    pub username: String,
    pub grade: f32,
    pub comment: String,
}

#[derive(Deserialize)]
pub struct SubmitGradeRequest {
    pub assignment_id: u32,
    pub user_id: u32,
    pub username: Option<String>,
    pub grade: f32,
    pub comment: String,
}

pub async fn sync_assignment(Json(req): Json<SyncAssignmentRequest>) -> Result<Json<serde_json::Value>, ApiError> {
    let result = moodle::moodle_sync_assignment(req.assignment_id, req.username)
        .await
        .map_err(|e| ApiError::bad_request(e))?;
    Ok(Json(result))
}

pub async fn prepare_grade(Json(req): Json<PrepareGradeRequest>) -> Result<Json<serde_json::Value>, ApiError> {
    let result = moodle::moodle_prepare_grade(req.assignment_id, req.username, req.grade, req.comment)
        .await
        .map_err(|e| ApiError::bad_request(e))?;
    Ok(Json(result))
}

pub async fn submit_grade(Json(req): Json<SubmitGradeRequest>) -> Result<Json<serde_json::Value>, ApiError> {
    moodle::moodle_submit_grade_direct(req.assignment_id, req.user_id, req.username, req.grade, req.comment)
        .await
        .map_err(|e| ApiError::bad_request(e))?;
    Ok(Json(serde_json::json!({ "status": "submitted" })))
}
