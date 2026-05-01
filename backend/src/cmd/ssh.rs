use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};

use std::collections::VecDeque;
use crate::error::AppError;
use crate::ssh::client::{Session, ChanCmd};
use crate::storage;

use super::state::{SESSIONS, SessionExt};
use crate::state::AppState;
use regex::Regex;

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
  // Generar ID inmediatamente
  let id = Uuid::new_v4().to_string();
  
  // Limpiar memoria de la sesión (por si se reutiliza el mismo id en algún flujo)
  state.clear(&id);
  
  // Clonar variables para mover al task
  let id_clone = id.clone();
  let app_clone = app.clone();
  let host_clone = host.clone();
  let user_clone = user.clone();
  let password_clone = password.clone();
  
  // Emitir evento de inicio de conexión
  let _ = app.emit("ssh_connecting", serde_json::json!({
    "id": id,
    "host": host,
    "port": port,
    "user": user
  }));
  
  // Conectar en background (NO bloqueante)
  tokio::spawn(async move {
    // Intentar conectar
    let result = Session::connect_password(&host_clone, port, &user_clone, &password_clone, cols, rows).await;
    
    match result {
      Ok((session, mut rx_out)) => {
        // Guardar sesión
        {
          match SESSIONS.lock() {
            Ok(mut map) => {
              map.insert(id_clone.clone(), SessionExt {
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
                "error": format!("Session lock error: {}", e)
              }));
              return;
            }
          }
        }
        
        // Emitir evento de éxito
        let _ = app_clone.emit("ssh_connected", serde_json::json!({
          "id": id_clone,
          "success": true
        }));
        
        // Leer output en otro task
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
              // Siempre capturar en el buffer de contexto AI (máx 300 chunks)
              if let Ok(mut q) = term_buf.lock() {
                if q.len() >= 300 { q.pop_front(); }
                q.push_back(s.clone());
              }
              // Notificar al frontend que hay nuevo output disponible para análisis
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
        // Emitir evento de error
        let _ = app_clone.emit("ssh_connect_error", serde_json::json!({
          "id": id_clone,
          "error": e.to_string()
        }));
      }
    }
  });
  
  // Devolver ID inmediatamente (NO esperar a que conecte)
  Ok(id)
}

#[tauri::command]
pub async fn ssh_ui_ready(app: AppHandle, id: String) -> Result<(), String> {
  let (out_buffer, ui_ready) = {
    let map = SESSIONS.lock().map_err(|e| e.to_string())?;
    let Some(sess) = map.get(&id) else { return Err(AppError::NotFoundSession.to_string()); };
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
  // Preparar tx y también referencia para posible actualización de cwd
  let tx = {
    let map = SESSIONS.lock().map_err(|e| e.to_string())?;
    map.get(&id).ok_or_else(|| AppError::NotFoundSession.to_string())?.term.tx.clone()
  };
  let bytes = if let Some(enc) = encoding {
    if enc == "base64" {
      match STANDARD.decode(&data) { Ok(b) => b, Err(_) => return Err("base64 decode error".to_string()), }
    } else { data.into_bytes() }
  } else { data.into_bytes() };

  // Detectar comando cd en primera línea (heurística simple)
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
    // Actualizar current_dir en background usando ssh2 (sin bloquear el loop async principal)
    tokio::task::spawn_blocking(move || {
      use std::path::PathBuf;
      let mut map = match SESSIONS.lock() {
          Ok(m) => m,
          Err(_) => return, // Si falla el lock, simplemente no actualizamos cwd
      };
      if let Some(s) = map.get_mut(&id) {
        // Obtener/conectar sesión ssh2
        let arc = if let Some(existing) = s.sftp_cached.clone() { existing } else {
          if let Ok((tcp, sess2)) = crate::ssh::ssh2_sftp::connect_password(&s.host, s.port, &s.user, &s.password) {
            let arc = std::sync::Arc::new(std::sync::Mutex::new(crate::cmd::state::CachedSsh2 { tcp, sess: sess2 }));
            s.sftp_cached = Some(arc.clone());
            arc
          } else { return; }
        };
        if let Ok(guard) = arc.lock() {
          let raw = target.trim();
          let expanded = if raw.starts_with('~') {
            if let Ok(mut ch) = guard.sess.channel_session() {
              let _ = ch.exec("echo $HOME");
              use std::io::Read; let mut buf = String::new(); let _ = ch.read_to_string(&mut buf); let _ = ch.wait_close();
              let home = buf.lines().next().unwrap_or("").trim();
              if !home.is_empty() { format!("{}{}", home, &raw[1..]) } else { raw.to_string() }
            } else { raw.to_string() }
          } else { raw.to_string() };
          let base = s.current_dir.clone();
          let candidate = if PathBuf::from(&expanded).is_absolute() {
            PathBuf::from(&expanded)
          } else if let Some(b) = base { PathBuf::from(b).join(expanded) } else { PathBuf::from(expanded) };
          // Abrimos un canal en un bloque separado para soltar guard antes de que map se desbloquee
          let new_dir = {
            if let Ok(mut ch2) = guard.sess.channel_session() {
              let cmd = format!("test -d '{}' && cd '{}' && pwd", candidate.display(), candidate.display());
              if ch2.exec(&cmd).is_ok() {
                use std::io::Read; let mut buf = String::new(); let _ = ch2.read_to_string(&mut buf); let _ = ch2.wait_close();
                let out = buf.lines().next().unwrap_or("").trim().to_string();
                if !out.is_empty() { Some(out) } else { None }
              } else { None }
            } else { None }
          };
          if let Some(dir) = new_dir { s.current_dir = Some(dir); }
        };
      }
    });
  }

  Ok(())
}

