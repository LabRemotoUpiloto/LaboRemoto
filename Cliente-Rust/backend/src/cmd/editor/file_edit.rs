use serde::{Serialize, Deserialize};
use std::{fs, path::{Path, PathBuf}, time::{SystemTime, UNIX_EPOCH}};
use std::time::Duration;
use sha2::{Sha256, Digest};
use crate::security::SecurityManager;
use crate::cmd::state::SESSIONS;
use crate::cmd::tools::search_shared::remote_search_ranked; // import para búsqueda remota compartida
use crate::cmd::ai::ai_utils::get_openai_api_key;
use crate::cmd::state::SessionExt;
use std::io::Read;
use chrono; // ya está en Cargo.toml
use crate::cmd::protocol::CommandError;
use crate::error::AppError;

/// Mapea un `std::io::Error` a `CommandError` categorizado explícitamente
/// (archivo no encontrado / permiso denegado / error de E/S transitorio).
fn map_io_error(e: std::io::Error, operation: &str, resource: &str) -> CommandError {
  use std::io::ErrorKind::*;
  match e.kind() {
    NotFound => CommandError::permanent("RESOURCE_NOT_FOUND", format!("Recurso no encontrado: {e}")),
    PermissionDenied => CommandError::permanent("ACCESS_DENIED", format!("Permiso denegado: {e}")),
    _ => CommandError::transient("IO_ERROR", format!("Error de E/S: {e}")),
  }
  .with_context(operation, resource)
}

const MAX_FILE_SIZE: u64 = 500 * 1024; // 500 KB
const MAX_BACKUPS: usize = 5;          // rotación
const AI_CACHE_TTL_SECS: u64 = 60 * 30; // 30 min
const AI_CACHE_MAX: usize = 256;        // máx entradas cache
const MAX_AI_EDIT_SIZE: usize = 80 * 1024; // límite práctico para envío a modelo en edición (80KB)

// Cache IA global (sha256 -> (timestamp, purpose, key_points)) usando once_cell
use once_cell::sync::Lazy;
static AI_CACHE: Lazy<std::sync::Mutex<std::collections::HashMap<String,(SystemTime,String,Vec<String>)>>> = Lazy::new(|| {
  std::sync::Mutex::new(std::collections::HashMap::new())
});

// Helper para truncar texto
fn truncate_for(text: &str, max_len: usize) -> String {
  if text.len() <= max_len {
    text.to_string()
  } else {
    format!("{}...", &text[..max_len.saturating_sub(3)])
  }
}

// (Purgar bloque legacy residual)

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FileAnalysis {
  pub path: String,
  pub language: Option<String>,
  pub line_count: usize,
  pub size_bytes: u64,
  pub sha256: String,
  pub head: String,
  pub tail: String,
  pub summary_hint: String,
  pub semantic_summary: Option<String>,
  pub purpose: Option<String>,
  pub key_points: Option<Vec<String>>,
  pub purpose_from_ai: Option<bool>,
  pub narrative: Option<String>,
  pub ai_only: Option<bool>,
  pub candidates: Option<Vec<String>>,
  pub disambiguation_required: Option<bool>,
}

fn detect_language(path: &Path, content: &str) -> Option<String> {
  if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
    let e = ext.to_lowercase();
    return Some(match e.as_str() {
      "rs" => "rust",
      "ts" => "typescript",
      "tsx" => "tsx",
      "js" => "javascript",
      "py" => "python",
      "sh" | "bash" => "bash",
      "toml" => "toml",
      "json" => "json",
      "yml" | "yaml" => "yaml",
      "md" => "markdown",
      _ => "text",
    }.to_string());
  }
  // heurística simple
  if content.contains("fn main") { return Some("rust".into()); }
  None
}

fn sha256_hex(bytes: &[u8]) -> String {
  let mut h = Sha256::new();
  h.update(bytes);
  format!("{:x}", h.finalize())
}

fn is_probably_binary(bytes: &[u8]) -> bool {
  // Heurística: presencia de byte 0 o >30% bytes no imprimibles
  if bytes.iter().any(|b| *b == 0) { return true; }
  let non_print = bytes.iter().filter(|b| {
    let c = **b; c < 0x09 || (c > 0x0d && c < 0x20)
  }).count();
  non_print as f32 / (bytes.len().max(1) as f32) > 0.30
}

fn read_file_checked(path: &Path) -> Result<Vec<u8>, CommandError> {
  let path_str = path.display().to_string();
  let meta = fs::metadata(path).map_err(|e| map_io_error(e, "read_file_checked", &path_str))?;
  if !meta.is_file() {
    return Err(CommandError::permanent("VALIDATION_FAILED", "No es un archivo regular").with_context("read_file_checked", &path_str));
  }
  if meta.len() > MAX_FILE_SIZE {
    return Err(CommandError::permanent("VALIDATION_FAILED", format!("Archivo excede límite {} bytes", MAX_FILE_SIZE)).with_context("read_file_checked", &path_str));
  }
  let mut f = fs::File::open(path).map_err(|e| map_io_error(e, "read_file_checked", &path_str))?;
  let mut buf = Vec::with_capacity(meta.len() as usize + 1);
  f.read_to_end(&mut buf).map_err(|e| map_io_error(e, "read_file_checked", &path_str))?;
  if is_probably_binary(&buf) {
    return Err(CommandError::permanent("VALIDATION_FAILED", "Archivo parece binario, se rechaza").with_context("read_file_checked", &path_str));
  }
  Ok(buf)
}

fn backup_path_for(path: &Path) -> Result<PathBuf, CommandError> {
  let ts = SystemTime::now().duration_since(UNIX_EPOCH)
    .map_err(|e| CommandError::internal("CLOCK_ERROR", e.to_string()))?
    .as_secs();
  let mut p = path.to_path_buf();
  let file_name = p.file_name().and_then(|s| s.to_str())
    .ok_or_else(|| CommandError::permanent("VALIDATION_FAILED", "Nombre de archivo inválido"))?;
  let backup_name = format!("{}.bak.{}", file_name, ts);
  p.set_file_name(backup_name);
  Ok(p)
}

fn rotate_backups(path: &Path) {
  let backups = list_backups_internal(path);
  if backups.len() > MAX_BACKUPS {
    for old in backups.iter().skip(MAX_BACKUPS) { let _ = fs::remove_file(old); }
  }
}

