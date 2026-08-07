use crate::cmd::protocol::CommandError;
use crate::cmd::state::{SESSIONS, CachedSsh2};
use crate::error::AppError;
use regex::Regex;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

#[derive(serde::Serialize, Debug, Clone)]
pub struct RpiGpioLine {
  pub gpio: u32,           // BCM number
  pub level: Option<u8>,   // 0/1 if reported
  pub func: String,        // INPUT/OUTPUT/ALT{n}
  pub pull: Option<String> // UP/DOWN/NONE
}

fn get_or_connect_cached(id: &str) -> Result<Arc<Mutex<CachedSsh2>>, CommandError> {
  let mut map = SESSIONS.lock().map_err(|e| CommandError::internal("LOCK_POISONED", format!("SESSIONS lock poisoned: {}", e)))?;
  let s = map.get_mut(id).ok_or_else(|| CommandError::from(AppError::NotFoundSession))?;
  if let Some(existing) = s.sftp_cached.clone() {
    Ok(existing)
  } else {
    let (tcp, sess2) = crate::ssh_core::ssh2_sftp::connect_password(&s.host, s.port, &s.user, &s.password)
      .map_err(|e| CommandError::transient("SSH_ERROR", e.to_string()))?;
    let arc = Arc::new(Mutex::new(CachedSsh2::new(tcp, sess2)));
    s.sftp_cached = Some(arc.clone());
    Ok(arc)
  }
}

