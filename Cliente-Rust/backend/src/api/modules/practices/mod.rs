use axum::{Json, extract::Query};
use serde::{Serialize, Deserialize};
use crate::api::error::ApiError;
use crate::cmd::practices::practicas;

#[derive(Deserialize)]
pub struct ConfigQuery {
    pub practice_id: Option<String>,
}

#[derive(Serialize)]
pub struct PracticeCategoryResponse {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub color: String,
    pub practices: Vec<PracticeSummary>,
}

#[derive(Serialize)]
pub struct PracticeSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub difficulty: String,
    pub moodle_assignment_id: Option<u32>,
}

pub async fn list_categories() -> Result<Json<Vec<PracticeCategoryResponse>>, ApiError> {
    let cats = practicas::practicas_list_categories().map_err(|e| ApiError::internal(e.message))?;
    let result: Vec<PracticeCategoryResponse> = cats.into_iter().map(|c| PracticeCategoryResponse {
        id: c.id,
        name: c.name,
        description: c.description,
        icon: c.icon,
        color: c.color,
        practices: c.practices.into_iter().map(|p| PracticeSummary {
            id: p.id,
            name: p.name,
            description: p.description,
            difficulty: p.difficulty,
            moodle_assignment_id: p.moodle_assignment_id,
        }).collect(),
    }).collect();
    Ok(Json(result))
}

pub async fn get_config(Query(q): Query<ConfigQuery>) -> Result<Json<serde_json::Value>, ApiError> {
    let id = q.practice_id.ok_or_else(|| ApiError::bad_request("practice_id es requerido"))?;
    let cfg = practicas::practicas_get_config(id).map_err(|e| ApiError::not_found(e.message))?;
    Ok(Json(serde_json::to_value(cfg).map_err(|e| ApiError::internal(e.to_string()))?))
}