fn unified_diff(old: &str, new: &str) -> String {
  let old_lines: Vec<&str> = old.lines().collect();
  let new_lines: Vec<&str> = new.lines().collect();
  let mut out = String::new(); out.push_str("--- original\n+++ propuesto\n");
  let max = old_lines.len().max(new_lines.len());
  for i in 0..max {
    let o = old_lines.get(i).copied(); let n = new_lines.get(i).copied();
    match (o,n) {
      (Some(a), Some(b)) if a==b => {},
      (Some(a), Some(b)) => { out.push_str(&format!("-{}\n+{}\n", a,b)); },
      (Some(a), None) => out.push_str(&format!("-{}\n", a)),
      (None, Some(b)) => out.push_str(&format!("+{}\n", b)),
      _=>{}
    }
  }
  out
}

// Utilidad SFTP (lectura/escritura) reintroducida
fn get_sftp_for_session(session_id: &str) -> Result<ssh2::Sftp, CommandError> {
  use crate::ssh_core::ssh2_sftp as sftp2; use std::sync::{Arc, Mutex}; use crate::cmd::state::CachedSsh2;
  fn get_or_connect_cached(map: &mut std::collections::HashMap<String, SessionExt>, id: &str) -> Result<Arc<Mutex<CachedSsh2>>, CommandError> {
    if let Some(existing) = map.get(id).and_then(|s| s.sftp_cached.clone()) { return Ok(existing); }
    let (host, port, user, password) = { let s = map.get(id).ok_or_else(|| CommandError::from(AppError::NotFoundSession))?; (s.host.clone(), s.port, s.user.clone(), s.password.clone()) };
    let (tcp, sess) = sftp2::connect_password(&host, port, &user, &password)
      .map_err(|e| CommandError::transient("IO_ERROR", format!("Conexión SFTP falló: {e}")).with_context("get_sftp_for_session", id))?;
    let arc = Arc::new(Mutex::new(CachedSsh2 { tcp, sess })); if let Some(s) = map.get_mut(id) { s.sftp_cached = Some(arc.clone()); } Ok(arc)
  }
  let mut map = SESSIONS.lock().map_err(|_| CommandError::internal("LOCK_POISONED", "SESSIONS lock poisoned"))?;
  let cached = get_or_connect_cached(&mut map, session_id)?;
  let guard = cached.lock().map_err(|_| CommandError::internal("LOCK_POISONED", "ssh2 lock poisoned"))?;
  crate::ssh_core::ssh2_sftp::open_sftp(&guard.sess)
    .map_err(|e| CommandError::transient("IO_ERROR", format!("Abrir SFTP falló: {e}")).with_context("get_sftp_for_session", session_id))
}

fn list_backups_internal(path: &Path) -> Vec<PathBuf> {
  let parent = match path.parent() { Some(p) => p, None => return vec![] };
  let stem = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
  let prefix = format!("{}.", stem);
  let mut v: Vec<PathBuf> = fs::read_dir(parent).ok()
    .into_iter().flatten()
    .filter_map(|e| e.ok())
    .map(|e| e.path())
    .filter(|p| p.file_name().and_then(|s| s.to_str()).map(|n| n.starts_with(&prefix) && n.contains(".bak.")).unwrap_or(false))
    .collect();
  v.sort();
  v.reverse(); // más recientes primero
  v
}

fn remote_backup_and_write(sftp: &ssh2::Sftp, path: &str, new_content: &str) -> Result<Option<String>, CommandError> {
  use std::io::Write;
  let p = std::path::Path::new(path);
  // Crear backup si existe
  let backup_path = if let Ok(stat) = sftp.stat(p) {
    if stat.is_file() {
      let ts = SystemTime::now().duration_since(UNIX_EPOCH)
        .map_err(|e| CommandError::internal("CLOCK_ERROR", e.to_string()))?
        .as_secs();
      let parent = p.parent().ok_or_else(|| CommandError::permanent("VALIDATION_FAILED", "Ruta remota sin directorio padre"))?;
      let file_name = p.file_name().and_then(|s| s.to_str())
        .ok_or_else(|| CommandError::permanent("VALIDATION_FAILED", "Nombre de archivo remoto inválido"))?;
      let backup_name = format!("{}.bak.{}", file_name, ts);
      let backup_abs = parent.join(&backup_name);
      let backup_abs_str = backup_abs.to_str()
        .ok_or_else(|| CommandError::permanent("VALIDATION_FAILED", "Ruta de backup remota no es UTF-8"))?;
      crate::ssh_core::ssh2_sftp::rename(sftp, path, backup_abs_str)
        .map_err(|e| CommandError::transient("IO_ERROR", format!("Rename remoto falló: {e}")).with_context("remote_backup_and_write", path))?;
      Some(backup_abs.to_string_lossy().to_string())
    } else { None }
  } else { None };
  // Escribir nuevo
  let mut f = sftp.create(p)
    .map_err(|e| CommandError::transient("IO_ERROR", format!("create remoto falló: {e}")).with_context("remote_backup_and_write", path))?;
  f.write_all(new_content.as_bytes())
    .map_err(|e| CommandError::transient("IO_ERROR", format!("write remoto falló: {e}")).with_context("remote_backup_and_write", path))?;
  f.flush().ok();
  Ok(backup_path)
}

