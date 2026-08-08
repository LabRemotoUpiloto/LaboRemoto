use crate::storage;

/// Error de unión de una tarea `spawn_blocking` (panic dentro de la tarea).
fn task_join_error(e: tokio::task::JoinError) -> String {
  format!("Error interno: {e}")
}

#[tauri::command]
pub async fn save_host_encrypted(passphrase: String, id: String, json_payload: String) -> Result<(), String> {
  // Perf: Argon2id es CPU-intensivo por diseño (resistencia a fuerza
  // bruta); correrlo inline en el runtime async bloquearía ese worker
  // thread durante el hash.
  tokio::task::spawn_blocking(move || {
    storage::save_host_with_pass(&passphrase, &id, &json_payload).map_err(|e| e.to_string())
  }).await.map_err(task_join_error)?
}

#[tauri::command]
pub async fn load_host_encrypted(passphrase: String, id: String) -> Result<String, String> {
  tokio::task::spawn_blocking(move || {
    storage::load_host_with_pass(&passphrase, &id).map_err(|e| e.to_string())
  }).await.map_err(task_join_error)?
}

#[tauri::command]
pub async fn save_host_master(id: String, json_payload: String) -> Result<(), String> {
  tokio::task::spawn_blocking(move || {
    storage::save_host_with_master(&id, &json_payload).map_err(|e| e.to_string())
  }).await.map_err(task_join_error)?
}

#[tauri::command]
pub async fn load_host_master(id: String) -> Result<String, String> {
  tokio::task::spawn_blocking(move || {
    storage::load_host_with_master(&id).map_err(|e| e.to_string())
  }).await.map_err(task_join_error)?
}

#[tauri::command]
pub async fn list_hosts_files() -> Result<Vec<String>, String> {
  tokio::task::spawn_blocking(|| storage::list_hosts().map_err(|e| e.to_string()))
    .await.map_err(task_join_error)?
}

#[tauri::command]
pub async fn list_hosts_entries() -> Result<Vec<serde_json::Value>, String> {
  tokio::task::spawn_blocking(|| storage::list_hosts_entries().map_err(|e| e.to_string()))
    .await.map_err(task_join_error)?
}

#[tauri::command]
pub async fn delete_host_file(id: String) -> Result<(), String> {
  tokio::task::spawn_blocking(move || storage::delete_host(&id).map_err(|e| e.to_string()))
    .await.map_err(task_join_error)?
}
