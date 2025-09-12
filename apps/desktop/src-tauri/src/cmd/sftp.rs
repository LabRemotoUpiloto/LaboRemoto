use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use std::io::{Read, Write};

use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::error::AppError;
use crate::ssh::ssh2_sftp as sftp2;
use super::state::{SessionExt, CachedSsh2};

use super::state::{SESSIONS, TRANSFERS, SftpEntry};

#[tauri::command]
pub async fn sftp_open(id: String) -> Result<(), String> {
  let map = SESSIONS.lock().unwrap();
  if !map.contains_key(&id) { return Err(AppError::NotFound.to_string()); }
  Ok(())
}

// Devuelve un path "home" estimado para el usuario remoto.
// Intenta $HOME via shell, luego "~" expandido, y como fallback /home/<user> o /root.
#[tauri::command]
pub async fn sftp_home(id: String) -> Result<String, String> {
  let home = tokio::task::spawn_blocking(move || {
    let mut map = SESSIONS.lock().unwrap();
    let user = {
      let sref = map.get(&id).ok_or_else(|| AppError::NotFound.to_string())?;
      sref.user.clone()
    };
    // Intentar conectar (rellena cache si no existe)
    let cached = get_or_connect_cached(&mut map, &id)?;
    let guard = cached.lock().unwrap();
    let sftp = sftp2::open_sftp(&guard.sess).map_err(|e| e.to_string())?;
    use std::path::Path;
    // 1) Intentar obtener el directorio inicial real (normalmente home/chroot) via realpath('.')
    if let Ok(p) = sftp.realpath(Path::new(".")) {
      if let Some(s) = p.to_str() { if !s.is_empty() { return Ok::<String,String>(s.to_string()); } }
    }
    // 2) Intentar realpath('~') (algunos servidores lo permiten)
    if let Ok(p) = sftp.realpath(Path::new("~")) {
      if let Some(s) = p.to_str() { if s.starts_with('/') { return Ok::<String,String>(s.to_string()); } }
    }
    // 3) Sanitizar usuario (remover dominio tipo DOM\\user)
    let user_sanit = user.split(|c| c=='\\' || c=='/').last().unwrap_or(&user);
    // 4) Heurísticos: /home/<user> o /root
    let guess = if user_sanit == "root" { "/root".to_string() } else { format!("/home/{}", user_sanit) };
    // Validar list_dir en guess; si falla devolver '/'
    if let Ok(_cached2) = sftp2::list_dir(&sftp, &guess) { return Ok(guess); }
    Ok::<String,String>("/".to_string())
  }).await.map_err(|e| e.to_string())??;
  Ok(home)
}

// Obtiene una sesión ssh2 en caché para la sesión dada, o la crea si no existe o si falló.
fn get_or_connect_cached(map: &mut std::collections::HashMap<String, SessionExt>, id: &str) -> Result<Arc<Mutex<CachedSsh2>>, String> {
  // 1) ¿Ya hay cache?
  if let Some(existing) = map.get(id).and_then(|s| s.sftp_cached.clone()) { return Ok(existing); }
  // 2) Copiar credenciales y soltar lock antes de conectar
  let (host, port, user, password) = {
    let s = map.get(id).ok_or_else(|| AppError::NotFound.to_string())?;
    (s.host.clone(), s.port, s.user.clone(), s.password.clone())
  };
  // 3) Crear nueva conexión ssh2
  let (tcp, sess) = sftp2::connect_password(&host, port, &user, &password).map_err(|e| e.to_string())?;
  let arc = Arc::new(Mutex::new(CachedSsh2 { tcp, sess }));
  // 4) Guardar en el mapa
  if let Some(s) = map.get_mut(id) { s.sftp_cached = Some(arc.clone()); }
  Ok(arc)
}