// --- Comando ai_remote_edit_file ---
#[tauri::command]
pub async fn ai_remote_edit_file(req: AiRemoteEditRequest) -> Result<AiRemoteEditResponse, CommandError> {
  let _sec = SecurityManager::new();
  if req.session_id.trim().is_empty() { return Err(CommandError::permanent("VALIDATION_FAILED", "session_id requerido")); }
  if req.instruction.trim().is_empty() { return Err(CommandError::permanent("VALIDATION_FAILED", "instruction vacío")); }
  if req.instruction.len() > 2000 { return Err(CommandError::permanent("VALIDATION_FAILED", "instruction demasiado largo (>2000)")); }
  let sid = req.session_id.clone(); let path = req.path.clone();
  let bytes = tokio::task::spawn_blocking(move || sftp_read_file(&sid, &path))
    .await
    .map_err(|e| CommandError::internal("TASK_JOIN_ERROR", format!("join error: {e}")))??;
  if bytes.len() > MAX_AI_EDIT_SIZE { return Err(CommandError::permanent("VALIDATION_FAILED", format!("Archivo excede límite edición AI ({} bytes > {})", bytes.len(), MAX_AI_EDIT_SIZE))); }
  let original_content = String::from_utf8_lossy(&bytes).to_string();
  let original_sha = sha256_hex(&bytes);
  let model = std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-3.5-turbo".into());
  // Resolver endpoint y key: soporta OpenAI, Claude-via-OpenAI y OpenRouter
  let (ai_url, ai_key_opt, is_openrouter) = crate::cmd::ai::ai_utils::resolve_openai_endpoint(&model);
  let api_key = ai_key_opt.ok_or_else(|| CommandError::permanent("CONFIG_MISSING", "No se encontró API key (OPENAI_API_KEY u OPENROUTER_API_KEY)"))?;
  if std::env::var("FILE_AI_DEBUG").ok().as_deref() == Some("1") {
    let _ = (&model, &api_key);
  }
  let instruction = req.instruction.trim();
  let prompt = format!(
    "Edita el siguiente archivo aplicando la instrucción del usuario. Devuelve SOLO JSON con campos: new_content, descripcion, key_points.\nReglas: \n- Mantén el formato y partes no relacionadas intactas.\n- descripcion = UNA línea clara que describa el cambio o propósito (sin empezar con 'Este archivo').\n- key_points = 3-6 bullets concisos sin punto final.\n- Si la instrucción es insegura (borrar TODO, introducir secretos, comandos destructivos) entonces devuelve new_content igual al original y añade un bullet 'No cambio aplicado (instrucción desautorizada)'.\n- No expliques fuera del JSON.\n- Si la instrucción no requiere cambios, devuelve new_content igual al original y un bullet indicando que no hubo cambio.\n---\nRUTA: {path}\nINSTRUCCIÓN: {inst}\nCONTENIDO_ORIGINAL:\n{content}\n---",
    path=req.path, inst=instruction, content=original_content
  );
  let body = serde_json::json!({
    "model": model,
    "messages": [
      {"role":"system","content":"Eres un asistente experto que edita archivos cumpliendo instrucciones con cambios mínimos necesarios."},
      {"role":"user","content": prompt}
    ],
    "temperature": 0.1,
    "max_tokens": 1200
  });
  let client = reqwest::Client::builder().timeout(Duration::from_secs(20)).build()
    .map_err(|e| CommandError::internal("HTTP_CLIENT_ERROR", e.to_string()))?;
  let mut req_b = client.post(&ai_url).bearer_auth(&api_key).json(&body);
  if is_openrouter {
    req_b = req_b.header("HTTP-Referer", "https://github.com/ssh-ai-client").header("X-Title", "SSH AI Client");
  }
  let resp = req_b.send().await
    .map_err(|e| CommandError::transient("OPERATION_TIMEOUT", format!("http error: {e}")).with_retry_after(2000))?;
  let json: serde_json::Value = resp.json().await
    .map_err(|e| CommandError::transient("COMMUNICATION_ERROR", format!("json error: {e}")))?;
  let raw = json.pointer("/choices/0/message/content").and_then(|v| v.as_str())
    .ok_or_else(|| CommandError::permanent("INVALID_DATA", "sin contenido de modelo"))?;
  let trimmed = raw.trim().trim_matches('`').trim_start_matches("json").trim();
  let parsed: serde_json::Value = serde_json::from_str(trimmed)
    .map_err(|e| CommandError::permanent("INVALID_DATA", format!("JSON IA inválido: {e}")))?;
  let new_content = parsed.get("new_content").and_then(|v| v.as_str())
    .ok_or_else(|| CommandError::permanent("INVALID_DATA", "new_content faltante"))?.to_string();
  // Nuevo campo descripcion (preferido). Si no viene, usar purpose legacy si existe.
  let descripcion = parsed.get("descripcion").and_then(|v| v.as_str()).map(|s| s.to_string());
  let purpose_legacy = parsed.get("purpose").and_then(|v| v.as_str()).map(|s| s.to_string());
  let purpose = descripcion.clone().or(purpose_legacy.clone());
  let key_points = parsed.get("key_points").and_then(|v| v.as_array()).map(|arr| arr.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).take(6).collect::<Vec<_>>() );
  let refused = key_points.as_ref().map(|kps| kps.iter().any(|k| k.contains("No cambio aplicado"))).unwrap_or(false);
  let new_sha = sha256_hex(new_content.as_bytes());
  let diff = unified_diff(&original_content, &new_content);
  let mut backup_path = None; let mut applied = false;
  if req.apply && !refused && new_content != original_content {
    let sid2 = req.session_id.clone(); let path2 = req.path.clone(); let nc = new_content.clone();
    backup_path = tokio::task::spawn_blocking(move || {
      let sftp = get_sftp_for_session(&sid2)?;
      remote_backup_and_write(&sftp, &path2, &nc)
    }).await.map_err(|e| CommandError::internal("TASK_JOIN_ERROR", format!("join write error: {e}")))??;
    applied = true;
  }
  Ok(AiRemoteEditResponse { original_sha, new_sha, original_size: original_content.len(), new_size: new_content.len(), diff, new_content, applied, backup_path, purpose, key_points, model_used: Some(model), refused, descripcion })
}

#[tauri::command]
pub fn analyze_file(path: String) -> Result<AnalyzeFileResponse, CommandError> {
  // Unificamos lógica: delegar a analyze_any_file sin session_id (D)
  tauri::async_runtime::block_on(analyze_any_file(None, path, None))
}

