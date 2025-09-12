use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::error::AppError;
use crate::ssh::client::{Session, ChanCmd};
use crate::storage;

use super::state::{SESSIONS, SessionExt};

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
    map.insert(id.clone(), SessionExt { term: session, host: host.clone(), port, user: user.clone(), password: password.clone() });
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
pub async fn ssh_stdin(id: String, data: String, encoding: Option<String>) -> Result<(), String> {
  let tx = {
    let map = SESSIONS.lock().unwrap();
    map.get(&id).ok_or_else(|| AppError::NotFound.to_string())?.term.tx.clone()
  };
  let bytes = if let Some(enc) = encoding {
    if enc == "base64" {
      match STANDARD.decode(&data) { Ok(b) => b, Err(_) => return Err("base64 decode error".to_string()), }
    } else { data.into_bytes() }
  } else { data.into_bytes() };
  tx.send(ChanCmd::Send(bytes)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ssh_resize(id: String, cols: u32, rows: u32) -> Result<(), String> {
  let tx = {
    let map = SESSIONS.lock().unwrap();
    map.get(&id).ok_or_else(|| AppError::NotFound.to_string())?.term.tx.clone()
  };
  tx.send(ChanCmd::Resize { cols, rows }).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ssh_disconnect(id: String) -> Result<(), String> {
  let tx = {
    let mut map = SESSIONS.lock().unwrap();
    let Some(session) = map.remove(&id) else { return Err(AppError::NotFound.to_string()); };
    session.term.tx.clone()
  };
  let _ = tx.send(ChanCmd::Close);
  Ok(())
}

#[tauri::command]
pub async fn ssh_connect_stored(
  app: AppHandle,
  id: String,
  cols: u32,
  rows: u32,
) -> Result<String, String> {
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

  let (session, mut rx_out) =
    Session::connect_password(&host, port, &user, &password, cols, rows)
      .await
      .map_err(|e| e.to_string())?;

  let id = Uuid::new_v4().to_string();
  {
    let mut map = SESSIONS.lock().unwrap();
    map.insert(id.clone(), SessionExt { term: session, host: host.clone(), port, user: user.clone(), password: password.clone() });
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