#[tauri::command]
pub async fn sftp_list(id: String, path: String) -> Result<Vec<SftpEntry>, String> {
  let list = tokio::task::spawn_blocking(move || {
    let mut map = SESSIONS.lock().unwrap();
    let cached = get_or_connect_cached(&mut map, &id)?;
    // Intentar usar el SFTP; si falla, reconectar una vez
    let out_res: Result<_, String> = (||{
      let guard = cached.lock().unwrap();
      let sftp = sftp2::open_sftp(&guard.sess).map_err(|e| e.to_string())?;
      sftp2::list_dir(&sftp, &path).map_err(|e| e.to_string())
    })();
    match out_res {
      Ok(v) => Ok(v),
      Err(_) => {
        // Reconección
        let (host, port, user, password) = {
          let s = map.get(&id).ok_or_else(|| AppError::NotFound.to_string())?;
          (s.host.clone(), s.port, s.user.clone(), s.password.clone())
        };
        let (tcp, sess) = sftp2::connect_password(&host, port, &user, &password).map_err(|e| e.to_string())?;
        if let Some(s) = map.get_mut(&id) { s.sftp_cached = Some(Arc::new(Mutex::new(CachedSsh2 { tcp, sess }))); }
        let cached2 = map.get(&id).unwrap().sftp_cached.as_ref().unwrap().clone();
        let guard = cached2.lock().unwrap();
        let sftp = sftp2::open_sftp(&guard.sess).map_err(|e| e.to_string())?;
        sftp2::list_dir(&sftp, &path).map_err(|e| e.to_string())
      }
    }
  }).await.map_err(|e| e.to_string())??;

  Ok(list.into_iter().map(|e| SftpEntry { name: e.name, path: e.path, kind: e.kind, size: e.size, perms: e.perms, mtime: e.mtime }).collect())
}

#[tauri::command]
pub async fn sftp_mkdir(id: String, path: String) -> Result<(), String> {
  tokio::task::spawn_blocking(move || {
    let mut map = SESSIONS.lock().unwrap();
    let cached = get_or_connect_cached(&mut map, &id)?;
    let guard = cached.lock().unwrap();
    let sftp = sftp2::open_sftp(&guard.sess).map_err(|e| e.to_string())?;
    sftp2::mkdir(&sftp, &path).map_err(|e| e.to_string())
  }).await.map_err(|e| e.to_string())??;
  Ok(())
}

#[tauri::command]
pub async fn sftp_rename(id: String, from: String, to: String) -> Result<(), String> {
  tokio::task::spawn_blocking(move || {
    let mut map = SESSIONS.lock().unwrap();
    let cached = get_or_connect_cached(&mut map, &id)?;
    let guard = cached.lock().unwrap();
    let sftp = sftp2::open_sftp(&guard.sess).map_err(|e| e.to_string())?;
    sftp2::rename(&sftp, &from, &to).map_err(|e| e.to_string())
  }).await.map_err(|e| e.to_string())??;
  Ok(())
}