#[tauri::command]
pub async fn ssh_resize(id: String, cols: u32, rows: u32) -> Result<(), String> {
  let tx = {
    let map = SESSIONS.lock().map_err(|e| e.to_string())?;
    map.get(&id).ok_or_else(|| AppError::NotFoundSession.to_string())?.term.tx.clone()
  };
  tx.send(ChanCmd::Resize { cols, rows }).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ssh_disconnect(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
  let mut session = {
    let mut map = SESSIONS.lock().map_err(|e| e.to_string())?;
    map.remove(&id).ok_or_else(|| AppError::NotFoundSession.to_string())?
  };

  if let Some(mut vnc) = session.vnc_session.take() {
      vnc.stop_flag.store(true, Ordering::Relaxed);
      if let Some(mut child) = vnc.ssh_fwd_child.take() { let _ = child.kill(); }
      let display  = vnc.display_num;
      let vnc_port = vnc.vnc_port_remote;
      vnc.host = "".to_string(); // Evita reconexión inútil en Drop
      // Matar procesos remotos vía el canal russh ya conectado
      let kill_cmd = format!(
          "pkill -9 -f 'Xvfb :{display} ' 2>/dev/null; \
           pkill -9 -f 'x11vnc.*rfbport {vnc_port}' 2>/dev/null; \
           rm -f /tmp/.X{display}-lock /tmp/.X11-unix/X{display} 2>/dev/null; true\n"
      );
      let _ = session.term.tx.send(ChanCmd::Send(kill_cmd.into_bytes()));
      tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
  }

  let _ = session.term.tx.send(ChanCmd::Close);
  // Limpiar memoria de la sesión al desconectar
  state.clear(&id);
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

#[derive(serde::Serialize, Debug, Clone)]
pub struct RpiGpioLine {
  pub gpio: u32,           // BCM number
  pub level: Option<u8>,   // 0/1 if reported
  pub func: String,        // INPUT/OUTPUT/ALT{n}
  pub pull: Option<String> // UP/DOWN/NONE
}

#[tauri::command]
pub async fn rpi_pins_status(id: String) -> Result<Vec<RpiGpioLine>, String> {
  // Acquire ssh2 session (reuse cached or connect fresh like in cd handling)
  let arc_cached = {
    let mut map = SESSIONS.lock().map_err(|e| e.to_string())?;
    let s = map.get_mut(&id).ok_or_else(|| AppError::NotFoundSession.to_string())?;
    if let Some(existing) = s.sftp_cached.clone() {
      existing
    } else {
      let (tcp, sess2) = crate::ssh::ssh2_sftp::connect_password(&s.host, s.port, &s.user, &s.password)
        .map_err(|e| e.to_string())?;
      let arc = std::sync::Arc::new(std::sync::Mutex::new(crate::cmd::state::CachedSsh2 { tcp, sess: sess2 }));
      s.sftp_cached = Some(arc.clone());
      arc
    }
  };

  // Run 'raspi-gpio get' and capture output
  let out = {
    let guard = arc_cached.lock().map_err(|_| "ssh2 lock poisoned")?;
    let mut ch = guard.sess.channel_session().map_err(|e| e.to_string())?;
    ch.exec("raspi-gpio get").map_err(|e| e.to_string())?;
    use std::io::Read;
    let mut buf = String::new();
    let _ = ch.read_to_string(&mut buf);
    let _ = ch.wait_close();
    buf
  };

  // Parse lines like: "GPIO 17: level=1 fsel=1 func=OUTPUT pull=UP"
  let mut res: Vec<RpiGpioLine> = Vec::new();
  let re = Regex::new(r"(?i)^GPIO\s+(\d+)\s*:\s*(?:level=(\d))?.*?func=([A-Z0-9]+)(?:.*?pull=([A-Z]+))?").map_err(|e| e.to_string())?;
  for line in out.lines() {
    if let Some(c) = re.captures(line) {
      let gpio: u32 = c.get(1).and_then(|m| m.as_str().parse().ok()).unwrap_or(0);
      let level: Option<u8> = c.get(2).and_then(|m| m.as_str().parse().ok());
      let func = c.get(3).map(|m| m.as_str().to_string()).unwrap_or_else(|| "".into());
      let pull = c.get(4).map(|m| m.as_str().to_string());
      res.push(RpiGpioLine { gpio, level, func, pull });
    }
  }
  Ok(res)
}

#[tauri::command]
pub async fn rpi_pin_set_mode(id: String, gpio: u32, mode: String) -> Result<(), String> {
  let normalized = match mode.to_lowercase().as_str() {
    "input" | "ip" => "ip",
    "output" | "op" => "op",
    other => return Err(format!("Modo no soportado: {} (usa 'input' o 'output')", other)),
  };

  let arc_cached = {
    let mut map = SESSIONS.lock().map_err(|e| e.to_string())?;
    let s = map.get_mut(&id).ok_or_else(|| AppError::NotFoundSession.to_string())?;
    if let Some(existing) = s.sftp_cached.clone() {
      existing
    } else {
      let (tcp, sess2) = crate::ssh::ssh2_sftp::connect_password(&s.host, s.port, &s.user, &s.password)
        .map_err(|e| e.to_string())?;
      let arc = std::sync::Arc::new(std::sync::Mutex::new(crate::cmd::state::CachedSsh2 { tcp, sess: sess2 }));
      s.sftp_cached = Some(arc.clone());
      arc
    }
  };

  let (status, output) = {
    let guard = arc_cached.lock().map_err(|_| "ssh2 lock poisoned")?;
    let mut ch = guard.sess.channel_session().map_err(|e| e.to_string())?;
    let command = format!("raspi-gpio set {} {}", gpio, normalized);
    ch.exec(&command).map_err(|e| e.to_string())?;
    use std::io::Read;
    let mut buf = String::new();
    let _ = ch.read_to_string(&mut buf);
    let _ = ch.wait_close();
    let status = ch.exit_status().unwrap_or(0);
    (status, buf)
  };

  if status != 0 {
    return Err(format!(
      "raspi-gpio set devolvió código {}: {}",
      status,
      output.trim()
    ));
  }

  Ok(())
}

#[tauri::command]
pub async fn rpi_pin_set_pull(id: String, gpio: u32, pull: String) -> Result<(), String> {
  let normalized = match pull.to_lowercase().as_str() {
    "up" | "pu" => "pu",
    "down" | "pd" => "pd",
    "none" | "off" | "pn" => "pn",
    other => return Err(format!("Pull no soportado: {} (usa 'up', 'down' o 'none')", other)),
  };

  let arc_cached = {
    let mut map = SESSIONS.lock().map_err(|e| e.to_string())?;
    let s = map.get_mut(&id).ok_or_else(|| AppError::NotFoundSession.to_string())?;
    if let Some(existing) = s.sftp_cached.clone() {
      existing
    } else {
      let (tcp, sess2) = crate::ssh::ssh2_sftp::connect_password(&s.host, s.port, &s.user, &s.password)
        .map_err(|e| e.to_string())?;
      let arc = std::sync::Arc::new(std::sync::Mutex::new(crate::cmd::state::CachedSsh2 { tcp, sess: sess2 }));
      s.sftp_cached = Some(arc.clone());
      arc
    }
  };

  let (status, output) = {
    let guard = arc_cached.lock().map_err(|_| "ssh2 lock poisoned")?;
    let mut ch = guard.sess.channel_session().map_err(|e| e.to_string())?;
    let command = format!("raspi-gpio set {} {}", gpio, normalized);
    ch.exec(&command).map_err(|e| e.to_string())?;
    use std::io::Read;
    let mut buf = String::new();
    let _ = ch.read_to_string(&mut buf);
    let _ = ch.wait_close();
    let status = ch.exit_status().unwrap_or(0);
    (status, buf)
  };

  if status != 0 {
    return Err(format!(
      "raspi-gpio set devolvió código {}: {}",
      status,
      output.trim()
    ));
  }

  Ok(())
}

#[tauri::command]
pub async fn rpi_pin_write_level(id: String, gpio: u32, level: u8) -> Result<(), String> {
  let normalized = match level {
    1 => "dh",
    0 => "dl",
    other => return Err(format!("Nivel no soportado: {} (usa 0 o 1)", other)),
  };

  let arc_cached = {
    let mut map = SESSIONS.lock().map_err(|e| e.to_string())?;
    let s = map.get_mut(&id).ok_or_else(|| AppError::NotFoundSession.to_string())?;
    if let Some(existing) = s.sftp_cached.clone() {
      existing
    } else {
      let (tcp, sess2) = crate::ssh::ssh2_sftp::connect_password(&s.host, s.port, &s.user, &s.password)
        .map_err(|e| e.to_string())?;
      let arc = std::sync::Arc::new(std::sync::Mutex::new(crate::cmd::state::CachedSsh2 { tcp, sess: sess2 }));
      s.sftp_cached = Some(arc.clone());
      arc
    }
  };

  let (status, output) = {
    let guard = arc_cached.lock().map_err(|_| "ssh2 lock poisoned")?;
    let mut ch = guard.sess.channel_session().map_err(|e| e.to_string())?;
    let command = format!("raspi-gpio set {} {}", gpio, normalized);
    ch.exec(&command).map_err(|e| e.to_string())?;
    use std::io::Read;
    let mut buf = String::new();
    let _ = ch.read_to_string(&mut buf);
    let _ = ch.wait_close();
    let status = ch.exit_status().unwrap_or(0);
    (status, buf)
  };

  if status != 0 {
    return Err(format!(
      "raspi-gpio set devolvió código {}: {}",
      status,
      output.trim()
    ));
  }

  Ok(())
}

#[tauri::command]
pub async fn rpi_pin_read(id: String, gpio: u32) -> Result<RpiGpioLine, String> {
  let arc_cached = {
    let mut map = SESSIONS.lock().map_err(|e| e.to_string())?;
    let s = map.get_mut(&id).ok_or_else(|| AppError::NotFoundSession.to_string())?;
    if let Some(existing) = s.sftp_cached.clone() {
      existing
    } else {
      let (tcp, sess2) = crate::ssh::ssh2_sftp::connect_password(&s.host, s.port, &s.user, &s.password)
        .map_err(|e| e.to_string())?;
      let arc = std::sync::Arc::new(std::sync::Mutex::new(crate::cmd::state::CachedSsh2 { tcp, sess: sess2 }));
      s.sftp_cached = Some(arc.clone());
      arc
    }
  };

  let out = {
    let guard = arc_cached.lock().map_err(|_| "ssh2 lock poisoned")?;
    let mut ch = guard.sess.channel_session().map_err(|e| e.to_string())?;
    let command = format!("raspi-gpio get {}", gpio);
    ch.exec(&command).map_err(|e| e.to_string())?;
    use std::io::Read;
    let mut buf = String::new();
    let _ = ch.read_to_string(&mut buf);
    let _ = ch.wait_close();
    buf
  };

  let re = Regex::new(r"(?i)^GPIO\s+(\d+)\s*:\s*(?:level=(\d))?.*?func=([A-Z0-9]+)(?:.*?pull=([A-Z]+))?")
    .map_err(|e| e.to_string())?;
  for line in out.lines() {
    if let Some(c) = re.captures(line) {
      let gpio: u32 = c.get(1).and_then(|m| m.as_str().parse().ok()).unwrap_or(0);
      let level: Option<u8> = c.get(2).and_then(|m| m.as_str().parse().ok());
      let func = c.get(3).map(|m| m.as_str().to_string()).unwrap_or_else(|| "".into());
      let pull = c.get(4).map(|m| m.as_str().to_string());
      return Ok(RpiGpioLine { gpio, level, func, pull });
    }
  }

  Err("No se pudo parsear la salida de raspi-gpio".into())
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
    let mut map = SESSIONS.lock().map_err(|e| e.to_string())?;
    map.insert(id.clone(), SessionExt {
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

  // Limpiar memoria al iniciar una nueva sesión
  state.clear(&id);

  // No emitimos mensaje de "Conectado a ..." para mantener la terminal limpia.

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
