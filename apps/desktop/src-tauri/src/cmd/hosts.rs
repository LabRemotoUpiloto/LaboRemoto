use crate::storage;

#[tauri::command]
pub async fn save_host_encrypted(passphrase: String, id: String, json_payload: String) -> Result<(), String> {
  storage::save_host_with_pass(&passphrase, &id, &json_payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_host_encrypted(passphrase: String, id: String) -> Result<String, String> {
  storage::load_host_with_pass(&passphrase, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_host_master(id: String, json_payload: String) -> Result<(), String> {
  storage::save_host_with_master(&id, &json_payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_host_master(id: String) -> Result<String, String> {
  storage::load_host_with_master(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_hosts_files() -> Result<Vec<String>, String> {
  storage::list_hosts().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_hosts_entries() -> Result<Vec<serde_json::Value>, String> {
  storage::list_hosts_entries().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_host_file(id: String) -> Result<(), String> {
  storage::delete_host(&id).map_err(|e| e.to_string())
}
