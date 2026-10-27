//! Conexión y ejecución SSH/SFTP de las tools del agente (sesión propia con caché por session_id).

use std::collections::HashMap;
use std::io::Read;
use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;
use crate::cmd::state::{CachedSsh2, SESSIONS};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers SSH/SFTP
// ─────────────────────────────────────────────────────────────────────────────

pub(super) fn get_creds(session_id: &str) -> Result<(String, u16, String, String), String> {
    if session_id == crate::cmd::tools::pi4_config::PI4_ENV_SESSION_ID {
        crate::cmd::tools::pi4_config::load_pi4_creds()
            .map(|c| (c.host, c.port, c.user, c.password))
            .ok_or_else(|| {
                "Raspberry Pi no configurada. Define PI4_USER y PI4_PASSWORD en Cliente-Rust/.env."
                    .to_string()
            })
    } else {
        let map = SESSIONS.lock().map_err(|e| e.to_string())?;
        let s = map.get(session_id).ok_or("Sesión no encontrada")?;
        Ok((s.host.clone(), s.port, s.user.clone(), s.password.clone()))
    }
}

// Cache de conexiones SSH reutilizadas entre llamadas a tools dentro del
// loop del agente. Perf: antes de esto, CADA tool call (ejecutar_comando,
// leer_archivo, escribir_archivo, ...) hacía un connect_password completo
// (TCP + handshake + auth) desde cero — una conversación de agente con 8
// rondas podía pagar 8 handshakes SSH. Separado de `SESSIONS.sftp_cached`
// porque `session_id` aquí puede ser el pseudo-id de la Pi configurada por
// .env (`PI4_ENV_SESSION_ID`), que no tiene entrada en `SESSIONS`.
static TOOL_SSH_CACHE: Lazy<Mutex<HashMap<String, Arc<Mutex<CachedSsh2>>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

pub(super) fn evict_tool_ssh(session_id: &str) {
    if let Ok(mut cache) = TOOL_SSH_CACHE.lock() {
        cache.remove(session_id);
    }
}

pub(super) fn get_or_connect_tool_ssh(session_id: &str) -> Result<Arc<Mutex<CachedSsh2>>, String> {
    if let Some(existing) = TOOL_SSH_CACHE.lock().map_err(|e| e.to_string())?.get(session_id).cloned() {
        return Ok(existing);
    }

    // El handshake se hace SIN el lock del cache tomado, para no bloquear
    // otras tool calls concurrentes mientras este conecta.
    let (host, port, user, password) = get_creds(session_id)?;
    let (tcp, sess) = crate::ssh_core::ssh2_sftp::connect_password(&host, port, &user, &password)
        .map_err(|e| format!("SSH: {e}"))?;
    sess.set_blocking(true);
    sess.set_timeout(30_000);
    let arc = Arc::new(Mutex::new(CachedSsh2::new(tcp, sess)));

    let mut cache = TOOL_SSH_CACHE.lock().map_err(|e| e.to_string())?;
    if let Some(existing) = cache.get(session_id).cloned() {
        return Ok(existing);
    }
    cache.insert(session_id.to_string(), arc.clone());
    Ok(arc)
}

pub(super) fn run_ssh_exec(session_id: &str, cmd: &str) -> Result<String, String> {
    fn exec_once(sess: &ssh2::Session, cmd: &str) -> Result<String, String> {
        let mut ch = sess.channel_session().map_err(|e| format!("Canal: {e}"))?;
        ch.exec(cmd).map_err(|e| format!("exec: {e}"))?;
        let mut stdout = String::new();
        ch.read_to_string(&mut stdout).map_err(|e| format!("read: {e}"))?;
        let mut stderr_buf = String::new();
        ch.stderr().read_to_string(&mut stderr_buf).ok();
        ch.wait_close().ok();
        let exit_code = ch.exit_status().unwrap_or(-1);
        let mut out = stdout;
        if !stderr_buf.is_empty() { out.push_str(&format!("\n[stderr]: {stderr_buf}")); }
        if exit_code != 0 { out.push_str(&format!("\n[exit: {exit_code}]")); }
        Ok(if out.is_empty() { "(sin salida)".to_string() } else { out.trim_end().to_string() })
    }

    let arc = get_or_connect_tool_ssh(session_id)?;
    let first = {
        let guard = arc.lock().map_err(|_| "ssh2 lock poisoned".to_string())?;
        exec_once(&guard.sess, cmd)
    };
    match first {
        Ok(out) => Ok(out),
        Err(_) => {
            // La conexión cacheada puede haberse caído (sesión SSH remota
            // cerrada); se reconecta una vez antes de fallar.
            evict_tool_ssh(session_id);
            let arc2 = get_or_connect_tool_ssh(session_id)?;
            let guard = arc2.lock().map_err(|_| "ssh2 lock poisoned".to_string())?;
            exec_once(&guard.sess, cmd)
        }
    }
}

pub(super) fn sftp_read(session_id: &str, path: &str) -> Result<String, String> {
    fn read_once(guard: &mut CachedSsh2, path: &str) -> Result<String, String> {
        let sftp = guard.get_or_open_sftp().map_err(|e| format!("SFTP: {e}"))?;
        let mut f = sftp.open(std::path::Path::new(path)).map_err(|e| format!("open '{path}': {e}"))?;
        let mut content = String::new();
        f.read_to_string(&mut content).map_err(|e| format!("read: {e}"))?;
        if content.len() > 32_768 {
            content.truncate(32_768);
            content.push_str("\n[...truncado a 32KB]");
        }
        Ok(content)
    }

    let arc = get_or_connect_tool_ssh(session_id)?;
    let first = {
        let mut guard = arc.lock().map_err(|_| "ssh2 lock poisoned".to_string())?;
        read_once(&mut guard, path)
    };
    match first {
        Ok(v) => Ok(v),
        Err(_) => {
            evict_tool_ssh(session_id);
            let arc2 = get_or_connect_tool_ssh(session_id)?;
            let mut guard = arc2.lock().map_err(|_| "ssh2 lock poisoned".to_string())?;
            read_once(&mut guard, path)
        }
    }
}

pub(super) fn sftp_write(session_id: &str, path: &str, data: &[u8]) -> Result<(), String> {
    fn write_once(guard: &mut CachedSsh2, path: &str, data: &[u8]) -> Result<(), String> {
        use std::io::Write;
        let sftp = guard.get_or_open_sftp().map_err(|e| format!("SFTP: {e}"))?;
        let mut f = sftp.create(std::path::Path::new(path)).map_err(|e| format!("create '{path}': {e}"))?;
        f.write_all(data).map_err(|e| format!("write: {e}"))?;
        Ok(())
    }

    let arc = get_or_connect_tool_ssh(session_id)?;
    let first = {
        let mut guard = arc.lock().map_err(|_| "ssh2 lock poisoned".to_string())?;
        write_once(&mut guard, path, data)
    };
    match first {
        Ok(()) => Ok(()),
        Err(_) => {
            evict_tool_ssh(session_id);
            let arc2 = get_or_connect_tool_ssh(session_id)?;
            let mut guard = arc2.lock().map_err(|_| "ssh2 lock poisoned".to_string())?;
            write_once(&mut guard, path, data)
        }
    }
}
