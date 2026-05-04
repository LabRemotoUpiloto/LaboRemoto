use crate::cmd::state::{SESSIONS, CachedSsh2};
use crate::error::AppError;
use regex::Regex;
use std::sync::{Arc, Mutex};

#[derive(serde::Serialize, Debug, Clone)]
pub struct RpiGpioLine {
  pub gpio: u32,           // BCM number
  pub level: Option<u8>,   // 0/1 if reported
  pub func: String,        // INPUT/OUTPUT/ALT{n}
  pub pull: Option<String> // UP/DOWN/NONE
}

fn get_or_connect_cached(id: &str) -> Result<Arc<Mutex<CachedSsh2>>, String> {
  let mut map = SESSIONS.lock().map_err(|e| e.to_string())?;
  let s = map.get_mut(id).ok_or_else(|| AppError::NotFoundSession.to_string())?;
  if let Some(existing) = s.sftp_cached.clone() {
    Ok(existing)
  } else {
    let (tcp, sess2) = crate::ssh_core::ssh2_sftp::connect_password(&s.host, s.port, &s.user, &s.password)
      .map_err(|e| e.to_string())?;
    let arc = Arc::new(Mutex::new(CachedSsh2 { tcp, sess: sess2 }));
    s.sftp_cached = Some(arc.clone());
    Ok(arc)
  }
}

#[tauri::command]
pub async fn rpi_pins_status(id: String) -> Result<Vec<RpiGpioLine>, String> {
  let arc_cached = get_or_connect_cached(&id)?;

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

  let arc_cached = get_or_connect_cached(&id)?;

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

  let arc_cached = get_or_connect_cached(&id)?;

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

  let arc_cached = get_or_connect_cached(&id)?;

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
  let arc_cached = get_or_connect_cached(&id)?;

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