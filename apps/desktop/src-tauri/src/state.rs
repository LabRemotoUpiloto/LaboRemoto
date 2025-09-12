use serde::{Deserialize, Serialize};
use std::{collections::HashMap, time::{Duration, Instant}};
use std::{fs, path::PathBuf};
use directories::ProjectDirs;
use sha2::{Digest, Sha256};
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
    // Fast path: in-memory
    {
      let r = self.by_session.read();
      if let Some((m,_)) = r.get(sid) {
        return Some(m.clone());
      }
    }
    // Fallback: load from disk and cache
    if let Some(loaded) = persist_load(sid) {
      let mut w = self.by_session.write();
      w.insert(sid.to_string(), (loaded.clone(), Instant::now()));
      return Some(loaded);
    }
    None
  }

  pub fn clear(&self, sid: &str) {
    self.by_session.write().remove(sid);
    // Also delete persisted file
    let _ = persist_delete(sid);
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
  // Save to disk after every change
  if let Some(mem) = state.get(&session_id) {
    let _ = persist_save(&session_id, &mem);
  }
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
  // Persist tails as well
  if let Some(mem) = state.get(&session_id) {
    let _ = persist_save(&session_id, &mem);
  }
}

// ===== Persistence: save/load SessionMem to disk (JSON) per session =====

fn app_mem_dir() -> Option<PathBuf> {
  let proj = ProjectDirs::from("com", "example", "ssh-ai-client")?;
  let dir = proj.data_dir().join("mem");
  if let Err(_e) = fs::create_dir_all(&dir) {
    // ignore
  }
  Some(dir)
}

fn file_for_session(id: &str) -> Option<PathBuf> {
  let mut hasher = Sha256::new();
  hasher.update(id.as_bytes());
  let hex = hex::encode(hasher.finalize());
  let dir = app_mem_dir()?;
  Some(dir.join(format!("{}.json", &hex[..16])))
}

fn persist_save(session_id: &str, mem: &SessionMem) -> Option<()> {
  let path = file_for_session(session_id)?;
  let data = match serde_json::to_vec_pretty(mem) { Ok(v) => v, Err(_) => return None };
  let _ = fs::write(path, data);
  Some(())
}

fn persist_load(session_id: &str) -> Option<SessionMem> {
  let path = file_for_session(session_id)?;
  let data = fs::read_to_string(path).ok()?;
  serde_json::from_str(&data).ok()
}

fn persist_delete(session_id: &str) -> Option<()> {
  let path = file_for_session(session_id)?;
  let _ = fs::remove_file(path);
  Some(())
}