#[tauri::command]
pub async fn sftp_remove(id: String, path: String, recursive: Option<bool>) -> Result<(), String> {
  let rec = recursive.unwrap_or(false);
  tokio::task::spawn_blocking(move || {
    let mut map = SESSIONS.lock().unwrap();
    let cached = get_or_connect_cached(&mut map, &id)?;
    let guard = cached.lock().unwrap();
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
pub async fn sftp_download_start(app: AppHandle, id: String, remote_path: String, local_path: String) -> Result<String, String> {
  let cached = {
    let mut map = SESSIONS.lock().unwrap();
    get_or_connect_cached(&mut map, &id)?
  };
  if let Some(parent) = std::path::Path::new(&local_path).parent() { if !parent.as_os_str().is_empty() { std::fs::create_dir_all(parent).map_err(|e| e.to_string())?; } }
  let transfer_id = Uuid::new_v4().to_string();
  let cancel = Arc::new(AtomicBool::new(false));
  TRANSFERS.lock().unwrap().insert(transfer_id.clone(), cancel.clone());
  let total = tokio::task::spawn_blocking({ let cached = cached.clone(); let remote_path=remote_path.clone(); move || {
    let guard = cached.lock().unwrap();
    let sftp = sftp2::open_sftp(&guard.sess)?;
    let st = sftp2::stat(&sftp, &remote_path).ok();
    Ok::<_, anyhow::Error>(st.and_then(|s| s.size))
  }}).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;
  let _ = app.emit("sftp_transfer", Some(serde_json::json!({
    "type":"started","id":transfer_id,"direction":"download","session_id":id,
    "remote_path":remote_path,"local_path":local_path,"total":total
  })));
  let app2 = app.clone();
  let transfer_id2 = transfer_id.clone();
  tokio::task::spawn_blocking(move || {
    let res: Result<(), String> = (||{
      let guard = cached.lock().unwrap();
      let sftp = sftp2::open_sftp(&guard.sess).map_err(|e| e.to_string())?;
      use std::io::{Read, Write};
      let mut rf = sftp.open(std::path::Path::new(&remote_path)).map_err(|e| e.to_string())?;
      let mut lf = std::fs::File::create(&local_path).map_err(|e| e.to_string())?;
      let mut buf = vec![0u8; 64*1024];
      let mut done: u64 = 0;
      let mut last = std::time::Instant::now();
      loop {
        if cancel.load(Ordering::Relaxed) { return Err("__CANCELLED__".into()); }
        let n = rf.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 { break; }
        lf.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        done += n as u64;
        if last.elapsed() >= Duration::from_millis(150) {
          let _ = app2.emit("sftp_transfer", Some(serde_json::json!({"type":"progress","id":transfer_id2,"direction":"download","bytes":done,"total":total})));
          last = std::time::Instant::now();
        }
      }
      let _ = lf.flush();
      Ok(())
    })();
    match res {
      Ok(()) => { let _ = app2.emit("sftp_transfer", Some(serde_json::json!({"type":"done","id":transfer_id2}))); }
      Err(e) if e == "__CANCELLED__" => {
        let _ = std::fs::remove_file(&local_path);
        let _ = app2.emit("sftp_transfer", Some(serde_json::json!({"type":"canceled","id":transfer_id2})));
      }
      Err(e) => { let _ = app2.emit("sftp_transfer", Some(serde_json::json!({"type":"error","id":transfer_id2,"message":e}))); }
    }
    TRANSFERS.lock().unwrap().remove(&transfer_id2);
  });
  Ok(transfer_id)
}

#[tauri::command]
pub async fn sftp_upload_start(app: AppHandle, id: String, local_path: String, remote_path: String) -> Result<String, String> {
  let cached = {
    let mut map = SESSIONS.lock().unwrap();
    get_or_connect_cached(&mut map, &id)?
  };
  let transfer_id = Uuid::new_v4().to_string();
  let cancel = Arc::new(AtomicBool::new(false));
  TRANSFERS.lock().unwrap().insert(transfer_id.clone(), cancel.clone());
  let total = std::fs::metadata(&local_path).ok().map(|m| m.len());
  let _ = app.emit("sftp_transfer", Some(serde_json::json!({
    "type":"started","id":transfer_id,"direction":"upload","session_id":id,
    "remote_path":remote_path,"local_path":local_path,"total":total
  })));
  let app2 = app.clone();
  let transfer_id2 = transfer_id.clone();
  tokio::task::spawn_blocking(move || {
    let res: Result<(), String> = (||{
      let guard = cached.lock().unwrap();
      let sftp = sftp2::open_sftp(&guard.sess).map_err(|e| e.to_string())?;
      use std::io::{Read, Write};
      let mut rf = std::fs::File::open(&local_path).map_err(|e| e.to_string())?;
      let mut lf = sftp.create(std::path::Path::new(&remote_path)).map_err(|e| e.to_string())?;
      let mut buf = vec![0u8; 64*1024];
      let mut done: u64 = 0;
      let mut last = std::time::Instant::now();
      loop {
        if cancel.load(Ordering::Relaxed) { return Err("__CANCELLED__".into()); }
        let n = rf.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 { break; }
        lf.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        done += n as u64;
        if last.elapsed() >= Duration::from_millis(150) {
          let _ = app2.emit("sftp_transfer", Some(serde_json::json!({"type":"progress","id":transfer_id2,"direction":"upload","bytes":done,"total":total})));
          last = std::time::Instant::now();
        }
      }
      let _ = lf.flush();
      Ok(())
    })();
    match res {
      Ok(()) => { let _ = app2.emit("sftp_transfer", Some(serde_json::json!({"type":"done","id":transfer_id2}))); }
      Err(e) if e == "__CANCELLED__" => {
        let _ = app2.emit("sftp_transfer", Some(serde_json::json!({"type":"canceled","id":transfer_id2})));
      }
      Err(e) => { let _ = app2.emit("sftp_transfer", Some(serde_json::json!({"type":"error","id":transfer_id2,"message":e}))); }
    }
    TRANSFERS.lock().unwrap().remove(&transfer_id2);
  });
  Ok(transfer_id)
}

#[tauri::command]
pub async fn sftp_cancel(_id: String, transfer_id: String) -> Result<(), String> {
  if let Some(flag) = TRANSFERS.lock().unwrap().get(&transfer_id) { flag.store(true, Ordering::Relaxed); Ok(()) } else { Err("transfer not found".into()) }
}

#[tauri::command]
pub async fn sftp_upload_dir_start(app: AppHandle, id: String, local_path: String, remote_path: String) -> Result<String, String> {
  use std::{fs, path::{Path, PathBuf}};
  let cached = {
    let mut map = SESSIONS.lock().unwrap();
    get_or_connect_cached(&mut map, &id)?
  };
  let total = tokio::task::spawn_blocking({ let local_path=local_path.clone(); move || {
    fn sum_dir(p: &Path) -> u64 { let mut s=0; if let Ok(rd) = fs::read_dir(p) { for e in rd.flatten() { let m = e.metadata(); if let Ok(m) = m { if m.is_file() { s += m.len() } else if m.is_dir() { s += sum_dir(&e.path()) } } } } s }
    let meta = fs::metadata(&local_path).map_err(|e| e.to_string())?;
    let total = if meta.is_file() { meta.len() } else { sum_dir(Path::new(&local_path)) };
    Ok::<_, String>(Some(total))
  }}).await.map_err(|e| e.to_string())??;

  let transfer_id = Uuid::new_v4().to_string();
  let cancel = Arc::new(AtomicBool::new(false));
  TRANSFERS.lock().unwrap().insert(transfer_id.clone(), cancel.clone());
  let _ = app.emit("sftp_transfer", Some(serde_json::json!({
    "type":"started","id":transfer_id,"direction":"upload","session_id":id,
    "remote_path":remote_path,"local_path":local_path,"total":total
  })));
  let app2 = app.clone();
  let transfer_id2 = transfer_id.clone();
  tokio::task::spawn_blocking(move || {
    let res: Result<(), String> = (||{
      let guard = cached.lock().unwrap();
      let sftp = sftp2::open_sftp(&guard.sess).map_err(|e| e.to_string())?;
      let base = PathBuf::from(&remote_path);
      let _ = sftp.mkdir(&base, 0o755);
      let mut done: u64 = 0;
      let mut last = std::time::Instant::now();
      let src_root = PathBuf::from(&local_path);
      let mut stack: Vec<PathBuf> = vec![src_root.clone()];
      while let Some(cur) = stack.pop() {
        if cur.is_dir() {
          let rel = cur.strip_prefix(&src_root).unwrap_or(&cur);
          let remote_dir = if rel.as_os_str().is_empty() { base.clone() } else { base.join(rel) };
          let _ = sftp.mkdir(&remote_dir, 0o755);
          if let Ok(rd) = fs::read_dir(&cur) { for e in rd.flatten() { stack.push(e.path()); } }
        } else if cur.is_file() {
          let rel = cur.strip_prefix(&src_root).unwrap_or(&cur);
          let remote_file = base.join(rel);
          if let Ok(mut rf) = fs::File::open(&cur) {
            if let Ok(mut wf) = sftp.create(&remote_file) {
              let mut buf = vec![0u8; 64*1024];
              loop {
                if cancel.load(Ordering::Relaxed) { break; }
                let n = rf.read(&mut buf).map_err(|e| e.to_string()).unwrap_or(0);
                if n==0 { break; }
                let _ = wf.write_all(&buf[..n]);
                done += n as u64;
                if last.elapsed() >= Duration::from_millis(150) {
                  let _ = app2.emit("sftp_transfer", Some(serde_json::json!({"type":"progress","id":transfer_id2,"direction":"upload","bytes":done,"total":total})));
                  last = std::time::Instant::now();
                }
              }
              let _ = wf.flush();
            }
          }
        }
      }
      if cancel.load(Ordering::Relaxed) { return Err("__CANCELLED__".into()); }
      Ok(())
    })();
    match res {
      Ok(()) => { let _ = app2.emit("sftp_transfer", Some(serde_json::json!({"type":"done","id":transfer_id2}))); }
      Err(e) if e=="__CANCELLED__" => { let _ = app2.emit("sftp_transfer", Some(serde_json::json!({"type":"canceled","id":transfer_id2}))); }
      Err(e) => { let _ = app2.emit("sftp_transfer", Some(serde_json::json!({"type":"error","id":transfer_id2,"message":e}))); }
    }
    TRANSFERS.lock().unwrap().remove(&transfer_id2);
  });
  Ok(transfer_id)
}

#[tauri::command]
pub async fn sftp_download_dir_start(app: AppHandle, id: String, remote_path: String, local_path: String) -> Result<String, String> {
  use std::{fs, path::{Path, PathBuf}};
  let cached = {
    let mut map = SESSIONS.lock().unwrap();
    get_or_connect_cached(&mut map, &id)?
  };
  if let Some(parent) = std::path::Path::new(&local_path).parent() { if !parent.as_os_str().is_empty() { std::fs::create_dir_all(parent).map_err(|e| e.to_string())?; } }
  let total = tokio::task::spawn_blocking({ let remote_path=remote_path.clone(); let cached = cached.clone(); move || {
    let guard = cached.lock().unwrap();
    let sftp = sftp2::open_sftp(&guard.sess)?;
    fn sum_remote(sftp: &sftp2::Ssh2Sftp, p: &Path) -> anyhow::Result<u64> {
      let mut s = 0u64;
      for entry in sftp.readdir(p)? { let (pb, st) = entry; if let Some(name) = pb.file_name().and_then(|s| s.to_str()) { if name=="."||name==".." { continue; } }
        if st.is_dir() { s += sum_remote(sftp, &pb)?; } else if let Some(sz)=st.size { s += sz; }
      }
      Ok(s)
    }
    let total = sum_remote(&sftp, Path::new(&remote_path)).ok();
    Ok::<_, anyhow::Error>(total)
  }}).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;

  let transfer_id = Uuid::new_v4().to_string();
  let cancel = Arc::new(AtomicBool::new(false));
  TRANSFERS.lock().unwrap().insert(transfer_id.clone(), cancel.clone());
  let _ = app.emit("sftp_transfer", Some(serde_json::json!({
    "type":"started","id":transfer_id,"direction":"download","session_id":id,
    "remote_path":remote_path,"local_path":local_path,"total":total
  })));
  let app2 = app.clone();
  let transfer_id2 = transfer_id.clone();
  tokio::task::spawn_blocking(move || {
    let res: Result<(), String> = (||{
      let guard = cached.lock().unwrap();
      let sftp = sftp2::open_sftp(&guard.sess).map_err(|e| e.to_string())?;
      let base_remote = PathBuf::from(&remote_path);
      let base_local = PathBuf::from(&local_path);
      let _ = fs::create_dir_all(&base_local);
      let mut stack: Vec<PathBuf> = vec![base_remote.clone()];
      let mut done: u64 = 0;
      let mut last = std::time::Instant::now();
      while let Some(cur) = stack.pop() {
        let rel = cur.strip_prefix(&base_remote).unwrap_or(&cur);
        let local_dir = if rel.as_os_str().is_empty() { base_local.clone() } else { base_local.join(rel) };
        let _ = fs::create_dir_all(&local_dir);
        for entry in sftp.readdir(&cur).map_err(|e| e.to_string())? {
          let (pb, st) = entry;
          if let Some(name) = pb.file_name().and_then(|s| s.to_str()) { if name=="."||name==".." { continue; } }
          if st.is_dir() {
            stack.push(pb);
          } else {
            let relf = pb.strip_prefix(&base_remote).unwrap_or(&pb);
            let local_file = base_local.join(relf);
            if let Some(parent) = local_file.parent() { let _ = fs::create_dir_all(parent); }
            let mut rf = sftp.open(&pb).map_err(|e| e.to_string())?;
            let mut lf = fs::File::create(&local_file).map_err(|e| e.to_string())?;
            let mut buf = vec![0u8; 64*1024];
            loop {
              if cancel.load(Ordering::Relaxed) { return Err("__CANCELLED__".into()); }
              let n = rf.read(&mut buf).map_err(|e| e.to_string())?;
              if n==0 { break; }
              lf.write_all(&buf[..n]).map_err(|e| e.to_string())?;
              done += n as u64;
              if last.elapsed() >= Duration::from_millis(150) {
                let _ = app2.emit("sftp_transfer", Some(serde_json::json!({"type":"progress","id":transfer_id2,"direction":"download","bytes":done,"total":total})));
                last = std::time::Instant::now();
              }
            }
            let _ = lf.flush();
          }
        }
      }
      if cancel.load(Ordering::Relaxed) { return Err("__CANCELLED__".into()); }
      Ok(())
    })();
    match res {
      Ok(()) => { let _ = app2.emit("sftp_transfer", Some(serde_json::json!({"type":"done","id":transfer_id2}))); }
      Err(e) if e=="__CANCELLED__" => { let _ = app2.emit("sftp_transfer", Some(serde_json::json!({"type":"canceled","id":transfer_id2}))); }
      Err(e) => { let _ = app2.emit("sftp_transfer", Some(serde_json::json!({"type":"error","id":transfer_id2,"message":e}))); }
    }
    TRANSFERS.lock().unwrap().remove(&transfer_id2);
  });
  Ok(transfer_id)
}
