use directories::UserDirs;
use std::fs;
use std::path::PathBuf;

use super::state::LocalEntry;

#[tauri::command]
pub async fn local_home_dir() -> Result<String, String> {
  if let Some(ud) = UserDirs::new() { Ok(ud.home_dir().to_string_lossy().to_string()) } else { Err("No se pudo resolver el home".into()) }
}

#[tauri::command]
pub async fn local_list_dir(path: String) -> Result<Vec<LocalEntry>, String> {
  let mut out: Vec<LocalEntry> = Vec::new();
  let rd = fs::read_dir(&path).map_err(|e| e.to_string())?;
  for ent in rd { let ent = ent.map_err(|e| e.to_string())?; let p: PathBuf = ent.path(); let name = ent.file_name().to_string_lossy().to_string(); let meta = fs::symlink_metadata(&p).map_err(|e| e.to_string())?; let ft = meta.file_type(); let kind = if ft.is_dir() { "dir" } else if ft.is_symlink() { "sym" } else { "file" }.to_string(); let size = if ft.is_file() { Some(meta.len()) } else { None }; let mtime = meta.modified().ok().and_then(|st| st.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as i64); out.push(LocalEntry { name, path: p.to_string_lossy().to_string(), kind, size, mtime }); }
  out.sort_by(|a,b| if a.kind!=b.kind { if a.kind=="dir" { std::cmp::Ordering::Less } else { std::cmp::Ordering::Greater } } else { a.name.to_lowercase().cmp(&b.name.to_lowercase()) });
  Ok(out)
}

#[tauri::command]
pub async fn local_list_drives() -> Result<Vec<String>, String> {
  #[cfg(target_os = "windows")]
  {
    let mut drives = Vec::new();
    for letter in b'A'..=b'Z' {
      let p = format!("{}:\\", letter as char);
      if std::path::Path::new(&p).exists() { drives.push(p); }
    }
    if drives.is_empty() { drives.push("C:\\".to_string()); }
    return Ok(drives);
  }
  #[cfg(not(target_os = "windows"))]
  {
    Ok(vec!["/".to_string()])
  }
}
