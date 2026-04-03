use directories::UserDirs;
use std::fs;
use std::path::PathBuf;
use rfd::FileDialog;
use serde::{Deserialize, Serialize};
use tauri::Manager;

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

/// Abre el diálogo "Guardar como" del sistema y escribe el contenido en el archivo elegido.
/// Devuelve la ruta guardada o un error si el usuario cancela.
#[tauri::command]
pub async fn save_text_file(content: String, default_name: String) -> Result<String, String> {
  let path = tokio::task::spawn_blocking(move || {
    let default_dir = UserDirs::new()
      .and_then(|u| u.document_dir().map(|p| p.to_path_buf()))
      .unwrap_or_else(|| PathBuf::from("."));

    // Determine filters based on file extension
    let ext = std::path::Path::new(&default_name)
      .extension()
      .and_then(|e| e.to_str())
      .unwrap_or("")
      .to_lowercase();

    let mut dialog = FileDialog::new()
      .set_title("Guardar chat como…")
      .set_file_name(&default_name)
      .set_directory(&default_dir);

    dialog = match ext.as_str() {
      "html" => dialog
        .add_filter("HTML", &["html"])
        .add_filter("Todos los archivos", &["*"]),
      "md" => dialog
        .add_filter("Markdown", &["md"])
        .add_filter("Texto", &["txt"]),
      _ => dialog
        .add_filter("Texto", &["txt"])
        .add_filter("Todos los archivos", &["*"]),
    };

    dialog.save_file()
  })
  .await
  .map_err(|e| e.to_string())?;

  match path {
    None => Err("cancelled".to_string()),
    Some(p) => {
      fs::write(&p, content.as_bytes()).map_err(|e| e.to_string())?;
      Ok(p.to_string_lossy().to_string())
    }
  }
}

// ── Historial de chats en disco (AppData) ──

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatHistoryEntry {
  pub id: String,
  pub date: i64,
  pub preview: String,
  pub message_count: u32,
  pub messages: serde_json::Value,
}

/// Devuelve la ruta del archivo de historial para una sesión+modo.
fn history_file(app: &tauri::AppHandle, session_id: &str, mode: &str) -> Result<PathBuf, String> {
  let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
  let dir = base.join("chat-history");
  fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  // Solo mantener caracteres seguros para el nombre del archivo (@ y . permitidos para user@host)
  let safe_sid: String = session_id.chars().filter(|c| c.is_alphanumeric() || *c == '-' || *c == '@' || *c == '.').take(64).collect();
  let safe_mode: String = mode.chars().filter(|c| c.is_alphanumeric()).take(16).collect();
  Ok(dir.join(format!("{}-{}.json", safe_sid, safe_mode)))
}

/// Carga el historial de una sesión+modo desde disco.
#[tauri::command]
pub async fn chat_history_load(
  app: tauri::AppHandle,
  session_id: String,
  mode: String,
) -> Result<Vec<ChatHistoryEntry>, String> {
  let path = history_file(&app, &session_id, &mode)?;
  if !path.exists() {
    return Ok(vec![]);
  }
  let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
  let entries: Vec<ChatHistoryEntry> = serde_json::from_str(&raw).unwrap_or_default();
  Ok(entries)
}

/// Guarda (reemplaza) el historial de una sesión+modo en disco.
#[tauri::command]
pub async fn chat_history_save(
  app: tauri::AppHandle,
  session_id: String,
  mode: String,
  entries: Vec<ChatHistoryEntry>,
) -> Result<(), String> {
  let path = history_file(&app, &session_id, &mode)?;
  let json = serde_json::to_string(&entries).map_err(|e| e.to_string())?;
  fs::write(&path, json.as_bytes()).map_err(|e| e.to_string())
}

/// Elimina una entrada del historial por su ID.
#[tauri::command]
pub async fn chat_history_delete_entry(
  app: tauri::AppHandle,
  session_id: String,
  mode: String,
  entry_id: String,
) -> Result<Vec<ChatHistoryEntry>, String> {
  let path = history_file(&app, &session_id, &mode)?;
  let mut entries: Vec<ChatHistoryEntry> = if path.exists() {
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).unwrap_or_default()
  } else {
    vec![]
  };
  entries.retain(|e| e.id != entry_id);
  let json = serde_json::to_string(&entries).map_err(|e| e.to_string())?;
  fs::write(&path, json.as_bytes()).map_err(|e| e.to_string())?;
  Ok(entries)
}
