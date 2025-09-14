use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};

use crate::error::AppError;
use crate::ssh::client::{Session, ChanCmd};
use crate::storage;

use super::state::{SESSIONS, SessionExt};
use crate::state::AppState;

#[tauri::command]
pub async fn ssh_connect(
  app: AppHandle,
  state: tauri::State<'_, AppState>,
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
    map.insert(id.clone(), SessionExt {
      term: session,
      host: host.clone(),
      port,
      user: user.clone(),
      password: password.clone(),
      sftp_cached: None,
      out_buffer: Arc::new(Mutex::new(Some(String::new()))),
      ui_ready: Arc::new(AtomicBool::new(false)),
    });
  }

  // Limpiar memoria de la sesión (por si se reutiliza el mismo id en algún flujo)
  state.clear(&id);

  // Encolar mensaje inicial en buffer si la UI aún no está lista; emitir directo si ya lo está
  {
    let (out_buf, ready) = {
      let map = SESSIONS.lock().unwrap();
      let sess = map.get(&id).unwrap();
      (sess.out_buffer.clone(), sess.ui_ready.clone())
    };
    let msg = format!("Conectado a {user}@{host}:{port}\r\n");
    if ready.load(Ordering::SeqCst) {
      let _ = app.emit(&format!("ssh_out_{}", id), Some(msg));
    } else if let Ok(mut opt) = out_buf.lock() { opt.get_or_insert_with(String::new).push_str(&msg); }
  }

  let app2 = app.clone();
  let id_spawn = id.clone();
  let buffer_ref = {
    let map = SESSIONS.lock().unwrap();
    map.get(&id_spawn).map(|s| (s.out_buffer.clone(), s.ui_ready.clone()))
  };
  tokio::spawn(async move {
    while let Some(buf) = rx_out.recv().await {
      let s = String::from_utf8_lossy(&buf).into_owned();
      if let Some((out_buf, ready)) = &buffer_ref {
        if ready.load(Ordering::SeqCst) {
          let _ = app2.emit(&format!("ssh_out_{}", id_spawn), Some(s));
        } else {
          if let Ok(mut opt) = out_buf.lock() {
            let bufref = opt.get_or_insert_with(String::new);
            bufref.push_str(&s);
          }
        }
      } else {
        let _ = app2.emit(&format!("ssh_out_{}", id_spawn), Some(s));
      }
    }
  });

  Ok(id)
}

#[tauri::command]
pub async fn ssh_ui_ready(app: AppHandle, id: String) -> Result<(), String> {
  let (out_buffer, ui_ready) = {
    let map = SESSIONS.lock().unwrap();
    let Some(sess) = map.get(&id) else { return Err(AppError::NotFound.to_string()); };
    (sess.out_buffer.clone(), sess.ui_ready.clone())
  };

  // Marcar UI como lista y volcar el buffer
  ui_ready.store(true, Ordering::SeqCst);
  if let Ok(mut opt) = out_buffer.lock() {
    if let Some(pending) = opt.take() {
      if !pending.is_empty() { let _ = app.emit(&format!("ssh_out_{}", id), Some(pending)); }
    }
  }
  Ok(())
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
pub async fn ssh_disconnect(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
  let tx = {
    let mut map = SESSIONS.lock().unwrap();
    let Some(session) = map.remove(&id) else { return Err(AppError::NotFound.to_string()); };
    session.term.tx.clone()
  };
  let _ = tx.send(ChanCmd::Close);
  // Limpiar memoria de la sesión al desconectar
  state.clear(&id);
  Ok(())
}

#[tauri::command]
pub async fn ssh_connect_stored(
  app: AppHandle,
  state: tauri::State<'_, AppState>,
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
    map.insert(id.clone(), SessionExt {
      term: session,
      host: host.clone(),
      port,
      user: user.clone(),
      password: password.clone(),
      sftp_cached: None,
      out_buffer: Arc::new(Mutex::new(Some(String::new()))),
      ui_ready: Arc::new(AtomicBool::new(false)),
    });
  }

  // Limpiar memoria al iniciar una nueva sesión
  state.clear(&id);

  // Encolar mensaje inicial en buffer si la UI aún no está lista; emitir directo si ya lo está
  {
    let (out_buf, ready) = {
      let map = SESSIONS.lock().unwrap();
      let sess = map.get(&id).unwrap();
      (sess.out_buffer.clone(), sess.ui_ready.clone())
    };
    let msg = format!("Conectado a {user}@{host}:{port}\r\n");
    if ready.load(Ordering::SeqCst) {
      let _ = app.emit(&format!("ssh_out_{}", id), Some(msg));
    } else if let Ok(mut opt) = out_buf.lock() { opt.get_or_insert_with(String::new).push_str(&msg); }
  }

  let app2 = app.clone();
  let id_spawn = id.clone();
  let buffer_ref = {
    let map = SESSIONS.lock().unwrap();
    map.get(&id_spawn).map(|s| (s.out_buffer.clone(), s.ui_ready.clone()))
  };
  tokio::spawn(async move {
    while let Some(buf) = rx_out.recv().await {
      let s = String::from_utf8_lossy(&buf).into_owned();
      if let Some((out_buf, ready)) = &buffer_ref {
        if ready.load(Ordering::SeqCst) {
          let _ = app2.emit(&format!("ssh_out_{}", id_spawn), Some(s));
        } else {
          if let Ok(mut opt) = out_buf.lock() {
            let bufref = opt.get_or_insert_with(String::new);
            bufref.push_str(&s);
          }
        }
      } else {
        let _ = app2.emit(&format!("ssh_out_{}", id_spawn), Some(s));
      }
    }
  });

  Ok(id)
}
