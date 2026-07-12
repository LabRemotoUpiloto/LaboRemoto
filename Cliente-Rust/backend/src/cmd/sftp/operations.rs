use std::sync::{Arc, Mutex};
use std::sync::atomic::Ordering;

use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::ssh_core::ssh2_sftp as sftp2;
use crate::cmd::state::{SESSIONS, TRANSFERS, SftpEntry, CachedSsh2};
use crate::cmd::protocol::{wrap_result, CommandError, CommandRequest, CommandResponse};
use super::get_or_connect_cached;

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

#[tauri::command]
pub async fn sftp_open(id: String) -> Result<(), String> {
  let map = SESSIONS.lock().map_err(|e| e.to_string())?;
  if !map.contains_key(&id) { return Err(AppError::NotFoundSession.to_string()); }
  Ok(())
}

#[tauri::command]
pub async fn sftp_home(id: String) -> Result<String, String> {
  let home = tokio::task::spawn_blocking(move || {
    let (cached, user) = {
      let mut map = SESSIONS.lock().map_err(|e| e.to_string())?;
      let user = map.get(&id).ok_or_else(|| AppError::NotFoundSession.to_string())?.user.clone();
      let cached = get_or_connect_cached(&mut map, &id)?;
      (cached, user)
    };
    let guard = cached.lock().map_err(|e| e.to_string())?;
    let sftp = sftp2::open_sftp(&guard.sess).map_err(|e| e.to_string())?;
    use std::path::Path;
    if let Ok(p) = sftp.realpath(Path::new(".")) {
      if let Some(s) = p.to_str() { if !s.is_empty() { return Ok::<String,String>(s.to_string()); } }
    }
    if let Ok(p) = sftp.realpath(Path::new("~")) {
      if let Some(s) = p.to_str() { if s.starts_with('/') { return Ok::<String,String>(s.to_string()); } }
    }
    let user_sanit = user.split(|c| c=='\\' || c=='/').last().unwrap_or(&user);
    let guess = if user_sanit == "root" { "/root".to_string() } else { format!("/home/{}", user_sanit) };
    if let Ok(_cached2) = sftp2::list_dir(&sftp, &guess) { return Ok(guess); }
    Ok::<String,String>("/".to_string())
  }).await.map_err(|e| e.to_string())??;
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
  Ok(wrap_result(req.id, req.version, result, elapsed_ms))
}

async fn sftp_list_impl(id: String, path: String) -> Result<Vec<SftpEntry>, String> {
  let list = tokio::task::spawn_blocking(move || {
    let cached = {
      let mut map = SESSIONS.lock().map_err(|e| e.to_string())?;
      get_or_connect_cached(&mut map, &id)?
    };
    let out_res: Result<_, String> = (||{
      let guard = cached.lock().map_err(|e| e.to_string())?;
      let sftp = sftp2::open_sftp(&guard.sess).map_err(|e| e.to_string())?;
      sftp2::list_dir(&sftp, &path).map_err(|e| e.to_string())
    })();
    match out_res {
      Ok(v) => Ok(v),
      Err(_) => {
        let (host, port, user, password) = {
          let map = SESSIONS.lock().map_err(|e| e.to_string())?;
          let s = map.get(&id).ok_or_else(|| AppError::NotFoundSession.to_string())?;
          (s.host.clone(), s.port, s.user.clone(), s.password.clone())
        };
        let (tcp, sess) = sftp2::connect_password(&host, port, &user, &password).map_err(|e| e.to_string())?;
        let cached2 = {
          let mut map = SESSIONS.lock().map_err(|e| e.to_string())?;
          if let Some(s) = map.get_mut(&id) { s.sftp_cached = Some(Arc::new(Mutex::new(CachedSsh2 { tcp, sess }))); }
          map.get(&id).ok_or("Session lost")?.sftp_cached.as_ref().ok_or("SFTP not cached")?.clone()
        };
        let guard = cached2.lock().map_err(|e| e.to_string())?;
        let sftp = sftp2::open_sftp(&guard.sess).map_err(|e| e.to_string())?;
        sftp2::list_dir(&sftp, &path).map_err(|e| e.to_string())
      }
    }
  }).await.map_err(|e| e.to_string())??;

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
  Ok(wrap_result(req.id, req.version, result, elapsed_ms))
}

async fn sftp_mkdir_impl(id: String, path: String) -> Result<(), String> {
  tokio::task::spawn_blocking(move || {
    let cached = {
      let mut map = SESSIONS.lock().map_err(|e| e.to_string())?;
      get_or_connect_cached(&mut map, &id)?
    };
    let guard = cached.lock().map_err(|e| e.to_string())?;
    let sftp = sftp2::open_sftp(&guard.sess).map_err(|e| e.to_string())?;
    sftp2::mkdir(&sftp, &path).map_err(|e| e.to_string())
  }).await.map_err(|e| e.to_string())??;
  Ok(())
}

#[tauri::command]
pub async fn sftp_remove(id: String, path: String, recursive: Option<bool>) -> Result<(), String> {
  let rec = recursive.unwrap_or(false);
  tokio::task::spawn_blocking(move || {
    let cached = {
      let mut map = SESSIONS.lock().map_err(|e| e.to_string())?;
      get_or_connect_cached(&mut map, &id)?
    };
    let guard = cached.lock().map_err(|e| e.to_string())?;
    let sftp = sftp2::open_sftp(&guard.sess).map_err(|e| e.to_string())?;
    if !rec {
      match sftp2::remove_file(&sftp, &path) { Ok(_) => return Ok(()), Err(_) => {} }
      return sftp2::remove_dir(&sftp, &path).map_err(|e| e.to_string());
    }
    fn remove_rec(sftp: &ssh2::Sftp, p: &str) -> Result<(), String> {
      let list = sftp2::list_dir(sftp, p).map_err(|e| e.to_string())?;
      for e in list {
        if e.kind == "dir" { remove_rec(sftp, &e.path)?; } else { sftp2::remove_file(sftp, &e.path).map_err(|e| e.to_string())?; }
      }
      sftp2::remove_dir(sftp, p).map_err(|e| e.to_string())
    }
    remove_rec(&sftp, &path)
  }).await.map_err(|e| e.to_string())??;
  Ok(())
}

#[tauri::command]
pub async fn sftp_cancel(_id: String, transfer_id: String) -> Result<(), String> {
  if let Some(flag) = TRANSFERS.lock().map_err(|e| e.to_string())?.get(&transfer_id) {
    flag.store(true, Ordering::Relaxed);
    Ok(())
  } else {
    Err("transfer not found".into())
  }
}