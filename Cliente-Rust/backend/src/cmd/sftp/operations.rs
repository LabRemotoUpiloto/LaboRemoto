use std::sync::{Arc, Mutex};
use std::sync::atomic::Ordering;

use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::ssh_core::ssh2_sftp as sftp2;
use crate::cmd::state::{SESSIONS, TRANSFERS, SftpEntry, CachedSsh2};
use crate::cmd::protocol::{CommandError, CommandRequest, CommandResponse};
use super::{get_or_connect_cached, classify_sftp_error};

// ── Fase C: envelope versionado (CommandRequest/CommandResponse) ────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SftpListPayload {
  pub id: String,
  pub path: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct SftpListResponse {
  pub entries: Vec<SftpEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SftpMkdirPayload {
  pub id: String,
  pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SftpMkdirResponse {
  pub ok: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SftpRenamePayload {
  pub id: String,
  pub old_path: String,
  pub new_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SftpRenameResponse {
  pub ok: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SftpReadTextPayload {
  pub id: String,
  pub path: String,
  pub max_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SftpReadTextResponse {
  pub content: String,
  pub truncated: bool,
  pub size: Option<u64>,
}

const SFTP_READ_TEXT_DEFAULT_MAX_BYTES: u64 = 256 * 1024;

// ── Migración precisa a CommandError (REFACTOR #3 FASE B, Batch 2) ──────────
//
// Estos helpers reemplazan al `wrap_result` heurístico: cada fuente de error
// (lock poisoning, sesión no encontrada, fallo de conexión SFTP, fallo de
// operación SFTP concreta) se mapea explícitamente a la categoría de
// `CommandError` que le corresponde, en vez de adivinar a partir del texto
// del mensaje.

/// Envuelve un `Result<T, CommandError>` ya categorizado en un
/// `CommandResponse<T>`, preservando el `retry_after_ms` sugerido por el
/// error (si lo hay). Reemplaza a `wrap_result` para los comandos de este
/// módulo, que ahora categorizan sus errores de forma precisa en el sitio
/// donde ocurren en lugar de depender de heurísticas sobre el mensaje.
fn to_response<T>(
  id: String,
  version: String,
  result: Result<T, CommandError>,
  elapsed_ms: i64,
) -> CommandResponse<T> {
  match result {
    Ok(data) => CommandResponse::success(id, version, data, elapsed_ms),
    Err(error) => {
      let retry_after_ms = error.retry_after_ms.map(|ms| ms as i64);
      CommandResponse::error(id, version, error, retry_after_ms)
    }
  }
}

/// Error de bloqueo envenenado (poison error) en un `Mutex` compartido.
/// Siempre se trata como interno: indica un panic previo en otro hilo, no un
/// fallo esperable del dominio SFTP.
fn lock_poisoned(resource: &str) -> CommandError {
  CommandError::internal("LOCK_POISONED", format!("{} lock poisoned", resource))
}

/// Mapea el error `String` de `get_or_connect_cached` (definido en
/// `cmd::sftp::mod`, compartido con `transfers.rs`) a un `CommandError`
/// preciso: sesión no encontrada → `session_expired`, cualquier otra causa
/// (fallo de conexión SSH/SFTP) → transitorio (reintentable).
fn map_cache_error(e: String, operation: &str, id: &str) -> CommandError {
  if e == AppError::NotFoundSession.to_string() {
    return CommandError::from(AppError::NotFoundSession);
  }
  CommandError::transient("SSH_CONNECTION_FAILED", format!("No se pudo conectar SFTP: {}", e))
    .with_context(operation, id)
}

/// Mapea un error de una operación SFTP concreta (`anyhow::Error` proveniente
/// de `ssh_core::ssh2_sftp`) a la categoría correcta, usando el mensaje ya
/// normalizado por `classify_sftp_error` como texto para el usuario.
fn map_sftp_error(e: anyhow::Error, operation: &str, resource: &str) -> CommandError {
  let raw = e.to_string();
  let friendly = classify_sftp_error(&raw);
  let lower = raw.to_lowercase();

  let error = if lower.contains("no such file") || lower.contains("not found") {
    CommandError::permanent("SFTP_NOT_FOUND", friendly)
  } else if lower.contains("permission denied") || lower.contains("permission") {
    CommandError::permanent("SFTP_PERMISSION_DENIED", friendly)
  } else if lower.contains("connection reset") || lower.contains("session") || lower.contains("eof") {
    CommandError::session_expired()
  } else if lower.contains("disk full") || lower.contains("no space") {
    CommandError::permanent("SFTP_DISK_FULL", friendly)
  } else {
    CommandError::transient("SFTP_ERROR", friendly)
  };

  error.with_context(operation, resource)
}

/// Error de unión de una tarea `spawn_blocking` (panic dentro de la tarea).
fn task_join_error(e: tokio::task::JoinError) -> CommandError {
  CommandError::internal("TASK_JOIN_ERROR", e.to_string())
}

#[tauri::command]
pub async fn sftp_read_text(
  req: CommandRequest<SftpReadTextPayload>,
) -> Result<CommandResponse<SftpReadTextResponse>, CommandError> {
  let started = std::time::Instant::now();
  let SftpReadTextPayload { id, path, max_bytes } = req.payload;
  let result = sftp_read_text_impl(id, path, max_bytes.unwrap_or(SFTP_READ_TEXT_DEFAULT_MAX_BYTES)).await;
  let elapsed_ms = started.elapsed().as_millis() as i64;
  Ok(to_response(req.id, req.version, result, elapsed_ms))
}

async fn sftp_read_text_impl(id: String, path: String, max_bytes: u64) -> Result<SftpReadTextResponse, CommandError> {
  let (buf, truncated, size) = tokio::task::spawn_blocking(move || -> Result<_, CommandError> {
    let cached = {
      let mut map = SESSIONS.lock().map_err(|_| lock_poisoned("SESSIONS"))?;
      get_or_connect_cached(&mut map, &id).map_err(|e| map_cache_error(e, "sftp_read_text", &id))?
    };
    let mut guard = cached.lock().map_err(|_| lock_poisoned("ssh2"))?;
    let sftp = guard.get_or_open_sftp().map_err(|e| map_sftp_error(e, "sftp_read_text", &path))?;
    sftp2::read_text(sftp, &path, max_bytes).map_err(|e| map_sftp_error(e, "sftp_read_text", &path))
  }).await.map_err(task_join_error)??;

  Ok(SftpReadTextResponse {
    content: String::from_utf8_lossy(&buf).to_string(),
    truncated,
    size,
  })
}

#[tauri::command]
pub async fn sftp_open(id: String) -> Result<(), CommandError> {
  let map = SESSIONS.lock().map_err(|_| lock_poisoned("SESSIONS"))?;
  if !map.contains_key(&id) {
    return Err(CommandError::from(AppError::NotFoundSession).with_context("sftp_open", &id));
  }
  Ok(())
}

#[tauri::command]
pub async fn sftp_home(id: String) -> Result<String, CommandError> {
  let home = tokio::task::spawn_blocking(move || -> Result<String, CommandError> {
    let (cached, user) = {
      let mut map = SESSIONS.lock().map_err(|_| lock_poisoned("SESSIONS"))?;
      let user = map.get(&id)
        .ok_or_else(|| CommandError::from(AppError::NotFoundSession))?
        .user.clone();
      let cached = get_or_connect_cached(&mut map, &id).map_err(|e| map_cache_error(e, "sftp_home", &id))?;
      (cached, user)
    };
    let mut guard = cached.lock().map_err(|_| lock_poisoned("ssh2"))?;
    let sftp = guard.get_or_open_sftp().map_err(|e| map_sftp_error(e, "sftp_home", &id))?;
    use std::path::Path;
    if let Ok(p) = sftp.realpath(Path::new(".")) {
      if let Some(s) = p.to_str() { if !s.is_empty() { return Ok(s.to_string()); } }
    }
    if let Ok(p) = sftp.realpath(Path::new("~")) {
      if let Some(s) = p.to_str() { if s.starts_with('/') { return Ok(s.to_string()); } }
    }
    let user_sanit = user.split(|c| c=='\\' || c=='/').last().unwrap_or(&user);
    let guess = if user_sanit == "root" { "/root".to_string() } else { format!("/home/{}", user_sanit) };
    if sftp2::list_dir(sftp, &guess).is_ok() { return Ok(guess); }
    Ok("/".to_string())
  }).await.map_err(task_join_error)??;
  Ok(home)
}

#[tauri::command]
pub async fn sftp_list(
  req: CommandRequest<SftpListPayload>,
) -> Result<CommandResponse<SftpListResponse>, CommandError> {
  let started = std::time::Instant::now();
  let SftpListPayload { id, path } = req.payload;
  let result = sftp_list_impl(id, path)
    .await
    .map(|entries| SftpListResponse { entries });
  let elapsed_ms = started.elapsed().as_millis() as i64;
  Ok(to_response(req.id, req.version, result, elapsed_ms))
}

async fn sftp_list_impl(id: String, path: String) -> Result<Vec<SftpEntry>, CommandError> {
  let list = tokio::task::spawn_blocking(move || -> Result<Vec<sftp2::SftpEntry>, CommandError> {
    let cached = {
      let mut map = SESSIONS.lock().map_err(|_| lock_poisoned("SESSIONS"))?;
      get_or_connect_cached(&mut map, &id).map_err(|e| map_cache_error(e, "sftp_list", &id))?
    };
    let out_res: Result<_, CommandError> = (||{
      let mut guard = cached.lock().map_err(|_| lock_poisoned("ssh2"))?;
      let sftp = guard.get_or_open_sftp().map_err(|e| map_sftp_error(e, "sftp_list", &path))?;
      sftp2::list_dir(sftp, &path).map_err(|e| map_sftp_error(e, "sftp_list", &path))
    })();
    match out_res {
      Ok(v) => Ok(v),
      Err(_) => {
        // Reintento de reconexión: la conexión cacheada puede haberse
        // perdido (sesión SSH cerrada del lado remoto). Se reconecta una
        // vez con las credenciales originales antes de fallar.
        let (host, port, user, password) = {
          let map = SESSIONS.lock().map_err(|_| lock_poisoned("SESSIONS"))?;
          let s = map.get(&id).ok_or_else(|| CommandError::from(AppError::NotFoundSession))?;
          (s.host.clone(), s.port, s.user.clone(), s.password.clone())
        };
        let (tcp, sess) = sftp2::connect_password(&host, port, &user, &password)
          .map_err(|e| CommandError::transient(
            "SSH_CONNECTION_FAILED",
            format!("No se pudo reconectar SFTP: {}", e),
          ).with_context("sftp_list", &id))?;
        let cached2 = {
          let mut map = SESSIONS.lock().map_err(|_| lock_poisoned("SESSIONS"))?;
          if let Some(s) = map.get_mut(&id) { s.sftp_cached = Some(Arc::new(Mutex::new(CachedSsh2::new(tcp, sess)))); }
          map.get(&id)
            .ok_or_else(|| CommandError::from(AppError::NotFoundSession))?
            .sftp_cached.as_ref()
            .ok_or_else(|| CommandError::internal("SFTP_NOT_CACHED", "SFTP not cached"))?
            .clone()
        };
        let mut guard = cached2.lock().map_err(|_| lock_poisoned("ssh2"))?;
        let sftp = guard.get_or_open_sftp().map_err(|e| map_sftp_error(e, "sftp_list", &path))?;
        sftp2::list_dir(sftp, &path).map_err(|e| map_sftp_error(e, "sftp_list", &path))
      }
    }
  }).await.map_err(task_join_error)??;

  Ok(list.into_iter().map(|e| SftpEntry { name: e.name, path: e.path, kind: e.kind, size: e.size, perms: e.perms, mtime: e.mtime }).collect())
}

#[tauri::command]
pub async fn sftp_mkdir(
  req: CommandRequest<SftpMkdirPayload>,
) -> Result<CommandResponse<SftpMkdirResponse>, CommandError> {
  let started = std::time::Instant::now();
  let SftpMkdirPayload { id, path } = req.payload;
  let result = sftp_mkdir_impl(id, path)
    .await
    .map(|_| SftpMkdirResponse { ok: true });
  let elapsed_ms = started.elapsed().as_millis() as i64;
  Ok(to_response(req.id, req.version, result, elapsed_ms))
}

async fn sftp_mkdir_impl(id: String, path: String) -> Result<(), CommandError> {
  tokio::task::spawn_blocking(move || -> Result<(), CommandError> {
    let cached = {
      let mut map = SESSIONS.lock().map_err(|_| lock_poisoned("SESSIONS"))?;
      get_or_connect_cached(&mut map, &id).map_err(|e| map_cache_error(e, "sftp_mkdir", &id))?
    };
    let mut guard = cached.lock().map_err(|_| lock_poisoned("ssh2"))?;
    let sftp = guard.get_or_open_sftp().map_err(|e| map_sftp_error(e, "sftp_mkdir", &path))?;
    sftp2::mkdir(sftp, &path).map_err(|e| map_sftp_error(e, "sftp_mkdir", &path))
  }).await.map_err(task_join_error)??;
  Ok(())
}

#[tauri::command]
pub async fn sftp_rename(
  req: CommandRequest<SftpRenamePayload>,
) -> Result<CommandResponse<SftpRenameResponse>, CommandError> {
  let started = std::time::Instant::now();
  let SftpRenamePayload { id, old_path, new_path } = req.payload;
  let result = sftp_rename_impl(id, old_path, new_path)
    .await
    .map(|_| SftpRenameResponse { ok: true });
  let elapsed_ms = started.elapsed().as_millis() as i64;
  Ok(to_response(req.id, req.version, result, elapsed_ms))
}

async fn sftp_rename_impl(id: String, old_path: String, new_path: String) -> Result<(), CommandError> {
  tokio::task::spawn_blocking(move || -> Result<(), CommandError> {
    let cached = {
      let mut map = SESSIONS.lock().map_err(|_| lock_poisoned("SESSIONS"))?;
      get_or_connect_cached(&mut map, &id).map_err(|e| map_cache_error(e, "sftp_rename", &id))?
    };
    let mut guard = cached.lock().map_err(|_| lock_poisoned("ssh2"))?;
    let sftp = guard.get_or_open_sftp().map_err(|e| map_sftp_error(e, "sftp_rename", &old_path))?;
    sftp2::rename(sftp, &old_path, &new_path).map_err(|e| map_sftp_error(e, "sftp_rename", &old_path))
  }).await.map_err(task_join_error)??;
  Ok(())
}

#[tauri::command]
pub async fn sftp_remove(id: String, path: String, recursive: Option<bool>) -> Result<(), CommandError> {
  let rec = recursive.unwrap_or(false);
  tokio::task::spawn_blocking(move || -> Result<(), CommandError> {
    let cached = {
      let mut map = SESSIONS.lock().map_err(|_| lock_poisoned("SESSIONS"))?;
      get_or_connect_cached(&mut map, &id).map_err(|e| map_cache_error(e, "sftp_remove", &id))?
    };
    let mut guard = cached.lock().map_err(|_| lock_poisoned("ssh2"))?;
    let sftp = guard.get_or_open_sftp().map_err(|e| map_sftp_error(e, "sftp_remove", &path))?;
    if !rec {
      if sftp2::remove_file(sftp, &path).is_ok() { return Ok(()); }
      return sftp2::remove_dir(sftp, &path).map_err(|e| map_sftp_error(e, "sftp_remove", &path));
    }
    fn remove_rec(sftp: &ssh2::Sftp, p: &str) -> Result<(), CommandError> {
      let list = sftp2::list_dir(sftp, p).map_err(|e| map_sftp_error(e, "sftp_remove", p))?;
      for e in list {
        if e.kind == "dir" {
          remove_rec(sftp, &e.path)?;
        } else {
          sftp2::remove_file(sftp, &e.path).map_err(|e2| map_sftp_error(e2, "sftp_remove", &e.path))?;
        }
      }
      sftp2::remove_dir(sftp, p).map_err(|e| map_sftp_error(e, "sftp_remove", p))
    }
    remove_rec(sftp, &path)
  }).await.map_err(task_join_error)??;
  Ok(())
}

#[tauri::command]
pub async fn sftp_cancel(_id: String, transfer_id: String) -> Result<(), CommandError> {
  let flag = TRANSFERS.lock()
    .map_err(|_| lock_poisoned("TRANSFERS"))?
    .get(&transfer_id)
    .cloned();
  match flag {
    Some(flag) => {
      flag.store(true, Ordering::Relaxed);
      Ok(())
    }
    None => Err(CommandError::permanent(
      "TRANSFER_NOT_FOUND",
      format!("Transferencia no encontrada: {}", transfer_id),
    )),
  }
}
