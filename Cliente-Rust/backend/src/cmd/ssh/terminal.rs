use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use std::collections::VecDeque;
use crate::error::AppError;
use crate::ssh_core::client::{Session, ChanCmd};
use crate::storage;
use crate::cmd::state::SESSIONS;
use crate::cmd::protocol::{wrap_result, CommandError, CommandRequest, CommandResponse};
use crate::session_manager::SessionManager;

// ── Fase B: envelope versionado (CommandRequest/CommandResponse) ────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshConnectPayload {
  pub host: String,
  pub port: u16,
  pub user: String,
  pub password: String,
  pub cols: u32,
  pub rows: u32,
  pub embedded_in_chat: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshConnectResponse {
  pub session_id: String,
  pub host: String,
  pub port: u16,
  pub user: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshStdinPayload {
  pub id: String,
  pub data: String,
  pub encoding: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SshStdinResponse {
  pub ok: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshResizePayload {
  pub id: String,
  pub cols: u32,
  pub rows: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SshResizeResponse {
  pub ok: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshDisconnectPayload {
  pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SshDisconnectResponse {
  pub ok: bool,
}

/// Comando Tauri versionado: conecta una sesión SSH interactiva.
/// La lógica de negocio vive en `ssh_connect_impl` para reutilizarse desde
/// `pi4_ssh_connect` sin pasar por el envelope.
#[tauri::command]
pub async fn ssh_connect(
  app: AppHandle,
  state: tauri::State<'_, std::sync::Arc<dyn SessionManager>>,
  req: CommandRequest<SshConnectPayload>,
) -> Result<CommandResponse<SshConnectResponse>, CommandError> {
  let started = std::time::Instant::now();
  let SshConnectPayload { host, port, user, password, cols, rows, embedded_in_chat } = req.payload;
  let host_echo = host.clone();
  let user_echo = user.clone();

  let result = ssh_connect_impl(app, state, host, port, user, password, cols, rows, embedded_in_chat)
    .await
    .map(|session_id| SshConnectResponse { session_id, host: host_echo, port, user: user_echo });

  let elapsed_ms = started.elapsed().as_millis() as i64;
  Ok(wrap_result(req.id, req.version, result, elapsed_ms))
}

async fn ssh_connect_impl(
  app: AppHandle,
  state: tauri::State<'_, std::sync::Arc<dyn SessionManager>>,
  host: String,
  port: u16,
  user: String,
  password: String,
  cols: u32,
  rows: u32,
  embedded_in_chat: Option<bool>,
) -> Result<String, String> {
  let embedded_in_chat = embedded_in_chat.unwrap_or(false);
  let id = Uuid::new_v4().to_string();
  // Extraer el Arc antes de cualquier await (el guard de `State` no se retiene).
  let manager = state.inner().clone();
  let _ = manager.delete_session(&id).await;

  let id_clone = id.clone();
  let app_clone = app.clone();
  let host_clone = host.clone();
  let user_clone = user.clone();
  let password_clone = password.clone();
  let embedded_flag = embedded_in_chat;
  
  let _ = app.emit("ssh_connecting", serde_json::json!({
    "id": id,
    "host": host,
    "port": port,
    "user": user
  }));
  
  tokio::spawn(async move {
    let result = Session::connect_password(&host_clone, port, &user_clone, &password_clone, cols, rows).await;
    
    match result {
      Ok((session, mut rx_out)) => {
        {
          match SESSIONS.lock() {
            Ok(mut map) => {
              map.insert(id_clone.clone(), crate::cmd::state::SessionExt {
                term: session,
                host: host_clone.clone(),
                port,
                user: user_clone.clone(),
                password: password_clone.clone(),
                sftp_cached: None,
                out_buffer: Arc::new(Mutex::new(Some(String::new()))),
                ui_ready: Arc::new(AtomicBool::new(false)),
                current_dir: None,
                vnc_session: None,
                stream_stop_flag: None,
                stream_local_port: None,
                terminal_buf: Arc::new(Mutex::new(VecDeque::with_capacity(300))),
              });
            }
            Err(e) => {
              let _ = app_clone.emit("ssh_connect_error", serde_json::json!({
                "id": id_clone,
                "error": format!("Session lock error: {}", e),
                "embedded_in_chat": embedded_flag
              }));
              return;
            }
          }
        }
        
        let ssh_command = format!(
          "ssh {}@{} -p {}",
          user_clone, host_clone, port
        );
        let _ = app_clone.emit("ssh_connected", serde_json::json!({
          "id": id_clone,
          "success": true,
          "embedded_in_chat": embedded_flag,
          "ssh_command": ssh_command
        }));
        
        let app2 = app_clone.clone();
        let id_spawn = id_clone.clone();
        let buffer_ref = {
          match SESSIONS.lock() {
            Ok(map) => map.get(&id_spawn).map(|s| (s.out_buffer.clone(), s.ui_ready.clone(), s.terminal_buf.clone())),
            Err(_) => None,
          }
        };
        
        tokio::spawn(async move {
          while let Some(buf) = rx_out.recv().await {
            let s = String::from_utf8_lossy(&buf).into_owned();
            if let Some((out_buf, ready, term_buf)) = &buffer_ref {
              if let Ok(mut q) = term_buf.lock() {
                if q.len() >= 300 { q.pop_front(); }
                q.push_back(s.clone());
              }
              let _ = app2.emit("terminal:activity", serde_json::json!({ "session_id": id_spawn }));
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
      }
      Err(e) => {
        let _ = app_clone.emit("ssh_connect_error", serde_json::json!({
          "id": id_clone,
          "error": e.to_string(),
          "embedded_in_chat": embedded_flag
        }));
      }
    }
  });
  
  Ok(id)
}

/// Abre una sesión SSH interactiva (PTY) a la Raspberry Pi usando PI4_* del .env.
#[tauri::command]
pub async fn pi4_ssh_connect(
  app: AppHandle,
  state: tauri::State<'_, std::sync::Arc<dyn SessionManager>>,
  cols: u32,
  rows: u32,
) -> Result<String, String> {
  let creds = crate::cmd::tools::pi4_config::load_pi4_creds().ok_or_else(|| {
    "Configura PI4_USER y PI4_PASSWORD en Cliente-Rust/.env para abrir la terminal.".to_string()
  })?;
  ssh_connect_impl(
    app,
    state,
    creds.host,
    creds.port,
    creds.user,
    creds.password,
    cols,
    rows,
    Some(true),
  )
  .await
}

#[tauri::command]
pub async fn ssh_ui_ready(app: AppHandle, id: String) -> Result<(), String> {
  let (out_buffer, ui_ready) = {
    let map = SESSIONS.lock().map_err(|e| e.to_string())?;
    let Some(sess) = map.get(&id) else { return Err(AppError::NotFoundSession.to_string()); };
    (sess.out_buffer.clone(), sess.ui_ready.clone())
  };

  ui_ready.store(true, Ordering::SeqCst);
  if let Ok(mut opt) = out_buffer.lock() {
    if let Some(pending) = opt.take() {
      if !pending.is_empty() { let _ = app.emit(&format!("ssh_out_{}", id), Some(pending)); }
    }
  }
  Ok(())
}

#[tauri::command]
pub async fn ssh_stdin(
  req: CommandRequest<SshStdinPayload>,
) -> Result<CommandResponse<SshStdinResponse>, CommandError> {
  let started = std::time::Instant::now();
  let SshStdinPayload { id, data, encoding } = req.payload;
  let result = ssh_stdin_impl(id, data, encoding)
    .await
    .map(|_| SshStdinResponse { ok: true });
  let elapsed_ms = started.elapsed().as_millis() as i64;
  Ok(wrap_result(req.id, req.version, result, elapsed_ms))
}

async fn ssh_stdin_impl(id: String, data: String, encoding: Option<String>) -> Result<(), String> {
  let tx = {
    let map = SESSIONS.lock().map_err(|e| e.to_string())?;
    map.get(&id).ok_or_else(|| AppError::NotFoundSession.to_string())?.term.tx.clone()
  };
  let bytes = if let Some(enc) = encoding {
    if enc == "base64" {
      match STANDARD.decode(&data) { Ok(b) => b, Err(_) => return Err("base64 decode error".to_string()), }
    } else { data.into_bytes() }
  } else { data.into_bytes() };

  let mut cd_target: Option<String> = None;
  if let Ok(txt) = std::str::from_utf8(&bytes) {
    if let Some(first_line) = txt.lines().next() {
      let l = first_line.trim();
      if l == "cd" || l.starts_with("cd ") {
        let rest = l.strip_prefix("cd").unwrap().trim();
        let target = if rest.is_empty() { "~" } else { rest };
        if !target.contains(';') && !target.contains('|') && !target.contains('&') && !target.contains('>') {
          cd_target = Some(target.to_string());
        }
      }
    }
  }

  tx.send(ChanCmd::Send(bytes)).map_err(|e| e.to_string())?;

  if let Some(target) = cd_target {
    tokio::task::spawn_blocking(move || {
      use std::path::PathBuf;

      // Perf: el lock global de `SESSIONS` (compartido por todas las
      // sesiones activas) solo se toma para leer/guardar estado en
      // memoria — nunca mientras se hace el connect_password de fallback
      // ni los 2 round trips SSH de este `cd` (antes quedaba retenido
      // durante todo eso, bloqueando terminal/SFTP/GPIO de cualquier otra
      // sesión mientras tanto).
      let (host, port, user, password, existing, base) = {
        let map = match SESSIONS.lock() { Ok(m) => m, Err(_) => return };
        let s = match map.get(&id) { Some(s) => s, None => return };
        (s.host.clone(), s.port, s.user.clone(), s.password.clone(), s.sftp_cached.clone(), s.current_dir.clone())
      };

      let arc = if let Some(existing) = existing {
        existing
      } else {
        let (tcp, sess2) = match crate::ssh_core::ssh2_sftp::connect_password(&host, port, &user, &password) {
          Ok(v) => v,
          Err(_) => return,
        };
        let new_arc = std::sync::Arc::new(std::sync::Mutex::new(crate::cmd::state::CachedSsh2::new(tcp, sess2)));
        let mut map = match SESSIONS.lock() { Ok(m) => m, Err(_) => return };
        match map.get_mut(&id) {
          Some(s) => {
            // Otra tarea pudo haber conectado primero mientras se esperaba
            // la red: reusar esa conexión en vez de dejar dos abiertas.
            if let Some(existing2) = s.sftp_cached.clone() { existing2 } else {
              s.sftp_cached = Some(new_arc.clone());
              new_arc
            }
          }
          None => return,
        }
      };

      let new_dir = {
        let guard = match arc.lock() { Ok(g) => g, Err(_) => return };
        let raw = target.trim();
        let expanded = if raw.starts_with('~') {
          if let Ok(mut ch) = guard.sess.channel_session() {
            let _ = ch.exec("echo $HOME");
            use std::io::Read; let mut buf = String::new(); let _ = ch.read_to_string(&mut buf); let _ = ch.wait_close();
            let home = buf.lines().next().unwrap_or("").trim();
            if !home.is_empty() { format!("{}{}", home, &raw[1..]) } else { raw.to_string() }
          } else { raw.to_string() }
        } else { raw.to_string() };
        let candidate = if PathBuf::from(&expanded).is_absolute() {
          PathBuf::from(&expanded)
        } else if let Some(b) = base { PathBuf::from(b).join(expanded) } else { PathBuf::from(expanded) };
        if let Ok(mut ch2) = guard.sess.channel_session() {
          let cmd = format!("test -d '{}' && cd '{}' && pwd", candidate.display(), candidate.display());
          if ch2.exec(&cmd).is_ok() {
            use std::io::Read; let mut buf = String::new(); let _ = ch2.read_to_string(&mut buf); let _ = ch2.wait_close();
            let out = buf.lines().next().unwrap_or("").trim().to_string();
            if !out.is_empty() { Some(out) } else { None }
          } else { None }
        } else { None }
      };

      if let Some(dir) = new_dir {
        if let Ok(mut map) = SESSIONS.lock() {
          if let Some(s) = map.get_mut(&id) { s.current_dir = Some(dir); }
        }
      }
    });
  }

  Ok(())
}

#[tauri::command]
pub async fn ssh_resize(
  req: CommandRequest<SshResizePayload>,
) -> Result<CommandResponse<SshResizeResponse>, CommandError> {
  let started = std::time::Instant::now();
  let SshResizePayload { id, cols, rows } = req.payload;
  let result = ssh_resize_impl(id, cols, rows)
    .await
    .map(|_| SshResizeResponse { ok: true });
  let elapsed_ms = started.elapsed().as_millis() as i64;
  Ok(wrap_result(req.id, req.version, result, elapsed_ms))
}

async fn ssh_resize_impl(id: String, cols: u32, rows: u32) -> Result<(), String> {
  let tx = {
    let map = SESSIONS.lock().map_err(|e| e.to_string())?;
    map.get(&id).ok_or_else(|| AppError::NotFoundSession.to_string())?.term.tx.clone()
  };
  tx.send(ChanCmd::Resize { cols, rows }).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ssh_disconnect(
  state: tauri::State<'_, std::sync::Arc<dyn SessionManager>>,
  req: CommandRequest<SshDisconnectPayload>,
) -> Result<CommandResponse<SshDisconnectResponse>, CommandError> {
  let started = std::time::Instant::now();
  let SshDisconnectPayload { id } = req.payload;
  let result = ssh_disconnect_impl(state, id)
    .await
    .map(|_| SshDisconnectResponse { ok: true });
  let elapsed_ms = started.elapsed().as_millis() as i64;
  Ok(wrap_result(req.id, req.version, result, elapsed_ms))
}

async fn ssh_disconnect_impl(state: tauri::State<'_, std::sync::Arc<dyn SessionManager>>, id: String) -> Result<(), String> {
  let manager = state.inner().clone();
  let mut session = {
    let mut map = SESSIONS.lock().map_err(|e| e.to_string())?;
    map.remove(&id).ok_or_else(|| AppError::NotFoundSession.to_string())?
  };

  if let Some(mut vnc) = session.vnc_session.take() {
      vnc.stop_flag.store(true, Ordering::Relaxed);
      if let Some(mut child) = vnc.ssh_fwd_child.take() { let _ = child.kill(); }
      let display  = vnc.display_num;
      let vnc_port = vnc.vnc_port_remote;
      vnc.host = "".to_string();
      let kill_cmd = format!(
          "pkill -9 -f 'Xvfb :{display} ' 2>/dev/null; \
           pkill -9 -f 'x11vnc.*rfbport {vnc_port}' 2>/dev/null; \
           rm -f /tmp/.X{display}-lock /tmp/.X11-unix/X{display} 2>/dev/null; true\n"
      );
      let _ = session.term.tx.send(ChanCmd::Send(kill_cmd.into_bytes()));
      tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
  }

  let _ = session.term.tx.send(ChanCmd::Close);
  let _ = manager.delete_session(&id).await;
  Ok(())
}

#[derive(serde::Serialize)]
pub struct SessionInfo {
  pub host: String,
  pub port: u16,
  pub user: String,
  pub resolved_ip: String,
}

#[tauri::command]
pub async fn ssh_session_info(id: String) -> Result<SessionInfo, String> {
  let map = SESSIONS.lock().map_err(|e| e.to_string())?;
  let sess = map.get(&id).ok_or_else(|| AppError::NotFoundSession.to_string())?;
  let ip = sess.term.resolved_addr.ip().to_string();
  Ok(SessionInfo { host: sess.host.clone(), port: sess.port, user: sess.user.clone(), resolved_ip: ip })
}

#[tauri::command]
pub async fn ssh_connect_stored(
  app: AppHandle,
  state: tauri::State<'_, std::sync::Arc<dyn SessionManager>>,
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
    let mut map = SESSIONS.lock().map_err(|e| e.to_string())?;
    map.insert(id.clone(), crate::cmd::state::SessionExt {
      term: session,
      host: host.clone(),
      port,
      user: user.clone(),
      password: password.clone(),
      sftp_cached: None,
      out_buffer: Arc::new(Mutex::new(Some(String::new()))),
      ui_ready: Arc::new(AtomicBool::new(false)),
      current_dir: None,
      vnc_session: None,
      stream_stop_flag: None,
      stream_local_port: None,
      terminal_buf: Arc::new(Mutex::new(VecDeque::with_capacity(300))),
    });
  }

  let manager = state.inner().clone();
  let _ = manager.delete_session(&id).await;

  let app2 = app.clone();
  let id_spawn = id.clone();
  let buffer_ref = {
    match SESSIONS.lock() {
      Ok(map) => map.get(&id_spawn).map(|s| (s.out_buffer.clone(), s.ui_ready.clone())),
      Err(_) => None,
    }
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