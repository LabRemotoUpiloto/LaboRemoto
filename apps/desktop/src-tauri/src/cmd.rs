use crate::error::AppError;
use crate::ssh::client::{Session, ChanCmd};
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

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
pub async fn ssh_stdin(id: String, data: String) -> Result<(), String> {
  let tx = {
    let map = SESSIONS.lock().unwrap();
    map.get(&id).ok_or_else(|| AppError::NotFound.to_string())?.tx.clone()
  };
  tx.send(ChanCmd::Send(data.into_bytes()))
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
