use std::io::Read;
use crate::cmd::state::{CachedSsh2, SESSIONS};
use crate::error::AppError;

/// Devuelve o crea la sesión ssh2 cacheada para el session_id dado.
pub fn acquire_ssh2(id: &str) -> Result<std::sync::Arc<std::sync::Mutex<CachedSsh2>>, String> {
    let mut map = SESSIONS.lock().map_err(|e| e.to_string())?;
    let s = map
        .get_mut(id)
        .ok_or_else(|| AppError::NotFoundSession.to_string())?;
    if let Some(existing) = s.sftp_cached.clone() {
        Ok(existing)
    } else {
        let (tcp, sess2) = crate::ssh_core::ssh2_sftp::connect_password(&s.host, s.port, &s.user, &s.password)
            .map_err(|e| e.to_string())?;
        let arc = std::sync::Arc::new(std::sync::Mutex::new(CachedSsh2::new(tcp, sess2)));
        s.sftp_cached = Some(arc.clone());
        Ok(arc)
    }
}

/// Ejecuta un comando shell vía la sesión ssh2 cacheada identificada por `id`.
/// Devuelve `(exit_status, stdout)`.
pub fn ssh_exec(id: &str, cmd: &str) -> Result<(i32, String), String> {
    let arc = acquire_ssh2(id)?;
    let guard = arc.lock().map_err(|_| "ssh2 lock poisoned")?;
    ssh_exec_session(&guard.sess, cmd)
}

/// Ejecuta un comando shell en una sesión `ssh2::Session` ya abierta.
/// Devuelve `(exit_status, stdout)`.
pub fn ssh_exec_session(sess: &ssh2::Session, cmd: &str) -> Result<(i32, String), String> {
    let mut ch = sess.channel_session().map_err(|e| e.to_string())?;
    ch.exec(cmd).map_err(|e| e.to_string())?;
    let mut out = String::new();
    ch.read_to_string(&mut out).map_err(|e| e.to_string())?;
    let _ = ch.wait_close();
    let code = ch.exit_status().unwrap_or(-1);
    Ok((code, out))
}
