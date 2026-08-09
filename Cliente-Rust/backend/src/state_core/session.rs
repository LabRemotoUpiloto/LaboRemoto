use serde::{Deserialize, Serialize};
use std::{collections::HashMap, time::{Duration, Instant}};
use parking_lot::RwLock;
use tauri::Emitter;

const TTL_SECS: u64 = 2 * 60 * 60; // 2h

#[derive(Clone, Default, Serialize, Deserialize, Debug, PartialEq)]
pub struct SessionMem {
  pub last_file: Option<String>,
  pub last_file_hash: Option<String>,
  pub last_file_snippet: Option<String>,     // primeras ~50 líneas máx
  pub last_command: Option<String>,
  pub last_stdout_tail: Option<String>,      // últimas ~15 líneas
  pub last_stderr_tail: Option<String>,
  pub last_exit_code: Option<i32>,
  // recurso reciente (archivo o directorio)
  pub last_path: Option<String>,
  pub last_path_kind: Option<String>, // "file" | "dir"
  pub env_cwd: Option<String>,
  pub env_shell: Option<String>,
  pub env_os: Option<String>,
  pub practice_context: Option<String>,
  pub practice_tutorial: Option<String>,
  pub updated_at_ms: Option<i64>,
}

#[derive(Clone, Default, Serialize, Deserialize, Debug, PartialEq)]
pub struct SessionMemPatch {
  pub last_file: Option<String>,
  pub last_file_hash: Option<String>,
  pub last_file_snippet: Option<String>,
  pub last_command: Option<String>,
  pub last_stdout_tail: Option<String>,
  pub last_stderr_tail: Option<String>,
  pub last_exit_code: Option<i32>,
  pub last_path: Option<String>,
  pub last_path_kind: Option<String>,
  pub env_cwd: Option<String>,
  pub env_shell: Option<String>,
  pub env_os: Option<String>,
  pub practice_context: Option<String>,
  pub practice_tutorial: Option<String>,
}

pub struct AppState {
  by_session: RwLock<HashMap<String, (SessionMem, Instant)>>,
}

impl AppState {
  pub fn new() -> Self {
    Self { by_session: RwLock::new(HashMap::new()) }
  }

  fn gc_internal(map: &mut HashMap<String, (SessionMem, Instant)>) {
    map.retain(|_, (_, ts)| ts.elapsed() < Duration::from_secs(TTL_SECS));
  }

  pub fn put_patch(&self, sid: &str, p: SessionMemPatch) {
    let mut w = self.by_session.write();
    let entry = w.entry(sid.to_string())
      .or_insert_with(|| (SessionMem::default(), Instant::now()));
    let mem = &mut entry.0;
    if let Some(v) = p.last_file         { mem.last_file = Some(v) }
    if let Some(v) = p.last_file_hash    { mem.last_file_hash = Some(v) }
    if let Some(v) = p.last_file_snippet { mem.last_file_snippet = Some(v) }
    if let Some(v) = p.last_command      { mem.last_command = Some(v) }
    if let Some(v) = p.last_stdout_tail  { mem.last_stdout_tail = Some(v) }
    if let Some(v) = p.last_stderr_tail  { mem.last_stderr_tail = Some(v) }
    if let Some(v) = p.last_exit_code    { mem.last_exit_code = Some(v) }
  if let Some(v) = p.last_path         { mem.last_path = Some(v) }
  if let Some(v) = p.last_path_kind    { mem.last_path_kind = Some(v) }
    if let Some(v) = p.env_cwd           { mem.env_cwd = Some(v) }
    if let Some(v) = p.env_shell         { mem.env_shell = Some(v) }
    if let Some(v) = p.env_os            { mem.env_os = Some(v) }
    if let Some(v) = p.practice_context  { mem.practice_context = Some(v) }
    if let Some(v) = p.practice_tutorial { mem.practice_tutorial = Some(v) }
    mem.updated_at_ms = Some(chrono::Utc::now().timestamp_millis());
    // refresh TTL timestamp
    entry.1 = Instant::now();
    Self::gc_internal(&mut w);
  }

  pub fn get(&self, sid: &str) -> Option<SessionMem> {
    let r = self.by_session.read();
    r.get(sid).map(|(m,_)| m.clone())
  }

  pub fn clear(&self, sid: &str) {
    self.by_session.write().remove(sid);
  }

  pub fn gc(&self) {
    let mut w = self.by_session.write();
    Self::gc_internal(&mut w);
  }

  /// Cantidad de sesiones actualmente almacenadas (incluye potencialmente
  /// expiradas hasta el próximo `gc`). Usado por `SessionManager::gc` para
  /// calcular cuántas entradas fueron liberadas.
  pub fn len(&self) -> usize {
    self.by_session.read().len()
  }

  /// IDs de todas las sesiones actualmente almacenadas.
  pub fn list_ids(&self) -> Vec<String> {
    self.by_session.read().keys().cloned().collect()
  }
}

#[derive(Serialize, Clone, Debug)]
pub struct TerminalResultPayload {
  pub session_id: String,
  pub stdout_tail: String,
  pub stderr_tail: String,
  pub exit_code: i32,
}

#[tauri::command]
pub async fn mem_put(
  manager: tauri::State<'_, std::sync::Arc<dyn crate::session_manager::SessionManager>>,
  session_id: String,
  patch: SessionMemPatch,
) -> Result<(), String> {
  let manager = manager.inner().clone();
  manager.put_session_patch(&session_id, patch).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mem_get(
  manager: tauri::State<'_, std::sync::Arc<dyn crate::session_manager::SessionManager>>,
  session_id: String,
) -> Result<Option<SessionMem>, String> {
  let manager = manager.inner().clone();
  manager.get_session(&session_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mem_clear(
  manager: tauri::State<'_, std::sync::Arc<dyn crate::session_manager::SessionManager>>,
  session_id: String,
) -> Result<(), String> {
  let manager = manager.inner().clone();
  manager.delete_session(&session_id).await.map_err(|e| e.to_string())
}

// Opcional: permitir que el frontend empuje resultados si el backend no puede capturarlos directamente.
#[tauri::command]
pub async fn mem_push_terminal_result(
  app: tauri::AppHandle,
  manager: tauri::State<'_, std::sync::Arc<dyn crate::session_manager::SessionManager>>,
  session_id: String,
  stdout_tail: String,
  stderr_tail: String,
  exit_code: i32,
) -> Result<(), String> {
  let payload = TerminalResultPayload { session_id: session_id.clone(), stdout_tail: stdout_tail.clone(), stderr_tail: stderr_tail.clone(), exit_code };
  // Emitir a la UI (Tauri v2)
  let _ = app.emit("copilot/terminal-result", payload);
  // Persistir en memoria efímera
  let manager = manager.inner().clone();
  manager.put_session_patch(&session_id, SessionMemPatch {
    last_stdout_tail: Some(stdout_tail),
    last_stderr_tail: Some(stderr_tail),
    last_exit_code: Some(exit_code),
    ..Default::default()
  }).await.map_err(|e| e.to_string())
}
