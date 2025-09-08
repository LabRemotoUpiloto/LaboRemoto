use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use crate::error::AppError;
use crate::ssh::client::{Session, ChanCmd};
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;
use crate::storage;

static SESSIONS: Lazy<Mutex<HashMap<String, Session>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[tauri::command]
pub async fn ssh_connect(
  app: AppHandle,
  host: String,
  port: u16,
  user: String,
  password: String,
  cols: u32,
  rows: u32,
) -> Result<String, String> {
  let (session, mut rx_out) =
    Session::connect_password(&host, port, &user, &password, cols, rows)
      .await
      .map_err(|e| e.to_string())?;

  let id = Uuid::new_v4().to_string();
  {
    let mut map = SESSIONS.lock().unwrap();
    map.insert(id.clone(), session);
  }

  // Mensaje inicial
  let _ = app.emit(&format!("ssh_out_{}", id), Some(format!("Conectado a {user}@{host}:{port}\r\n")));

  // Reenviar salida a la UI como evento Tauri
  let app2 = app.clone();
  let id_spawn = id.clone();
  tokio::spawn(async move {
    while let Some(buf) = rx_out.recv().await {
      let s = String::from_utf8_lossy(&buf).into_owned();
      let _ = app2.emit(&format!("ssh_out_{}", id_spawn), Some(s));
    }
  });

  Ok(id)
}

#[tauri::command]
pub async fn ssh_stdin(id: String, data: String, encoding: Option<String>) -> Result<(), String> {
  let tx = {
    let map = SESSIONS.lock().unwrap();
    map.get(&id).ok_or_else(|| AppError::NotFound.to_string())?.tx.clone()
  };
  let bytes = if let Some(enc) = encoding {
    if enc == "base64" {
      match STANDARD.decode(&data) {
        Ok(b) => b,
        Err(_) => return Err("base64 decode error".to_string()),
      }
    } else {
      data.into_bytes()
    }
  } else {
    data.into_bytes()
  };
  tx.send(ChanCmd::Send(bytes))
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ssh_resize(id: String, cols: u32, rows: u32) -> Result<(), String> {
  let tx = {
    let map = SESSIONS.lock().unwrap();
    map.get(&id).ok_or_else(|| AppError::NotFound.to_string())?.tx.clone()
  };
  tx.send(ChanCmd::Resize { cols, rows })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ssh_disconnect(id: String) -> Result<(), String> {
  let tx = {
    let mut map = SESSIONS.lock().unwrap();
    let Some(session) = map.remove(&id) else {
      return Err(AppError::NotFound.to_string());
    };
    session.tx.clone()
  };
  let _ = tx.send(ChanCmd::Close);
  Ok(())
}

// --- storage commands (per-host encrypted JSON) ---

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
pub async fn ssh_connect_stored(
  app: AppHandle,
  id: String,
  cols: u32,
  rows: u32,
) -> Result<String, String> {
  // Load host payload from storage (master-key)
  // If id looks like a filename returned by list_hosts_entries, load by file name, otherwise treat as id
  let payload_json = if id.ends_with(".json.enc") {
    storage::load_host_from_file(&id).map_err(|e| e.to_string())?
  } else {
    storage::load_host_with_master(&id).map_err(|e| e.to_string())?
  };
  let v: serde_json::Value = serde_json::from_str(&payload_json).map_err(|e| e.to_string())?;
  let host = v.get("host").and_then(|s| s.as_str()).ok_or_else(|| "missing host".to_string())?.to_string();
  let port = v.get("port").and_then(|p| p.as_u64()).ok_or_else(|| "missing port".to_string())? as u16;
  let user = v.get("user").and_then(|s| s.as_str()).ok_or_else(|| "missing user".to_string())?.to_string();
  let password = v.get("password").and_then(|s| s.as_str()).ok_or_else(|| "missing password".to_string())?.to_string();

  // Establish session using the same code as ssh_connect
  let (session, mut rx_out) =
    Session::connect_password(&host, port, &user, &password, cols, rows)
      .await
      .map_err(|e| e.to_string())?;

  let id = Uuid::new_v4().to_string();
  {
    let mut map = SESSIONS.lock().unwrap();
    map.insert(id.clone(), session);
  }

  let _ = app.emit(&format!("ssh_out_{}", id), Some(format!("Conectado a {user}@{host}:{port}\r\n")));

  let app2 = app.clone();
  let id_spawn = id.clone();
  tokio::spawn(async move {
    while let Some(buf) = rx_out.recv().await {
      let s = String::from_utf8_lossy(&buf).into_owned();
      let _ = app2.emit(&format!("ssh_out_{}", id_spawn), Some(s));
    }
  });

  Ok(id)
}

#[tauri::command]
pub async fn delete_host_file(id: String) -> Result<(), String> {
  storage::delete_host(&id).map_err(|e| e.to_string())
}