fn sftp_read_file(session_id: &str, remote_path: &str) -> Result<Vec<u8>, CommandError> {
  use crate::ssh_core::ssh2_sftp as sftp2;
  use std::sync::{Arc, Mutex};
  use crate::cmd::state::CachedSsh2;
  // Reutilizar lógica de conexión de sftp.rs (simplificada aquí)
  fn get_or_connect_cached(map: &mut std::collections::HashMap<String, SessionExt>, id: &str) -> Result<Arc<Mutex<CachedSsh2>>, CommandError> {
    if let Some(existing) = map.get(id).and_then(|s| s.sftp_cached.clone()) { return Ok(existing); }
    let (host, port, user, password) = {
      let s = map.get(id).ok_or_else(|| CommandError::from(AppError::NotFoundSession))?;
      (s.host.clone(), s.port, s.user.clone(), s.password.clone())
    };
    let (tcp, sess) = sftp2::connect_password(&host, port, &user, &password)
      .map_err(|e| CommandError::transient("IO_ERROR", format!("Conexión SFTP falló: {e}")).with_context("sftp_read_file", id))?;
    let arc = Arc::new(Mutex::new(CachedSsh2 { tcp, sess }));
    if let Some(s) = map.get_mut(id) { s.sftp_cached = Some(arc.clone()); }
    Ok(arc)
  }
  let mut map = SESSIONS.lock().map_err(|_| CommandError::internal("LOCK_POISONED", "SESSIONS lock poisoned"))?;
  let cached = get_or_connect_cached(&mut map, session_id)?;
  let guard = cached.lock().map_err(|_| CommandError::internal("LOCK_POISONED", "ssh2 lock poisoned"))?;
  let sftp = sftp2::open_sftp(&guard.sess)
    .map_err(|e| CommandError::transient("IO_ERROR", format!("Abrir SFTP falló: {e}")).with_context("sftp_read_file", session_id))?;
  let path = std::path::Path::new(remote_path);
  let mut f = sftp.open(path).map_err(|e| {
    CommandError::permanent("RESOURCE_NOT_FOUND", format!("No se pudo abrir archivo remoto: {e}"))
      .with_context("sftp_read_file", remote_path)
  })?;
  let mut buf = Vec::new();
  use std::io::Read as _;
  f.read_to_end(&mut buf)
    .map_err(|e| CommandError::transient("IO_ERROR", format!("Lectura SFTP falló: {e}")).with_context("sftp_read_file", remote_path))?;
  Ok(buf)
}

