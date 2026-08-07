//! cmd/sftp — Operaciones SFTP y transferencias de archivos
//!
//! Este módulo contiene:
//! - operations: Comandos básicos (open, home, list, mkdir, remove)
//! - transfers: Transferencias de archivos (download/upload, directorios)

use std::sync::{Arc, Mutex};
use crate::error::AppError;
use crate::ssh_core::ssh2_sftp as sftp2;
use crate::cmd::state::{SessionExt, CachedSsh2};

pub mod operations;
pub mod transfers;

pub use operations::{
  sftp_open,
  sftp_home,
  sftp_list,
  sftp_mkdir,
  sftp_rename,
  sftp_remove,
  sftp_cancel,
  sftp_read_text,
};

pub use transfers::{
  sftp_download_start,
  sftp_upload_start,
  sftp_upload_dir_start,
  sftp_download_dir_start,
};

/// Obtiene o crea una conexión SFTP cacheada para una sesión
pub fn get_or_connect_cached(map: &mut std::collections::HashMap<String, SessionExt>, id: &str) -> Result<Arc<Mutex<CachedSsh2>>, String> {
  if let Some(existing) = map.get(id).and_then(|s| s.sftp_cached.clone()) { return Ok(existing); }
  let (host, port, user, password) = {
    let s = map.get(id).ok_or_else(|| AppError::NotFoundSession.to_string())?;
    (s.host.clone(), s.port, s.user.clone(), s.password.clone())
  };
  let (tcp, sess) = sftp2::connect_password(&host, port, &user, &password).map_err(|e| e.to_string())?;
  let arc = Arc::new(Mutex::new(CachedSsh2::new(tcp, sess)));
  if let Some(s) = map.get_mut(id) { s.sftp_cached = Some(arc.clone()); }
  Ok(arc)
}

/// Clifica errores SFTP en mensajes amigables en español
pub fn classify_sftp_error(e: &str) -> String {
  let lower = e.to_lowercase();
  if lower.contains("no such file") || lower.contains("not found") {
    "Ruta remota no encontrada o inaccesible".into()
  } else if lower.contains("permission denied") || lower.contains("permission") {
    "Permiso denegado al acceder a la ruta remota".into()
  } else if lower.contains("connection reset") || lower.contains("session") || lower.contains("eof") {
    "La sesión SFTP se ha perdido o ha sido cerrada".into()
  } else if lower.contains("disk full") || lower.contains("no space") {
    "No hay espacio suficiente en disco".into()
  } else {
    e.to_string()
  }
}