#[tauri::command]
pub async fn rpi_pins_status(id: String) -> Result<Vec<RpiGpioLine>, CommandError> {
  let arc_cached = get_or_connect_cached(&id)?;

  let out = {
    let guard = arc_cached.lock().map_err(|_| CommandError::internal("LOCK_POISONED", "ssh2 lock poisoned"))?;
    let mut ch = guard.sess.channel_session()
      .map_err(CommandError::from)
      .map_err(|e| e.with_context("gpio_pins_status", &id))?;
    ch.exec("raspi-gpio get")
      .map_err(CommandError::from)
      .map_err(|e| e.with_context("gpio_pins_status", &id))?;
    use std::io::Read;
    let mut buf = String::new();
    let _ = ch.read_to_string(&mut buf);
    let _ = ch.wait_close();
    buf
  };

  let mut res: Vec<RpiGpioLine> = Vec::new();
  let re = Regex::new(r"(?i)^GPIO\s+(\d+)\s*:\s*(?:level=(\d))?.*?func=([A-Z0-9]+)(?:.*?pull=([A-Z]+))?")
    .map_err(|e| CommandError::internal("REGEX_COMPILE_ERROR", e.to_string()))?;
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
pub async fn rpi_pin_set_mode(id: String, gpio: u32, mode: String) -> Result<(), CommandError> {
  let normalized = match mode.to_lowercase().as_str() {
    "input" | "ip" => "ip",
    "output" | "op" => "op",
    other => return Err(CommandError::permanent("INVALID_GPIO_MODE", format!("Modo no soportado: {} (usa 'input' o 'output')", other))),
  };

  let arc_cached = get_or_connect_cached(&id)?;

  let (status, output) = {
    let guard = arc_cached.lock().map_err(|_| CommandError::internal("LOCK_POISONED", "ssh2 lock poisoned"))?;
    let mut ch = guard.sess.channel_session()
      .map_err(CommandError::from)
      .map_err(|e| e.with_context("gpio_set_mode", &id))?;
    let command = format!("raspi-gpio set {} {}", gpio, normalized);
    ch.exec(&command)
      .map_err(CommandError::from)
      .map_err(|e| e.with_context("gpio_set_mode", &id))?;
    use std::io::Read;
    let mut buf = String::new();
    let _ = ch.read_to_string(&mut buf);
    let _ = ch.wait_close();
    let status = ch.exit_status().unwrap_or(0);
    (status, buf)
  };

  if status != 0 {
    return Err(CommandError::permanent(
      "GPIO_COMMAND_FAILED",
      format!("raspi-gpio set devolvió código {}: {}", status, output.trim()),
    ));
  }

  Ok(())
}

#[tauri::command]
pub async fn rpi_pin_set_pull(id: String, gpio: u32, pull: String) -> Result<(), CommandError> {
  let normalized = match pull.to_lowercase().as_str() {
    "up" | "pu" => "pu",
    "down" | "pd" => "pd",
    "none" | "off" | "pn" => "pn",
    other => return Err(CommandError::permanent("INVALID_GPIO_PULL", format!("Pull no soportado: {} (usa 'up', 'down' o 'none')", other))),
  };

  let arc_cached = get_or_connect_cached(&id)?;

  let (status, output) = {
    let guard = arc_cached.lock().map_err(|_| CommandError::internal("LOCK_POISONED", "ssh2 lock poisoned"))?;
    let mut ch = guard.sess.channel_session()
      .map_err(CommandError::from)
      .map_err(|e| e.with_context("gpio_set_pull", &id))?;
    let command = format!("raspi-gpio set {} {}", gpio, normalized);
    ch.exec(&command)
      .map_err(CommandError::from)
      .map_err(|e| e.with_context("gpio_set_pull", &id))?;
    use std::io::Read;
    let mut buf = String::new();
    let _ = ch.read_to_string(&mut buf);
    let _ = ch.wait_close();
    let status = ch.exit_status().unwrap_or(0);
    (status, buf)
  };

  if status != 0 {
    return Err(CommandError::permanent(
      "GPIO_COMMAND_FAILED",
      format!("raspi-gpio set devolvió código {}: {}", status, output.trim()),
    ));
  }

  Ok(())
}

#[tauri::command]
pub async fn rpi_pin_write_level(id: String, gpio: u32, level: u8) -> Result<(), CommandError> {
  let normalized = match level {
    1 => "dh",
    0 => "dl",
    other => return Err(CommandError::permanent("INVALID_GPIO_LEVEL", format!("Nivel no soportado: {} (usa 0 o 1)", other))),
  };

  let arc_cached = get_or_connect_cached(&id)?;

  let (status, output) = {
    let guard = arc_cached.lock().map_err(|_| CommandError::internal("LOCK_POISONED", "ssh2 lock poisoned"))?;
    let mut ch = guard.sess.channel_session()
      .map_err(CommandError::from)
      .map_err(|e| e.with_context("gpio_write_level", &id))?;
    let command = format!("raspi-gpio set {} {}", gpio, normalized);
    ch.exec(&command)
      .map_err(CommandError::from)
      .map_err(|e| e.with_context("gpio_write_level", &id))?;
    use std::io::Read;
    let mut buf = String::new();
    let _ = ch.read_to_string(&mut buf);
    let _ = ch.wait_close();
    let status = ch.exit_status().unwrap_or(0);
    (status, buf)
  };

  if status != 0 {
    return Err(CommandError::permanent(
      "GPIO_COMMAND_FAILED",
      format!("raspi-gpio set devolvió código {}: {}", status, output.trim()),
    ));
  }

  Ok(())
}

#[tauri::command]
pub async fn rpi_pin_read(id: String, gpio: u32) -> Result<RpiGpioLine, CommandError> {
  let arc_cached = get_or_connect_cached(&id)?;

  let out = {
    let guard = arc_cached.lock().map_err(|_| CommandError::internal("LOCK_POISONED", "ssh2 lock poisoned"))?;
    let mut ch = guard.sess.channel_session()
      .map_err(CommandError::from)
      .map_err(|e| e.with_context("gpio_read", &id))?;
    let command = format!("raspi-gpio get {}", gpio);
    ch.exec(&command)
      .map_err(CommandError::from)
      .map_err(|e| e.with_context("gpio_read", &id))?;
    use std::io::Read;
    let mut buf = String::new();
    let _ = ch.read_to_string(&mut buf);
    let _ = ch.wait_close();
    buf
  };

  let re = Regex::new(r"(?i)^GPIO\s+(\d+)\s*:\s*(?:level=(\d))?.*?func=([A-Z0-9]+)(?:.*?pull=([A-Z]+))?")
    .map_err(|e| CommandError::internal("REGEX_COMPILE_ERROR", e.to_string()))?;
  for line in out.lines() {
    if let Some(c) = re.captures(line) {
      let gpio: u32 = c.get(1).and_then(|m| m.as_str().parse().ok()).unwrap_or(0);
      let level: Option<u8> = c.get(2).and_then(|m| m.as_str().parse().ok());
      let func = c.get(3).map(|m| m.as_str().to_string()).unwrap_or_else(|| "".into());
      let pull = c.get(4).map(|m| m.as_str().to_string());
      return Ok(RpiGpioLine { gpio, level, func, pull });
    }
  }

  Err(CommandError::permanent("GPIO_PARSE_ERROR", "No se pudo parsear la salida de raspi-gpio"))
}

// ── Streaming / Monitoreo continuo en segundo plano (Rust Tokio Background Task) ──

static GPIO_MONITORS: Lazy<Mutex<HashMap<String, oneshot::Sender<()>>>> =
  Lazy::new(|| Mutex::new(HashMap::new()));

#[tauri::command]
pub async fn rpi_pins_monitor_start(
  app: AppHandle,
  id: String,
  interval_ms: Option<u64>,
) -> Result<(), CommandError> {
  let _ = rpi_pins_monitor_stop(id.clone()).await;

  let (tx, mut rx) = oneshot::channel::<()>();

  {
    let mut map = GPIO_MONITORS.lock().map_err(|e| CommandError::internal("LOCK_POISONED", e.to_string()))?;
    map.insert(id.clone(), tx);
  }

  let delay = interval_ms.unwrap_or(1000).max(200);
  let session_id = id.clone();

  tokio::spawn(async move {
    let mut timer = tokio::time::interval(tokio::time::Duration::from_millis(delay));
    loop {
      tokio::select! {
        _ = timer.tick() => {
          match rpi_pins_status(session_id.clone()).await {
            Ok(lines) => {
              let channel_name = format!("gpio_update_{}", session_id);
              let _ = app.emit(&channel_name, &lines);
            }
            Err(err) => {
              let channel_name = format!("gpio_error_{}", session_id);
              let _ = app.emit(&channel_name, &err.message);
              break;
            }
          }
        }
        _ = &mut rx => {
          break;
        }
      }
    }

    if let Ok(mut map) = GPIO_MONITORS.lock() {
      map.remove(&session_id);
    }
  });

  Ok(())
}

#[tauri::command]
pub async fn rpi_pins_monitor_stop(id: String) -> Result<(), CommandError> {
  let mut map = GPIO_MONITORS.lock().map_err(|e| CommandError::internal("LOCK_POISONED", e.to_string()))?;
  if let Some(tx) = map.remove(&id) {
    let _ = tx.send(());
  }
  Ok(())
}
