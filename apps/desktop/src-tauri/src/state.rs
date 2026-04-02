use serde::{Deserialize, Serialize};
use std::{collections::HashMap, time::{Duration, Instant}};
// Nota: memoria efímera en RAM solamente; se elimina persistencia en disco
// use std::{fs, path::PathBuf};
// use directories::ProjectDirs;
// use sha2::{Digest, Sha256};
use parking_lot::RwLock;
use tauri::Emitter; // required for AppHandle::emit in Tauri v2

const TTL_SECS: u64 = 2 * 60 * 60; // 2h

#[derive(Clone, Default, Serialize, Deserialize, Debug)]
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
  pub updated_at_ms: Option<i64>,
}

#[derive(Clone, Default, Serialize, Deserialize, Debug)]
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
}

#[derive(Serialize, Clone, Debug)]
pub struct TerminalResultPayload {
  pub session_id: String,
  pub stdout_tail: String,
  pub stderr_tail: String,
  pub exit_code: i32,
}

#[tauri::command]
pub fn mem_put(state: tauri::State<AppState>, session_id: String, patch: SessionMemPatch) {
  state.put_patch(&session_id, patch);
}

#[tauri::command]
pub fn mem_get(state: tauri::State<AppState>, session_id: String) -> Option<SessionMem> {
  state.get(&session_id)
}

#[tauri::command]
pub fn mem_clear(state: tauri::State<AppState>, session_id: String) {
  state.clear(&session_id);
}

// Opcional: permitir que el frontend empuje resultados si el backend no puede capturarlos directamente.
#[tauri::command]
pub fn mem_push_terminal_result(
  app: tauri::AppHandle,
  state: tauri::State<AppState>,
  session_id: String,
  stdout_tail: String,
  stderr_tail: String,
  exit_code: i32,
) {
  let payload = TerminalResultPayload { session_id: session_id.clone(), stdout_tail: stdout_tail.clone(), stderr_tail: stderr_tail.clone(), exit_code };
  // Emitir a la UI (Tauri v2)
  let _ = app.emit("copilot/terminal-result", payload);
  // Persistir en memoria efímera
  state.put_patch(&session_id, SessionMemPatch {
    last_stdout_tail: Some(stdout_tail),
    last_stderr_tail: Some(stderr_tail),
    last_exit_code: Some(exit_code),
    ..Default::default()
  });
}

// ── Registro de cancelación para peticiones AI ──────────────────────────────
pub struct AiCancelRegistry {
  senders: parking_lot::Mutex<std::collections::HashMap<String, tokio::sync::watch::Sender<bool>>>,
}

impl AiCancelRegistry {
  pub fn new() -> Self {
    Self { senders: parking_lot::Mutex::new(std::collections::HashMap::new()) }
  }

  /// Registra un nuevo request y devuelve el receiver para escuchar cancelación.
  pub fn register(&self, id: &str) -> tokio::sync::watch::Receiver<bool> {
    let (tx, rx) = tokio::sync::watch::channel(false);
    self.senders.lock().insert(id.to_string(), tx);
    rx
  }

  /// Cancela el request con el id dado. Devuelve true si existía.
  pub fn cancel(&self, id: &str) -> bool {
    if let Some(tx) = self.senders.lock().remove(id) {
      let _ = tx.send(true);
      true
    } else {
      false
    }
  }

  /// Limpia el request del registro al terminar normalmente.
  pub fn remove(&self, id: &str) {
    self.senders.lock().remove(id);
  }
}