/// Analiza un archivo remoto o local. Acepta `session_id` (snake) y alias `sessionId` (camel) para compatibilidad frontend.
#[tauri::command]
#[allow(non_snake_case)] // permitimos alias camelCase proveniente de bundles antiguos
pub async fn analyze_any_file(session_id: Option<String>, path: String, sessionId: Option<String>) -> Result<AnalyzeFileResponse, CommandError> {
  let _sec = SecurityManager::new();
  // Cargar .env temprano (asegura OPENAI_API_KEY disponible para lógica de activación)
  let _ = dotenvy::dotenv();
  let original_input = path.clone();
  // Aceptar tanto session_id (snake) como sessionId (camel) para robustez
  let effective_session = session_id.clone().filter(|s| !s.is_empty()).or(sessionId.clone()).filter(|s| !s.is_empty());
  let effective_session = if effective_session.is_none() {
    // fallback: si hay exactamente una sesión activa, usarla implícitamente
    if let Ok(map) = SESSIONS.lock() { if map.len()==1 { map.keys().next().cloned() } else { None } }
    else { None }
  } else { effective_session };
  if std::env::var("FILE_AI_DEBUG").ok().as_deref() == Some("1") {
    let _ = (&path, &session_id, &sessionId, &effective_session);
  }
  let mut reasons: Vec<String> = Vec::new();
  let mut bytes_opt: Option<Vec<u8>> = None;
  let ai_only_mode = std::env::var("FILE_ANALYSIS_AI_ONLY").ok().as_deref() == Some("1");

  async fn try_remote(sid: &str, p: &str) -> Option<Vec<u8>> { use std::time::Duration; let sid_s=sid.to_string(); let p_s=p.to_string(); let join=tauri::async_runtime::spawn_blocking(move || sftp_read_file(&sid_s,&p_s)); match tokio::time::timeout(Duration::from_secs(6), join).await { Ok(Ok(Ok(b)))=>Some(b), _=>None } }

  // Intento directo absoluto
  if PathBuf::from(&path).is_absolute() { if let Some(sid)=&effective_session { if let Some(b)=try_remote(sid,&path).await { bytes_opt=Some(b); } } }

  // Búsqueda remota multi-match usando módulo compartido
  if bytes_opt.is_none() && !path.contains('/') && effective_session.as_ref().map(|s| !s.is_empty()).unwrap_or(false) {
    if let Some(sid)=&effective_session { let limit=std::env::var("FILE_ANALYSIS_MAX_CANDIDATES").ok().and_then(|v| v.parse().ok()).unwrap_or(8); match remote_search_ranked(sid,&path,limit){
      Ok(list) if list.is_empty() => reasons.push("Búsqueda remota sin coincidencias".into()),
      Ok(list) if list.len()==1 => { let p_abs=&list[0].path; if let Some(b)=try_remote(sid,p_abs).await { bytes_opt=Some(b); reasons.push(format!("Única coincidencia: {}",p_abs)); } else { reasons.push("Lectura coincidencia única falló".into()); }},
      Ok(list) => { let candidates: Vec<String>=list.into_iter().map(|m| m.path).collect(); let analysis=FileAnalysis{ path: original_input.clone(), language:None,line_count:0,size_bytes:0,sha256:String::new(),head:String::new(),tail:String::new(),summary_hint:format!("{} coincidencias",candidates.len()),semantic_summary:None,purpose:None,key_points:None,purpose_from_ai:None,narrative:Some("Nombre ambiguo: selecciona la ruta exacta para continuar".into()),ai_only:Some(ai_only_mode),candidates:Some(candidates),disambiguation_required:Some(true)}; return Ok(AnalyzeFileResponse{analysis}); },
      Err(e)=>reasons.push(format!("Error búsqueda remota: {e}")) }
    }
  }

  // Expansión ~
  if bytes_opt.is_none() && path.starts_with("~/") { if let Some(sid)=&effective_session { if let Some(home)=SESSIONS.lock().ok().and_then(|m| m.get(sid).map(|s| if s.user=="root" { "/root".to_string() } else { format!("/home/{}", s.user) })) { let expanded=format!("{}{}", home,&path[1..]); if let Some(b)=try_remote(sid,&expanded).await { bytes_opt=Some(b); } } } }

  // Intento directo final
  if bytes_opt.is_none() { if let Some(sid)=&effective_session { if let Some(b)=try_remote(sid,&path).await { bytes_opt=Some(b); } } }

  if effective_session.is_none() { reasons.push("Sin session_id efectivo (no se suministró session_id/sessionId)".into()); }
  let bytes = bytes_opt.ok_or_else(|| {
    CommandError::permanent(
      "RESOURCE_NOT_FOUND",
      format!("No se pudo leer el archivo: {} => intentos: {}", original_input, reasons.join(" | ")),
    )
    .with_context("analyze_any_file", &original_input)
  })?;
  if bytes.len() as u64 > MAX_FILE_SIZE { return Err(CommandError::permanent("VALIDATION_FAILED", format!("Archivo excede límite {} bytes", MAX_FILE_SIZE))); }
  if is_probably_binary(&bytes) { return Err(CommandError::permanent("VALIDATION_FAILED", "Archivo parece binario, se rechaza")); }

  let content = String::from_utf8_lossy(&bytes);
  let line_count = content.lines().count();
  let head = if ai_only_mode { String::new() } else { content.lines().take(15).collect::<Vec<_>>().join("\n") };
  let tail = if ai_only_mode { String::new() } else { content.lines().rev().take(15).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n") };
  let summary_hint = if ai_only_mode { String::new() } else { format!("{} líneas", line_count) };

  // Carga .env temprana para garantizar lectura de API keys
  use crate::cmd::ai::ai_utils::get_claude_api_key;
  if get_openai_api_key().is_none() && get_claude_api_key().is_none() { let _ = dotenvy::dotenv(); }
  
  // Determinar si usaremos IA; FORCE_FILE_AI fuerza el intento.
  let env_flag = std::env::var("ENABLE_FILE_AI_SUMMARY").ok();
  let force_flag = std::env::var("FORCE_FILE_AI").ok().map(|v| matches!(v.as_str(), "1"|"true"|"TRUE"));
  // Preferir Claude, fallback a OpenAI
  let has_claude = get_claude_api_key().is_some();
  let has_openai = get_openai_api_key().is_some();
  let has_key = has_claude || has_openai;
  
  let file_ai_debug = std::env::var("FILE_AI_DEBUG").ok().map(|v| v=="1" || v.eq_ignore_ascii_case("true")).unwrap_or(false);
  let enable_ai_summary = force_flag.unwrap_or_else(|| env_flag.as_deref() == Some("1") || env_flag.as_deref().map(|v| v.eq_ignore_ascii_case("true")).unwrap_or(false));
  let mut semantic_summary: Option<String> = None; // anulamos heurística cuando AI activa
  let language_detected = detect_language(Path::new(&path), &content);
  if !enable_ai_summary && !ai_only_mode { // sólo usar heurística si AI summary desactivada
    let lang = language_detected.clone().unwrap_or_else(|| "texto".into());
    let def_funcs = content.matches("def ").count();
    let fn_funcs = content.matches("fn ").count();
    let classes = content.matches("class ").count();
    let imports = content.lines().filter(|l| l.trim_start().starts_with("use ") || l.trim_start().starts_with("import ") || l.trim_start().starts_with("from ")).count();
    let mut clauses: Vec<String> = Vec::new();
    if def_funcs + fn_funcs > 0 { clauses.push(format!("define {} función{}", def_funcs+fn_funcs, if def_funcs+fn_funcs==1 { "" } else { "es" })); }
    if classes > 0 { clauses.push(format!("contiene {} clase{}", classes, if classes==1 { "" } else { "s" })); }
    if imports > 0 { clauses.push(format!("usa {} importación{}", imports, if imports==1 { "" } else { "es" })); }
    let baseline_subject = if lang == "bash" { "Este script Bash" } else if lang == "python" { "Este archivo Python" } else { "Este archivo" };
    if clauses.is_empty() { semantic_summary = Some(format!("{} contiene {} líneas", baseline_subject, line_count)); } else {
      let mut seen=std::collections::HashSet::new(); let mut filtered=Vec::new();
      for c in clauses { if seen.insert(c.clone()) { filtered.push(c); } }
      let joined = if filtered.len()==1 { filtered[0].clone() } else { let last=filtered.pop().unwrap(); format!("{} y {}", filtered.join(", "), last) };
      semantic_summary = Some(format!("{} {}.", baseline_subject, joined));
    }
  }

  // AI summary opcional + cache (reestructurado)
  let mut purpose_ai: Option<String> = None;
  let mut key_points_ai: Option<Vec<String>> = None;
  let sha_cur = sha256_hex(&bytes);
  
  if enable_ai_summary && has_key && bytes.len() < 200_000 {
    if file_ai_debug { let _ = &sha_cur; }
    let mut need_call = true;
    
    if let Ok(mut map) = AI_CACHE.lock() {
      if let Some((ts,p,kps)) = map.get(&sha_cur) {
        if ts.elapsed().unwrap_or_default() < Duration::from_secs(AI_CACHE_TTL_SECS) {
          purpose_ai = Some(p.clone());
          key_points_ai = Some(kps.clone());
          need_call = false;
          if file_ai_debug { let _ = map.len(); }
        } else { 
          map.remove(&sha_cur); 
        }
      } else {
      }
    }
    
    if need_call {
      // Primero intentar con Claude, si no está disponible usar OpenAI
      let use_claude = get_claude_api_key().is_some();
      
      let api_key = if use_claude {
        get_claude_api_key().unwrap()
      } else {
        get_openai_api_key().unwrap_or_default()
      };
      
      if !api_key.is_empty() {
        if let Ok(client) = reqwest::Client::builder().timeout(Duration::from_secs(30)).build() {
          let sample = if bytes.len()>40_000 { let h=content.lines().take(120).collect::<Vec<_>>().join("\n"); let t=content.lines().rev().take(120).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n"); format!("[HEAD]\n{}\n[...OMITIDO...]\n[TAIL]\n{}",h,t) } else { content.to_string() };
          let prompt = format!(
            "Analiza el siguiente código y devuelve SOLO un objeto JSON con esta estructura exacta:\n\
            {{\n\
              \"proposito\": \"Descripción clara del propósito principal del programa (2-3 líneas)\",\n\
              \"ejemplo_ejecucion\": [\n\
                \"Cómo ejecutar el programa (comando exacto)\",\n\
                \"Descripción de entradas esperadas\",\n\
                \"Descripción de salidas generadas\",\n\
                \"Ejemplo práctico de uso\"\n\
              ],\n\
              \"mejoras\": [\n\
                \"Mejora 1: descripción detallada\",\n\
                \"Mejora 2: descripción detallada\",\n\
                \"Mejora 3: descripción detallada\"\n\
              ],\n\
              \"conclusiones\": [\n\
                \"Conclusión 1 sobre el código\",\n\
                \"Conclusión 2 sobre el código\"\n\
              ]\n\
            }}\n\n\
            REGLAS ESTRICTAS:\n\
            - Devuelve SOLO el JSON, sin texto adicional\n\
            - Cada array debe tener al menos 2-4 elementos\n\
            - Sé específico y práctico\n\
            - Usa español\n\
            - NO uses markdown dentro del JSON\n\n\
            Archivo: {path}\n\
            Tamaño: {size} bytes\n\n\
            CÓDIGO:\n{c}\n",
            path=path, size=bytes.len(), c=sample
          );
          
          let (url, request_body) = if use_claude {
            // Claude API
            let body = serde_json::json!({
              "model": std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "claude-sonnet-4-5".into()),
              "max_tokens": 1200,
              "messages": [{"role": "user", "content": prompt}]
            });
            let url = "https://api.anthropic.com/v1/messages";
            (url, body)
          } else {
            // OpenAI API
            let body = serde_json::json!({
              "model": std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-3.5-turbo".into()),
              "messages": [
                {"role": "system", "content": "Eres un asistente experto que analiza código en español."},
                {"role": "user", "content": prompt}
              ],
              "temperature": 0.15,
              "max_tokens": 1200
            });
            let url = "https://api.openai.com/v1/chat/completions";
            (url, body)
          };
          
          let mut request = client.post(url).json(&request_body);
          
          // Agregar headers específicos según el proveedor
          if use_claude {
            request = request
              .header("anthropic-version", "2023-06-01")
              .header("x-api-key", &api_key);
          } else {
            request = request
              .header("authorization", format!("Bearer {}", api_key));
          }
          
          match request.send().await {    
            Ok(resp) => {
              let status = resp.status();
              let text_body = resp.text().await.unwrap_or_default();
              
              // Si status no es éxito, registrar y generar fallback inmediato
              if !status.is_success() {
                if file_ai_debug { let _ = status; }
                if let Ok(err_v) = serde_json::from_str::<serde_json::Value>(&text_body) {
                  if let Some(msg) = err_v.pointer("/error/message").and_then(|v| v.as_str()) { purpose_ai = Some(format!("(IA) Error API: {}", truncate_for(msg, 140))); }
                  else { purpose_ai = Some(format!("(IA) Error HTTP {} sin mensaje", status)); }
                } else { purpose_ai = Some(format!("(IA) Error HTTP {}", status)); }
                if status.as_u16() == 401 { key_points_ai = Some(vec!["API key inválida o expirada".into()]); }
                else if status.as_u16() == 429 { key_points_ai = Some(vec!["Rate limit alcanzado".into()]); }
                else { key_points_ai.get_or_insert(Vec::new()).push("Fallo al obtener resumen".into()); }
                if file_ai_debug { let _ = &text_body; }
                // No parse normal en error
              } else {
                let json: serde_json::Value = serde_json::from_str(&text_body).unwrap_or(serde_json::Value::Null);
                if file_ai_debug { let _ = &text_body; }                
                // Extraer contenido - manejar tanto OpenAI como Claude
                let mut extracted: Option<String>;
                
                if use_claude {
                  // Claude: content está en /content/0/text
                  extracted = json.pointer("/content/0/text").and_then(|v| v.as_str()).map(|s| s.to_string());
                  if extracted.is_none() {
                    // Intentar otros formatos posibles de Claude
                    extracted = json.pointer("/content").and_then(|v| {
                      if let Some(arr) = v.as_array() {
                        arr.iter()
                          .find_map(|item| item.get("text").and_then(|t| t.as_str()))
                          .map(|s| s.to_string())
                      } else {
                        v.as_str().map(|s| s.to_string())
                      }
                    });
                  }
                } else {
                  // OpenAI: content está en /choices/0/message/content
                  extracted = json.pointer("/choices/0/message/content").and_then(|v| v.as_str()).map(|s| s.to_string());
                  if extracted.is_none() { extracted = json.pointer("/choices/0/text").and_then(|v| v.as_str()).map(|s| s.to_string()); }
                  if extracted.is_none() { if let Some(arr)=json.pointer("/choices/0/message/content").and_then(|v| v.as_array()) { let mut acc=String::new(); for part in arr { if let Some(t)=part.get("text").and_then(|x| x.as_str()) { acc.push_str(t); acc.push('\n'); } } if !acc.trim().is_empty() { extracted=Some(acc); } } }
                }
                
                if let Some(text)=extracted {
                  if file_ai_debug { let _ = &text; }
                  let trimmed=text.trim().trim_matches('`').trim_start_matches("json").trim();
                  
                  // Intentar parsear como JSON primero
                  let mut parsed_successfully = false;
                  if let Ok(vj)=serde_json::from_str::<serde_json::Value>(trimmed) {
                    if file_ai_debug { let _ = &vj; }
                    parsed_successfully = true;
                    
                    // Extraer el nuevo formato con proposito, ejemplo_ejecucion, mejoras, conclusiones
                    if let Some(p)=vj.get("proposito").and_then(|x| x.as_str()) { 
                      purpose_ai=Some(p.to_string()); 
                    }
                    
                    // Construir key_points con todos los campos
                    let mut combined_points = Vec::new();
                    
                    // Ejemplo de ejecución
                    if let Some(arr)=vj.get("ejemplo_ejecucion").and_then(|x| x.as_array()) {
                      if !arr.is_empty() {
                        combined_points.push("▶ EJEMPLO DE EJECUCIÓN:".to_string());
                        for item in arr.iter() {
                          if let Some(s)=item.as_str() {
                            combined_points.push(format!("  • {}", s));
                          }
                        }
                      }
                    }
                    
                    // Mejoras
                    if let Some(arr)=vj.get("mejoras").and_then(|x| x.as_array()) {
                      if !arr.is_empty() {
                        combined_points.push("🔧 POSIBLES MEJORAS:".to_string());
                        for item in arr.iter() {
                          if let Some(s)=item.as_str() {
                            combined_points.push(format!("  • {}", s));
                          }
                        }
                      }
                    }
                    
                    // Conclusiones
                    if let Some(arr)=vj.get("conclusiones").and_then(|x| x.as_array()) {
                      if !arr.is_empty() {
                        combined_points.push("📊 CONCLUSIONES:".to_string());
                        for item in arr.iter() {
                          if let Some(s)=item.as_str() {
                            combined_points.push(format!("  • {}", s));
                          }
                        }
                      }
                    }
                    
                    if !combined_points.is_empty() {
                      key_points_ai=Some(combined_points);
                    }
                    
                    // Fallback: si no tiene el nuevo formato, intentar el formato antiguo
                    if purpose_ai.is_none() {
                      if let Some(p)=vj.get("descripcion").and_then(|x| x.as_str()) { 
                        purpose_ai=Some(p.to_string()); 
                      }
                    }
                    if key_points_ai.is_none() {
                      if let Some(kpa)=vj.get("key_points").and_then(|x| x.as_array()) { 
                        let mut vkp=Vec::new(); 
                        for item in kpa.iter().take(6) { 
                          if let Some(s)=item.as_str() { 
                            vkp.push(s.to_string()); 
                          } 
                        } 
                        if !vkp.is_empty() { 
                          key_points_ai=Some(vkp); 
                        } 
                      }
                    }
                  }
                  
                  // Si no se pudo parsear como JSON, usar el texto completo como respuesta
                  if !parsed_successfully {
                    if file_ai_debug { let _ = &text; }
                    
                    // Dividir el texto en líneas y usar como purpose y key_points
                    let lines: Vec<&str> = text.lines().collect();
                    if !lines.is_empty() {
                      purpose_ai = Some(lines[0].to_string());
                      if lines.len() > 1 {
                        key_points_ai = Some(lines[1..].iter().map(|s| s.to_string()).collect());
                      }
                    } else {
                      purpose_ai = Some(text.clone());
                    }
                  }
                } else if file_ai_debug { let _ = extracted; }
              }
            },
            Err(e) => { 
              
              // Si Claude falló y tenemos OpenAI disponible, intentar con OpenAI como fallback
              if use_claude && get_openai_api_key().is_some() {
                
                let openai_key = get_openai_api_key().unwrap_or_default();
                let openai_body = serde_json::json!({
                  "model": "gpt-3.5-turbo",
                  "messages": [
                    {"role": "system", "content": "Eres un asistente experto que analiza código en español."},
                    {"role": "user", "content": &prompt}
                  ],
                  "temperature": 0.15,
                  "max_tokens": 1200
                });
                
                match client.post("https://api.openai.com/v1/chat/completions")
                  .header("authorization", format!("Bearer {}", openai_key))
                  .json(&openai_body)
                  .send()
                  .await 
                {
                  Ok(resp2) => {
                    let status = resp2.status();
                    let text_body = resp2.text().await.unwrap_or_default();
                    
                    if status.is_success() {
                      let json: serde_json::Value = serde_json::from_str(&text_body).unwrap_or(serde_json::Value::Null);
                      if let Some(content_str) = json.pointer("/choices/0/message/content").and_then(|v| v.as_str()) {
                        let trimmed = content_str.trim().trim_matches('`').trim_start_matches("json").trim();
                        if let Ok(vj) = serde_json::from_str::<serde_json::Value>(trimmed) {
                          if let Some(p) = vj.get("proposito").and_then(|x| x.as_str()) { 
                            purpose_ai = Some(p.to_string()); 
                          }
                          let mut combined_points = Vec::new();
                          if let Some(arr) = vj.get("ejemplo_ejecucion").and_then(|x| x.as_array()) {
                            if !arr.is_empty() {
                              combined_points.push("▶ EJEMPLO DE EJECUCIÓN:".to_string());
                              for item in arr.iter() {
                                if let Some(s) = item.as_str() { combined_points.push(format!("  • {}", s)); }
                              }
                            }
                          }
                          if let Some(arr) = vj.get("mejoras").and_then(|x| x.as_array()) {
                            if !arr.is_empty() {
                              combined_points.push("🔧 POSIBLES MEJORAS:".to_string());
                              for item in arr.iter() {
                                if let Some(s) = item.as_str() { combined_points.push(format!("  • {}", s)); }
                              }
                            }
                          }
                          if let Some(arr) = vj.get("conclusiones").and_then(|x| x.as_array()) {
                            if !arr.is_empty() {
                              combined_points.push("📊 CONCLUSIONES:".to_string());
                              for item in arr.iter() {
                                if let Some(s) = item.as_str() { combined_points.push(format!("  • {}", s)); }
                              }
                            }
                          }
                          if !combined_points.is_empty() { key_points_ai = Some(combined_points); }
                        }
                      }
                    } else {
                    }
                  }
                  Err(_e2) => {
                  }
                }
              }
              
              if file_ai_debug { let _ = &e; } 
            }
          }
          if let (Some(p),Some(kps))=(purpose_ai.clone(), key_points_ai.clone()) { 
            if let Ok(mut map)=AI_CACHE.lock(){ if map.len()>=AI_CACHE_MAX { map.retain(|_,(ts,_,_)| ts.elapsed().unwrap_or_default() < Duration::from_secs(AI_CACHE_TTL_SECS)); if map.len()>=AI_CACHE_MAX { if let Some(first)=map.keys().next().cloned() { map.remove(&first); } } } map.insert(sha_cur.clone(), (SystemTime::now(), p, kps)); } 
          } else {
          }
        } else {
        }
      } else {
      }
    } else {
    }
  } else {
  }
  
  let language = language_detected.clone();
  // purpose debería provenir de la IA cuando enable_ai_summary=1; si no, heurística.
  let mut purpose = purpose_ai.clone();
  // Fallback: si AI estaba habilitada pero no devolvió nada, generamos una descripción mínima en lugar de dejar vacío.
  if enable_ai_summary && purpose.is_none() {
    purpose = Some(match language_detected {
      Some(ref l) => format!("Archivo {} de {} líneas", l, line_count),
      None => format!("Archivo de {} líneas", line_count)
    });
  }
  let mut key_points: Vec<String> = key_points_ai.clone().unwrap_or_default();
  if !enable_ai_summary && !ai_only_mode { // enriquecer con metadatos básicos sólo en modo heurístico
    key_points.insert(0, format!("Tamaño: {} bytes", bytes.len()));
    key_points.insert(0, format!("Líneas: {}", line_count));
    if let Some(ref langl)=language { key_points.push(format!("Lenguaje: {}", langl)); }
    if purpose.is_none() && semantic_summary.is_some() { let first_sentence = semantic_summary.as_ref().unwrap().split('.').next().unwrap_or(semantic_summary.as_ref().unwrap()).trim(); if !first_sentence.is_empty() { purpose=Some(first_sentence.to_string()); } }
    if purpose.is_none() { purpose=Some(format!("Archivo {} de {} líneas", language.clone().unwrap_or_else(||"texto".into()), line_count)); }
    if key_points.len()>6 { key_points.truncate(6); }
    if key_points.is_empty() { key_points.push("Sin rasgos destacados".into()); }
  }
  // narrative se elimina cuando la explicación viene de la API para que no duplique.
  let narrative = if enable_ai_summary { None } else { purpose.clone() };
  let analysis = FileAnalysis { path: path.clone(), language, line_count, size_bytes: bytes.len() as u64, sha256: sha_cur, head, tail, summary_hint, semantic_summary, purpose_from_ai: Some(purpose_ai.is_some()), purpose, key_points: if ai_only_mode { key_points_ai.clone() } else { Some(key_points) }, narrative, ai_only: Some(ai_only_mode), candidates: None, disambiguation_required: Some(false) };
  Ok(AnalyzeFileResponse { analysis })
}

// Nota: plan_file_edit usa una heurística temporal para demostrar cambios mientras no se integra el modelo.
// Heurística: añade un bloque de comentario inicial con la instrucción si no existe ya una huella similar.
#[tauri::command]
pub fn plan_file_edit(req: PlanFileEditRequest) -> Result<PlanFileEditResponse, CommandError> {
  let _sec = SecurityManager::new();
  let p = PathBuf::from(&req.path);
  let bytes = read_file_checked(&p)?;
  let original = String::from_utf8_lossy(&bytes).to_string();
  let instruction_trim = req.instruction.trim();
  let mut proposed = original.clone();
  let mut changed = false;
  if !instruction_trim.is_empty() {
    // construir bloque de comentario según extensión
    let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
    let (prefix_start, prefix_line, suffix_end) = match ext.as_str() {
      "rs" | "ts" | "tsx" | "js" | "c" | "h" | "cpp" | "hpp" => ("/*", " *", "*/"),
      "py" | "sh" | "bash" => ("#", "#", ""),
      "toml" | "yaml" | "yml" | "ini" | "env" => ("#", "#", ""),
  "md" => ("<!--", " *", "-->"),
      _ => ("#", "#", ""),
    };
    let marker = format!("{} EDIT PLAN:{}", prefix_start, instruction_trim.to_lowercase());
    if !original.to_lowercase().contains(&marker.to_lowercase()) {
      let header = if suffix_end.is_empty() {
        format!("{} EDIT PLAN: {}\n{} Fecha: {}\n\n", prefix_start, instruction_trim, prefix_line, chrono::Utc::now().to_rfc3339())
      } else {
        format!("{}\n{} EDIT PLAN: {}\n{} Fecha: {}\n{}\n\n", prefix_start, prefix_line, instruction_trim, prefix_line, chrono::Utc::now().to_rfc3339(), suffix_end)
      };
      proposed = format!("{}{}", header, original);
      changed = true;
    }
  }
  let diff = unified_diff(&original, &proposed);
  Ok(PlanFileEditResponse { proposed_content: proposed, diff, needs_confirmation: changed })
}

#[tauri::command]
pub fn apply_file_edit(req: ApplyFileEditRequest) -> Result<ApplyFileEditResponse, CommandError> {
  let _sec = SecurityManager::new();
  let p = PathBuf::from(&req.path);
  let existing = read_file_checked(&p)?;
  let existing_str = String::from_utf8_lossy(&existing);
  if existing_str == req.new_content { return Err(CommandError::permanent("VALIDATION_FAILED", "Nuevo contenido es idéntico al actual")); }
  // Backup
  let backup_path = backup_path_for(&p)?;
  fs::write(&backup_path, &existing).map_err(|e| map_io_error(e, "apply_file_edit", &backup_path.display().to_string()))?;
  rotate_backups(&p);
  // Escribir nuevo
  fs::write(&p, req.new_content.as_bytes()).map_err(|e| map_io_error(e, "apply_file_edit", &req.path))?;
  let sha256_new = sha256_hex(req.new_content.as_bytes());
  Ok(ApplyFileEditResponse { backup_path: backup_path.display().to_string(), bytes_written: req.new_content.len(), sha256_new })
}

#[tauri::command]
pub fn list_file_backups(path: String) -> Result<ListBackupsResponse, CommandError> {
  let _sec = SecurityManager::new();
  let p = PathBuf::from(&path);
  let mut metas = Vec::new();
  for b in list_backups_internal(&p) {
    if let Ok(md) = fs::metadata(&b) {
      metas.push(BackupMeta { path: b.display().to_string(), size: md.len() });
    }
  }
  Ok(ListBackupsResponse { backups: metas })
}

#[tauri::command]
pub fn revert_file(req: RevertFileRequest) -> Result<RevertFileResponse, CommandError> {
  let _sec = SecurityManager::new();
  let p = PathBuf::from(&req.path);
  let backups = list_backups_internal(&p);
  let target = backups.first()
    .ok_or_else(|| CommandError::permanent("RESOURCE_NOT_FOUND", "No hay backups disponibles"))?;
  let data = fs::read(target).map_err(|e| map_io_error(e, "revert_file", &target.display().to_string()))?;
  fs::write(&p, &data).map_err(|e| map_io_error(e, "revert_file", &req.path))?;
  Ok(RevertFileResponse { restored_from: target.display().to_string() })
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AnalyzeFileResponse { pub analysis: FileAnalysis }

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AiRemoteEditRequest { pub session_id: String, pub path: String, pub instruction: String, pub apply: bool }
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AiRemoteEditResponse { pub original_sha: String, pub new_sha: String, pub original_size: usize, pub new_size: usize, pub diff: String, pub new_content: String, pub applied: bool, pub backup_path: Option<String>, pub purpose: Option<String>, pub key_points: Option<Vec<String>>, pub model_used: Option<String>, pub refused: bool, pub descripcion: Option<String> }

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PlanFileEditRequest { pub path: String, pub instruction: String }
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PlanFileEditResponse { pub proposed_content: String, pub diff: String, pub needs_confirmation: bool }

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ApplyFileEditRequest { pub path: String, pub new_content: String }
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ApplyFileEditResponse { pub backup_path: String, pub bytes_written: usize, pub sha256_new: String }

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BackupMeta { pub path: String, pub size: u64 }
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ListBackupsResponse { pub backups: Vec<BackupMeta> }

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RevertFileRequest { pub path: String }
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RevertFileResponse { pub restored_from: String }
