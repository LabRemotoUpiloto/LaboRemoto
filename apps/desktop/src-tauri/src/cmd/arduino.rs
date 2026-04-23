//! Comandos Tauri para comunicarse con el bridge HTTP del Arduino de domótica
//! que corre en la Raspberry Pi (`/home/pi/arduino_bridge.py` expuesto en
//! `127.0.0.1:8765`). Los comandos se ejecutan mediante `curl` a través de la
//! sesión SSH ya autenticada (reutilizando la misma caché ssh2 que usa el
//! panel GPIO y SFTP), evitando abrir nuevas conexiones TCP por cada click.
//!
//! Ver `docs/arduino_domotica.md` para instalación en la Pi.

use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::io::Read;

use super::state::SESSIONS;

const BRIDGE_URL: &str = "http://127.0.0.1:8765";

/// Devuelve o crea la sesión ssh2 cacheada (misma lógica que `rpi_pins_status`).
fn acquire_ssh2(id: &str) -> Result<std::sync::Arc<std::sync::Mutex<crate::cmd::state::CachedSsh2>>, String> {
    let mut map = SESSIONS.lock().map_err(|e| e.to_string())?;
    let s = map
        .get_mut(id)
        .ok_or_else(|| AppError::NotFoundSession.to_string())?;
    if let Some(existing) = s.sftp_cached.clone() {
        Ok(existing)
    } else {
        let (tcp, sess2) = crate::ssh::ssh2_sftp::connect_password(&s.host, s.port, &s.user, &s.password)
            .map_err(|e| e.to_string())?;
        let arc = std::sync::Arc::new(std::sync::Mutex::new(crate::cmd::state::CachedSsh2 {
            tcp,
            sess: sess2,
        }));
        s.sftp_cached = Some(arc.clone());
        Ok(arc)
    }
}

/// Ejecuta un comando shell en la Pi y devuelve (exit_code, stdout).
fn ssh_exec(id: &str, cmd: &str) -> Result<(i32, String), String> {
    let arc = acquire_ssh2(id)?;
    let guard = arc.lock().map_err(|_| "ssh2 lock poisoned")?;
    let mut ch = guard.sess.channel_session().map_err(|e| e.to_string())?;
    ch.exec(cmd).map_err(|e| e.to_string())?;
    let mut buf = String::new();
    let _ = ch.read_to_string(&mut buf);
    let _ = ch.wait_close();
    let status = ch.exit_status().unwrap_or(0);
    Ok((status, buf))
}

/// Escapa un argumento para uso seguro dentro de comillas simples en bash.
/// Convierte cada `'` en `'\''` y envuelve todo en comillas simples.
fn bash_quote(s: &str) -> String {
    let escaped = s.replace('\'', r"'\''");
    format!("'{}'", escaped)
}

// ───────────────────────── /status ─────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct ArduinoBridgeStatus {
    /// Puerto serial detectado en la Pi (ej. "/dev/ttyACM0"). None si no hay.
    pub port: Option<String>,
    /// true si el bridge tiene el serial abierto.
    pub open: bool,
    /// Último error del bridge si falló algo.
    pub last_error: Option<String>,
    /// Cuántas líneas espontáneas del Arduino están en el buffer.
    #[serde(default)]
    pub rx_lines: Option<u32>,
    /// true si el bridge HTTP respondió (aunque serial esté cerrado).
    /// No lo envía el bridge; se fija a true en Rust cuando hubo respuesta válida.
    #[serde(default)]
    pub reachable: bool,
}

#[tauri::command]
pub async fn arduino_bridge_status(id: String) -> Result<ArduinoBridgeStatus, String> {
    let cmd = format!("curl -s --max-time 2 {}/status", BRIDGE_URL);
    let (_st, out) = ssh_exec(&id, &cmd)?;
    let body = out.trim();
    if body.is_empty() {
        return Ok(ArduinoBridgeStatus {
            reachable: false,
            last_error: Some("bridge no responde (¿arduino-bridge.service activo?)".into()),
            ..Default::default()
        });
    }
    let mut parsed: ArduinoBridgeStatus =
        serde_json::from_str(body).map_err(|e| format!("JSON inválido del bridge: {e} — body: {body:?}"))?;
    parsed.reachable = true;
    Ok(parsed)
}

// ───────────────────────── POST /cmd ─────────────────────────

#[derive(Serialize, Debug, Clone)]
pub struct ArduinoCmdResponse {
    /// Respuesta textual del Arduino (ej. "OK LUZ1 ON", "PONG", "DIST:12.4").
    pub response: String,
    /// Código HTTP devuelto por el bridge.
    pub http_code: u16,
}

#[tauri::command]
pub async fn arduino_send_cmd(id: String, cmd: String) -> Result<ArduinoCmdResponse, String> {
    // Sanitizar: solo comandos cortos, ASCII imprimible, sin saltos.
    let trimmed = cmd.trim();
    if trimmed.is_empty() {
        return Err("Comando vacío".into());
    }
    if trimmed.len() > 128 {
        return Err("Comando demasiado largo (>128)".into());
    }
    if trimmed.chars().any(|c| c.is_control()) {
        return Err("Comando contiene caracteres de control".into());
    }

    // curl -s -o /tmp/body -w "%{http_code}" -X POST .../cmd -d '<cmd>'
    // Concatenamos body y código separados por '\n\t' (improbable dentro del body).
    let quoted = bash_quote(trimmed);
    let shell = format!(
        "curl -s --max-time 5 -X POST -o - -w '\\n\\t%{{http_code}}' {}/cmd -d {}",
        BRIDGE_URL, quoted
    );
    let (_st, out) = ssh_exec(&id, &shell)?;

    // Separar el código HTTP (última línea) del body.
    let (body, code) = match out.rsplit_once("\n\t") {
        Some((b, c)) => (b.trim().to_string(), c.trim().parse::<u16>().unwrap_or(0)),
        None => (out.trim().to_string(), 0),
    };

    if code >= 400 {
        return Err(format!("Bridge devolvió HTTP {code}: {body}"));
    }
    if code == 0 {
        return Err(format!(
            "No se recibió respuesta del bridge (¿arduino-bridge.service inactivo?). Respuesta cruda: {body}"
        ));
    }

    Ok(ArduinoCmdResponse {
        response: body,
        http_code: code,
    })
}

// ───────────────────────── GET /read ─────────────────────────

#[tauri::command]
pub async fn arduino_read_buffer(id: String) -> Result<Vec<String>, String> {
    let cmd = format!("curl -s --max-time 2 {}/read", BRIDGE_URL);
    let (_st, out) = ssh_exec(&id, &cmd)?;
    Ok(out
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect())
}
