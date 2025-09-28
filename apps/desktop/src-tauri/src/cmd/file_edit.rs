use serde::{Serialize, Deserialize};
use std::{fs, path::{Path, PathBuf}, time::{SystemTime, UNIX_EPOCH}};
use std::time::Duration;
use sha2::{Sha256, Digest};
use crate::security::SecurityManager;
use crate::cmd::state::SESSIONS;
use super::state::{SessionExt};
use std::io::Read;
use chrono; // ya está en Cargo.toml

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

#[derive(Serialize, Deserialize, Debug)]
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
  // Lista de rutas candidatas cuando el nombre es ambiguo y se requieren más datos del usuario
  pub candidates: Option<Vec<String>>,
  // Indica que no se realizó análisis de contenido porque se necesita desambiguar
  pub disambiguation_required: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AnalyzeFileResponse { pub analysis: FileAnalysis }

#[derive(Serialize, Deserialize, Debug)]
pub struct PlanFileEditRequest { pub path: String, pub instruction: String }
#[derive(Serialize, Deserialize, Debug)]
pub struct PlanFileEditResponse { pub proposed_content: String, pub diff: String, pub needs_confirmation: bool }

#[derive(Serialize, Deserialize, Debug)]
pub struct ApplyFileEditRequest { pub path: String, pub new_content: String }
#[derive(Serialize, Deserialize, Debug)]
pub struct ApplyFileEditResponse { pub backup_path: String, pub bytes_written: usize, pub sha256_new: String }

#[derive(Serialize, Deserialize, Debug)]
pub struct BackupMeta { pub path: String, pub size: u64 }
#[derive(Serialize, Deserialize, Debug)]
pub struct ListBackupsResponse { pub backups: Vec<BackupMeta> }

#[derive(Serialize, Deserialize, Debug)]
pub struct RevertFileRequest { pub path: String }
#[derive(Serialize, Deserialize, Debug)]
pub struct RevertFileResponse { pub restored_from: String }

// ---- Edición remota asistida por IA ----
#[derive(Serialize, Deserialize, Debug)]
pub struct AiRemoteEditRequest {
  pub session_id: String,
  pub path: String,
  pub instruction: String,
  pub apply: bool,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AiRemoteEditResponse {
  pub original_sha: String,
  pub new_sha: String,
  pub original_size: usize,
  pub new_size: usize,
  pub diff: String,
  pub new_content: String,
  pub applied: bool,
  pub backup_path: Option<String>,
  pub purpose: Option<String>,
  pub key_points: Option<Vec<String>>,
  pub model_used: Option<String>,
  pub refused: bool,
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

fn read_file_checked(path: &Path) -> Result<Vec<u8>, String> {
  let meta = fs::metadata(path).map_err(|e| format!("metadata error: {e}"))?;
  if !meta.is_file() { return Err("No es un archivo regular".into()); }
  if meta.len() > MAX_FILE_SIZE { return Err(format!("Archivo excede límite {} bytes", MAX_FILE_SIZE)); }
  let mut f = fs::File::open(path).map_err(|e| format!("open error: {e}"))?;
  let mut buf = Vec::with_capacity(meta.len() as usize + 1);
  f.read_to_end(&mut buf).map_err(|e| format!("read error: {e}"))?;
  if is_probably_binary(&buf) { return Err("Archivo parece binario, se rechaza".into()); }
  Ok(buf)
}

fn backup_path_for(path: &Path) -> Result<PathBuf, String> {
  let ts = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_secs();
  let mut p = path.to_path_buf();
  let file_name = p.file_name().and_then(|s| s.to_str()).ok_or("Nombre inválido")?;
  let backup_name = format!("{}.bak.{}", file_name, ts);
  p.set_file_name(backup_name);
  Ok(p)
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

fn rotate_backups(path: &Path) {
  let backups = list_backups_internal(path);
  if backups.len() > MAX_BACKUPS {
    for old in backups.iter().skip(MAX_BACKUPS) { let _ = fs::remove_file(old); }
  }
}

fn unified_diff(old: &str, new: &str) -> String {
  // Diff muy básico línea a línea (no LCS completo) para mantener dependencia cero.
  // Si se desea precisión total, integrar crate similar en el futuro.
  let old_lines: Vec<&str> = old.lines().collect();
  let new_lines: Vec<&str> = new.lines().collect();
  let mut out = String::new();
  out.push_str("--- original\n+++ propuesto\n");
  let max = old_lines.len().max(new_lines.len());
  for i in 0..max {
    let o = old_lines.get(i).map(|s| *s);
    let n = new_lines.get(i).map(|s| *s);
    match (o, n) {
      (Some(a), Some(b)) if a == b => {},
      (Some(a), Some(b)) => {
        out.push_str(&format!("-{}\n+{}\n", a, b));
      },
      (Some(a), None) => out.push_str(&format!("-{}\n", a)),
      (None, Some(b)) => out.push_str(&format!("+{}\n", b)),
      (None, None) => {}
    }
  }
  out
}

// Utilidad para obtener/abrir SFTP (reutiliza la lógica de sftp_read_file pero expone escritura)
fn get_sftp_for_session(session_id: &str) -> Result<ssh2::Sftp, String> {
  use crate::ssh::ssh2_sftp as sftp2; use std::sync::{Arc, Mutex}; use super::state::CachedSsh2;
  fn get_or_connect_cached(map: &mut std::collections::HashMap<String, SessionExt>, id: &str) -> Result<Arc<Mutex<CachedSsh2>>, String> {
    if let Some(existing) = map.get(id).and_then(|s| s.sftp_cached.clone()) { return Ok(existing); }
    let (host, port, user, password) = {
      let s = map.get(id).ok_or_else(|| "Sesión no encontrada".to_string())?;
      (s.host.clone(), s.port, s.user.clone(), s.password.clone())
    };
    let (tcp, sess) = sftp2::connect_password(&host, port, &user, &password).map_err(|e| e.to_string())?;
    let arc = Arc::new(Mutex::new(CachedSsh2 { tcp, sess }));
    if let Some(s) = map.get_mut(id) { s.sftp_cached = Some(arc.clone()); }
    Ok(arc)
  }
  let mut map = SESSIONS.lock().map_err(|_| "Lock sessions".to_string())?;
  let cached = get_or_connect_cached(&mut map, session_id)?;
  let guard = cached.lock().map_err(|_| "Lock cached".to_string())?;
  crate::ssh::ssh2_sftp::open_sftp(&guard.sess).map_err(|e| e.to_string())
}

fn remote_backup_and_write(sftp: &ssh2::Sftp, path: &str, new_content: &str) -> Result<Option<String>, String> {
  use std::io::Write;
  let p = std::path::Path::new(path);
  // Crear backup si existe
  let backup_path = if let Ok(stat) = sftp.stat(p) {
    if stat.is_file() {
      let ts = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_secs();
      let parent = p.parent().ok_or("Sin parent")?;
      let file_name = p.file_name().and_then(|s| s.to_str()).ok_or("Nombre inválido")?;
      let backup_name = format!("{}.bak.{}", file_name, ts);
      let backup_abs = parent.join(&backup_name);
      crate::ssh::ssh2_sftp::rename(sftp, path, backup_abs.to_str().ok_or("Utf8")?).map_err(|e| e.to_string())?;
      Some(backup_abs.to_string_lossy().to_string())
    } else { None }
  } else { None };
  // Escribir nuevo
  let mut f = sftp.create(p).map_err(|e| format!("create error: {e}"))?;
  f.write_all(new_content.as_bytes()).map_err(|e| format!("write error: {e}"))?;
  f.flush().ok();
  Ok(backup_path)
}

// --- BÚSQUEDA REMOTA (fallback estilo agent) ---
// Intenta localizar un archivo por nombre (sin ruta) usando comandos remotos.
// Estrategia: buscar en PWD, $HOME, y /home/* (maxdepth bajo) con find.
// Controlado por env FILE_ANALYSIS_REMOTE_SEARCH=1 (por defecto activado) y sólo si no se encontró por otras heurísticas.

// Nueva función: recolecta múltiples coincidencias (hasta max_results) para desambiguación.
// Estrategia: reutiliza etapas escalonadas pero sin -quit inmediato; corta cuando alcanza el límite.
fn remote_locate_file_multi(session_id: &str, name: &str, max_results: usize) -> Option<Vec<String>> {
  if name.contains('/') { return None; }
  if std::env::var("FILE_ANALYSIS_REMOTE_SEARCH").ok().as_deref() == Some("0") { return None; }
  if max_results == 0 { return Some(vec![]); }
  let global_enabled = std::env::var("FILE_ANALYSIS_REMOTE_GLOBAL").ok().map(|v| v != "0").unwrap_or(true); // ahora por defecto ON salvo 0
  let deep_enabled = std::env::var("FILE_ANALYSIS_REMOTE_DEEP").ok().as_deref() == Some("1");
  use crate::ssh::ssh2_sftp as sftp2; use std::sync::{Arc, Mutex}; use super::state::CachedSsh2;
  fn get_or_connect_cached(map: &mut std::collections::HashMap<String, SessionExt>, id: &str) -> Result<Arc<Mutex<CachedSsh2>>, String> {
    if let Some(existing) = map.get(id).and_then(|s| s.sftp_cached.clone()) { return Ok(existing); }
    let (host, port, user, password) = {
      let s = map.get(id).ok_or_else(|| "Sesión no encontrada".to_string())?;
      (s.host.clone(), s.port, s.user.clone(), s.password.clone())
    };
    let (tcp, sess) = sftp2::connect_password(&host, port, &user, &password).map_err(|e| e.to_string())?;
    let arc = Arc::new(Mutex::new(CachedSsh2 { tcp, sess }));
    if let Some(s) = map.get_mut(id) { s.sftp_cached = Some(arc.clone()); }
    Ok(arc)
  }
  let mut map = SESSIONS.lock().ok()?;
  let cached = get_or_connect_cached(&mut map, session_id).ok()?;
  let guard = cached.lock().ok()?;
  let sess = &guard.sess;
  let safe_name = name.replace('"', "");
  let quick_roots = "\"$PWD\" \"$HOME\" /home/*";
  // Ampliamos raíces globales para cubrir rutas comunes adicionales fuera de /home
  // Raíces globales extendidas (similar a agent.rs pero más amplia para localizar scripts en bin/sbin, etc.)
  let global_roots = if global_enabled { Some("/usr/local /usr /usr/bin /usr/sbin /bin /sbin /opt /var/www /var /etc /srv /data /app /root /tmp /mnt /media") } else { None };
  let mut results: Vec<String> = Vec::new();
  let debug = std::env::var("FILE_ANALYSIS_SEARCH_DEBUG").ok().map(|v| v=="1" || v.eq_ignore_ascii_case("true")).unwrap_or(false);
  let include_symlinks = std::env::var("FILE_ANALYSIS_INCLUDE_SYMLINKS").ok().map(|v| v=="1" || v.eq_ignore_ascii_case("true")).unwrap_or(false);
  let file_type_expr = if include_symlinks { "( -type f -o -type l )" } else { "-type f" };
  // Helper para ejecutar un comando y recolectar líneas hasta max_results
  fn run_collect(sess: &ssh2::Session, cmd: &str, results: &mut Vec<String>, max_results: usize) {
    if results.len() >= max_results { return; }
    if let Ok(mut ch) = sess.channel_session() {
      if ch.exec(cmd).is_ok() {
        use std::io::Read; let mut out = String::new(); let _ = ch.read_to_string(&mut out); let _ = ch.wait_close();
        let mut seen: std::collections::HashSet<String> = results.iter().cloned().collect();
        for line in out.lines() {
          if results.len() >= max_results { break; }
          let l = line.trim();
          if !l.is_empty() && seen.insert(l.to_string()) { results.push(l.to_string()); }
        }
      }
    }
  }
  // Etapa 1: rápida exacta
  let fast_cmd = format!(
    "set -e; N=\"{}\"; FT='{}'; for d in {{roots}}; do [ -d \"$d\" ] || continue; find \"$d\" -maxdepth 3 {} -name \"$N\" -print 2>/dev/null; done",
    safe_name, file_type_expr, file_type_expr
  ).replace("{roots}", quick_roots);
  if debug { eprintln!("[file_analysis_search] quick exact cmd: {}", fast_cmd); }
  run_collect(sess, &fast_cmd, &mut results, max_results);
  if debug { eprintln!("[file_analysis_search] quick exact results: {}", results.len()); }
  if results.len() >= max_results { return Some(results); }
  // Etapa 1b: rápida case-insensitive si aún no llenamos
  if results.len() < max_results {
    let fast_iname_cmd = format!(
      "set -e; N=\"{}\"; FT='{}'; for d in {{roots}}; do [ -d \"$d\" ] || continue; find \"$d\" -maxdepth 12 {} -iname \"$N\" -print 2>/dev/null; done",
      safe_name, file_type_expr, file_type_expr
    ).replace("{roots}", quick_roots);
    if debug { eprintln!("[file_analysis_search] quick iname cmd: {}", fast_iname_cmd); }
    run_collect(sess, &fast_iname_cmd, &mut results, max_results);
    if debug { eprintln!("[file_analysis_search] quick iname results: {}", results.len()); }
  }
  // Etapa 1c: parcial rápida *name* (para scripts con prefijos) si aún quedan huecos
  if results.len() < max_results {
    let fast_partial_cmd = format!(
      "set -e; N=\"{}\"; FT='{}'; for d in {{roots}}; do [ -d \"$d\" ] || continue; find \"$d\" -maxdepth 12 {} -iname \"*\\$N*\" -print 2>/dev/null; done",
      safe_name, file_type_expr, file_type_expr
    ).replace("{roots}", quick_roots);
    if debug { eprintln!("[file_analysis_search] quick partial cmd: {}", fast_partial_cmd); }
    run_collect(sess, &fast_partial_cmd, &mut results, max_results);
    if debug { eprintln!("[file_analysis_search] quick partial results: {}", results.len()); }
  }
  if global_enabled {
    let broader_roots = format!("{quick} {extra}", quick = quick_roots, extra = global_roots.unwrap());
    let broad_cmd_exact = format!(
      "set -e; N=\"{}\"; FT='{}'; for d in {{roots}}; do [ -d \"$d\" ] || continue; find \"$d\" -maxdepth 12 -not -path '*/node_modules/*' -not -path '*/target/*' -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/coverage/*' -not -path '*/.git/*' -not -path '*/.cache/*' {} -name \"$N\" -print 2>/dev/null; done",
      safe_name, file_type_expr, file_type_expr
    ).replace("{roots}", &broader_roots);
    if debug { eprintln!("[file_analysis_search] broad exact cmd: {}", broad_cmd_exact); }
    run_collect(sess, &broad_cmd_exact, &mut results, max_results);
    if results.len() >= max_results { return Some(results); }
    let broad_cmd_iname = format!(
      "set -e; N=\"{}\"; FT='{}'; for d in {{roots}}; do [ -d \"$d\" ] || continue; find \"$d\" -maxdepth 12 -not -path '*/node_modules/*' -not -path '*/target/*' -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/coverage/*' -not -path '*/.git/*' -not -path '*/.cache/*' {} -iname \"$N\" -print 2>/dev/null; done",
      safe_name, file_type_expr, file_type_expr
    ).replace("{roots}", &broader_roots);
    if debug { eprintln!("[file_analysis_search] broad iname cmd: {}", broad_cmd_iname); }
    run_collect(sess, &broad_cmd_iname, &mut results, max_results);
    if results.len() >= max_results { return Some(results); }
    // Búsqueda parcial (subcadena) si aún tenemos pocos resultados (< max_results)
    if results.len() < max_results {
      let broad_cmd_partial = format!(
        "set -e; N=\"{}\"; FT='{}'; for d in {{roots}}; do [ -d \"$d\" ] || continue; find \"$d\" -maxdepth 12 -not -path '*/node_modules/*' -not -path '*/target/*' -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/coverage/*' -not -path '*/.git/*' -not -path '*/.cache/*' {} -iname \"*\\$N*\" -print 2>/dev/null; done",
        safe_name, file_type_expr, file_type_expr
      ).replace("{roots}", &broader_roots);
      if debug { eprintln!("[file_analysis_search] broad partial cmd: {}", broad_cmd_partial); }
      run_collect(sess, &broad_cmd_partial, &mut results, max_results);
    }
  }
  if global_enabled && deep_enabled && results.is_empty() { // deep solo si aún nada (costoso)
    let deep_cmd = format!(
      "timeout 6s bash -c 'N=\"{n}\"; find / -maxdepth 12 -not -path '/proc/*' -not -path '/sys/*' -not -path '/dev/*' -not -path '/run/*' -not -path '*/node_modules/*' -not -path '*/target/*' -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/coverage/*' -not -path '*/.git/*' -type f -iname \"$N\" -print 2>/dev/null'",
      n = safe_name
    );
    run_collect(sess, &deep_cmd, &mut results, max_results);
  }
  // Fallback adicional: si tras todas las etapas seguimos sin resultados, barrido focalizado /home (más profundo que etapa exacta inicial)
  if results.is_empty() {
    let home_fallback_enabled = std::env::var("FILE_ANALYSIS_HOME_FALLBACK").ok().map(|v| v != "0").unwrap_or(true);
    if home_fallback_enabled {
      let fb_cmd = format!(
        "set -e; N=\"{}\"; if [ -d /home ]; then find /home -maxdepth 8 -type f -iname \"$N\" -print 2>/dev/null; fi",
        safe_name
      );
      if debug { eprintln!("[file_analysis_search] fallback /home cmd: {}", fb_cmd); }
      run_collect(sess, &fb_cmd, &mut results, max_results);
      if debug { eprintln!("[file_analysis_search] fallback /home results: {}", results.len()); }
    }
  }
  // Nueva etapa de augment: si ya tenemos algunos resultados pero menos que max_results, intentar captar duplicados en otros home/* con profundidad mayor
  if !results.is_empty() && results.len() < max_results {
    let augment_enabled = std::env::var("FILE_ANALYSIS_HOME_AUGMENT").ok().map(|v| v != "0").unwrap_or(true);
    if augment_enabled {
      let aug_cmd = format!(
        "set -e; N=\"{}\"; if [ -d /home ]; then find /home -maxdepth 12 -type f -iname \"$N\" -print 2>/dev/null; fi",
        safe_name
      );
      if debug { eprintln!("[file_analysis_search] augment /home cmd: {}", aug_cmd); }
      run_collect(sess, &aug_cmd, &mut results, max_results);
      if debug { eprintln!("[file_analysis_search] augment /home results: {}", results.len()); }
    }
  }
  if results.is_empty() { None } else {
    // Deduplicar preservando orden
    let mut seen = std::collections::HashSet::new();
    results.retain(|r| seen.insert(r.clone()));
    // Diversidad: si todos los resultados están bajo /home/* intentamos obtener al menos uno fuera
    let has_non_home = results.iter().any(|r| !r.starts_with("/home/") && !r.contains("$HOME"));
    if !has_non_home && global_enabled {
      // Hacer una búsqueda rápida adicional limitada para encontrar un candidato fuera de /home
      if let Some(extra_roots) = global_roots {
        // Tomar primeras 3 raíces globales que no sean /home*
        let extra_cmd = format!(
          "set -e; N=\"{}\"; for d in {} ; do [ -d \"$d\" ] || continue; case $d in /home* ) continue ;; esac; find \"$d\" -maxdepth 12 -type f -name \"$N\" -print 2>/dev/null; done | head -n 3",
          safe_name,
          extra_roots
        );
        if let Ok(mut ch) = sess.channel_session() {
          if ch.exec(&extra_cmd).is_ok() {
            use std::io::Read; let mut out = String::new(); let _ = ch.read_to_string(&mut out); let _ = ch.wait_close();
            for line in out.lines() { let l = line.trim(); if !l.is_empty() && !results.iter().any(|e| e==l) { results.push(l.to_string()); break; } }
          }
        }
      }
    }
    // Si ahora excedemos max_results recortar priorizando: (1) rutas fuera de /home, (2) primeras encontradas
    if results.len() > max_results {
      let mut outside: Vec<String> = results.iter().filter(|r| !r.starts_with("/home/")).cloned().collect();
      let mut inside: Vec<String> = results.iter().filter(|r| r.starts_with("/home/")).cloned().collect();
      // Mantener orden original relativo
      let mut ordered: Vec<String> = Vec::new();
      ordered.append(&mut outside);
      ordered.append(&mut inside);
      ordered.truncate(max_results);
      results = ordered;
    }
    Some(results)
  }
}
  // (Eliminado código obsoleto de versión single-match previo a multi búsqueda)

// --- (restaurado) Comando original ai_remote_edit_file ---
#[tauri::command]
pub async fn ai_remote_edit_file(req: AiRemoteEditRequest) -> Result<AiRemoteEditResponse, String> {
  let _sec = SecurityManager::new();
  if req.session_id.trim().is_empty() { return Err("session_id requerido".into()); }
  if req.instruction.trim().is_empty() { return Err("instruction vacío".into()); }
  if req.instruction.len() > 2000 { return Err("instruction demasiado largo (>2000)".into()); }
  let sid = req.session_id.clone(); let path = req.path.clone();
  let bytes = tokio::task::spawn_blocking(move || sftp_read_file(&sid, &path)).await.map_err(|_| "join error")??;
  if bytes.len() > MAX_AI_EDIT_SIZE { return Err(format!("Archivo excede límite edición AI ({} bytes > {})", bytes.len(), MAX_AI_EDIT_SIZE)); }
  let original_content = String::from_utf8_lossy(&bytes).to_string();
  let original_sha = sha256_hex(&bytes);
  let model = std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-3.5-turbo".into());
  let api_key = std::env::var("OPENAI_API_KEY").map_err(|_| "OPENAI_API_KEY no definida")?;
  let instruction = req.instruction.trim();
  let prompt = format!(
    "Edita el siguiente archivo aplicando la instrucción del usuario. Devuelve SOLO JSON con campos: new_content, purpose, key_points.\nReglas: \n- Mantén el formato y partes no relacionadas intactas.\n- purpose = una línea clara (sin 'Este archivo').\n- key_points = 3-6 bullets concisos sin punto final.\n- Si la instrucción es insegura (borrar TODO, introducir secretos, comandos destructivos) entonces devuelve new_content igual al original y añade un bullet 'No cambio aplicado (instrucción desautorizada)'.\n- No expliques fuera del JSON.\n---\nRUTA: {path}\nINSTRUCCIÓN: {inst}\nCONTENIDO_ORIGINAL:\n{content}\n---",
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
  let client = reqwest::Client::builder().timeout(Duration::from_secs(20)).build().map_err(|e| e.to_string())?;
  let resp = client.post("https://api.openai.com/v1/chat/completions").bearer_auth(&api_key).json(&body).send().await.map_err(|e| format!("http error: {e}"))?;
  let json: serde_json::Value = resp.json().await.map_err(|e| format!("json error: {e}"))?;
  let raw = json.pointer("/choices/0/message/content").and_then(|v| v.as_str()).ok_or("sin contenido de modelo")?;
  let trimmed = raw.trim().trim_matches('`').trim_start_matches("json").trim();
  let parsed: serde_json::Value = serde_json::from_str(trimmed).map_err(|_| "JSON IA inválido")?;
  let new_content = parsed.get("new_content").and_then(|v| v.as_str()).ok_or("new_content faltante")?.to_string();
  let purpose = parsed.get("purpose").and_then(|v| v.as_str()).map(|s| s.to_string());
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
    }).await.map_err(|_| "join write error")??;
    applied = true;
  }
  Ok(AiRemoteEditResponse { original_sha, new_sha, original_size: original_content.len(), new_size: new_content.len(), diff, new_content, applied, backup_path, purpose, key_points, model_used: Some(model), refused })
}

#[tauri::command]
pub fn analyze_file(path: String) -> Result<AnalyzeFileResponse, String> {
  // Unificamos lógica: delegar a analyze_any_file sin session_id (D)
  tauri::async_runtime::block_on(analyze_any_file(None, path))
}

fn sftp_read_file(session_id: &str, remote_path: &str) -> Result<Vec<u8>, String> {
  use crate::ssh::ssh2_sftp as sftp2;
  use std::sync::{Arc, Mutex};
  use super::state::CachedSsh2;
  // Reutilizar lógica de conexión de sftp.rs (simplificada aquí)
  fn get_or_connect_cached(map: &mut std::collections::HashMap<String, SessionExt>, id: &str) -> Result<Arc<Mutex<CachedSsh2>>, String> {
    if let Some(existing) = map.get(id).and_then(|s| s.sftp_cached.clone()) { return Ok(existing); }
    let (host, port, user, password) = {
      let s = map.get(id).ok_or_else(|| "Sesión no encontrada".to_string())?;
      (s.host.clone(), s.port, s.user.clone(), s.password.clone())
    };
    let (tcp, sess) = sftp2::connect_password(&host, port, &user, &password).map_err(|e| e.to_string())?;
    let arc = Arc::new(Mutex::new(CachedSsh2 { tcp, sess }));
    if let Some(s) = map.get_mut(id) { s.sftp_cached = Some(arc.clone()); }
    Ok(arc)
  }
  let mut map = SESSIONS.lock().map_err(|_| "Lock sessions".to_string())?;
  let cached = get_or_connect_cached(&mut map, session_id)?;
  let guard = cached.lock().map_err(|_| "Lock cached".to_string())?;
  let sftp = sftp2::open_sftp(&guard.sess).map_err(|e| e.to_string())?;
  let path = std::path::Path::new(remote_path);
  let mut f = sftp.open(path).map_err(|e| format!("sftp open error: {e}"))?;
  let mut buf = Vec::new();
  use std::io::Read as _;
  f.read_to_end(&mut buf).map_err(|e| format!("sftp read error: {e}"))?;
  Ok(buf)
}

#[tauri::command]
pub async fn analyze_any_file(session_id: Option<String>, path: String) -> Result<AnalyzeFileResponse, String> {
  let _sec = SecurityManager::new();
  let original_input = path.clone();
  let mut reasons: Vec<String> = Vec::new();
  let mut bytes_opt: Option<Vec<u8>> = None;
  let ai_only_mode = std::env::var("FILE_ANALYSIS_AI_ONLY").ok().as_deref() == Some("1");
  let mut did_amb_search = false; // evita doble ejecución del multi-match

  // Helper remoto con timeout configurable (por defecto 6s) para lectura SFTP
  async fn try_remote(sid: &str, p: &str) -> Option<Vec<u8>> {
    use std::time::Duration;
    let timeout_secs: u64 = std::env::var("FILE_REMOTE_READ_TIMEOUT_SECS").ok().and_then(|v| v.parse().ok()).unwrap_or(6);
    let sid_s = sid.to_string();
    let p_s = p.to_string();
    let join = tauri::async_runtime::spawn_blocking(move || sftp_read_file(&sid_s, &p_s));
    match tokio::time::timeout(Duration::from_secs(timeout_secs), join).await {
      Ok(Ok(Ok(b))) => Some(b),
      _ => None,
    }
  }

  // Local
  let local_path = PathBuf::from(&path);
  if local_path.exists() {
    match read_file_checked(&local_path) { Ok(b) => bytes_opt = Some(b), Err(e) => reasons.push(format!("Local presente pero no legible: {e}")) }
  } else { reasons.push("No existe localmente".into()); }

  // BÚSQUEDA TEMPRANA PARA DESAMBIGUACIÓN: si es nombre simple y no se encontró local
  if bytes_opt.is_none() && !path.contains('/') && !path.starts_with('~') {
    if let Some(sid) = &session_id { if !sid.is_empty() {
      let max_cand: usize = std::env::var("FILE_ANALYSIS_MAX_CANDIDATES").ok().and_then(|v| v.parse().ok()).unwrap_or(8);
      if let Some(found_list) = remote_locate_file_multi(sid, &path, max_cand) {
        did_amb_search = true;
        let mut uniq = found_list.clone();
        {
          let mut seen = std::collections::HashSet::new();
          uniq.retain(|r| seen.insert(r.clone()));
        }
        if uniq.len() > 1 {
          // devolver candidatos antes de leer nada
          let analysis = FileAnalysis {
            path: original_input.clone(),
            language: None,
            line_count: 0,
            size_bytes: 0,
            sha256: String::new(),
            head: String::new(),
            tail: String::new(),
            summary_hint: format!("{} coincidencias", uniq.len()),
            semantic_summary: None,
            purpose: None,
            key_points: None,
            purpose_from_ai: None,
            narrative: Some("Nombre ambiguo: selecciona la ruta exacta para continuar".into()),
            ai_only: Some(ai_only_mode),
            candidates: Some(uniq),
            disambiguation_required: Some(true),
          };
          return Ok(AnalyzeFileResponse { analysis });
        } else if !found_list.is_empty() {
          let only = &found_list[0];
          if let Some(b) = try_remote(sid, only).await {
            bytes_opt = Some(b);
            reasons.push(format!("Única coincidencia remota temprana: {}", only));
          } else {
            // Log y devolver como desambiguación para que el usuario pueda forzar selección manual
            if std::env::var("FILE_ANALYSIS_SEARCH_DEBUG").ok().map(|v| v=="1" || v.eq_ignore_ascii_case("true")).unwrap_or(false) {
              eprintln!("[file_analysis_search] fallo lectura única coincidencia: {}", only);
            }
            let analysis = FileAnalysis {
              path: original_input.clone(),
              language: None,
              line_count: 0,
              size_bytes: 0,
              sha256: String::new(),
              head: String::new(),
              tail: String::new(),
              summary_hint: "1 coincidencia (lectura fallida, selecciona para reintentar)".into(),
              semantic_summary: None,
              purpose: None,
              key_points: None,
              purpose_from_ai: None,
              narrative: Some("Se encontró una sola ruta pero la primera lectura falló; selecciona para reintentar".into()),
              ai_only: Some(ai_only_mode),
              candidates: Some(vec![only.clone()]),
              disambiguation_required: Some(true),
            };
            return Ok(AnalyzeFileResponse { analysis });
          }
        } else {
          reasons.push("Desambiguación temprana sin coincidencias".into());
        }
      }
    }}
  }

  // Directo remoto
  if bytes_opt.is_none() {
    if let Some(sid) = &session_id { if !sid.is_empty() {
      if let Some(b) = try_remote(sid, &path).await { bytes_opt = Some(b); } else { reasons.push("Remoto directo falló".into()); }
    }} else { reasons.push("Sin session_id para remoto directo".into()); }
  }

  // Recuperar usuario (sin lock persistente)
  let user_name_opt = if let Some(sid) = &session_id { SESSIONS.lock().ok().and_then(|m| m.get(sid).map(|s| s.user.clone())) } else { None };
  let home_guess = user_name_opt.as_ref().map(|uname| {
    let u = uname.split(|c| c=='\\' || c=='/').last().unwrap_or(uname);
    if u == "root" { "/root".to_string() } else { format!("/home/{}", u) }
  });

  // Expansión ~
  if bytes_opt.is_none() && path.starts_with("~/") {
    if let (Some(sid), Some(home)) = (&session_id, &home_guess) {
      let expanded = format!("{}{}", home, &path[1..]);
      if let Some(b) = try_remote(sid, &expanded).await { bytes_opt = Some(b); } else { reasons.push("Expansión ~ falló".into()); }
    }
  }

  // Home + nombre simple
  if bytes_opt.is_none() && !path.starts_with('/') && !path.starts_with('~') {
    if let (Some(sid), Some(home)) = (&session_id, &home_guess) {
      let joined = format!("{}/{}", home.trim_end_matches('/'), path);
      if let Some(b) = try_remote(sid, &joined).await { bytes_opt = Some(b); } else { reasons.push(format!("Home remoto intento {} falló", joined)); }

      // Case-insensitive listado home
      if bytes_opt.is_none() && !path.contains('/') {
        let target_lower = path.to_lowercase();
        let sid_clone = sid.to_string();
        let home_clone = home.clone();
        if let Some(found_name) = {
          use std::time::Duration; use tokio::time::timeout;
          let task = tauri::async_runtime::spawn_blocking(move || {
          use crate::ssh::ssh2_sftp as sftp2;
          use std::sync::{Arc, Mutex};
          use super::state::CachedSsh2;
          fn get_or_connect(map: &mut std::collections::HashMap<String, SessionExt>, id: &str) -> Result<Arc<Mutex<CachedSsh2>>, String> {
            if let Some(existing) = map.get(id).and_then(|s| s.sftp_cached.clone()) { return Ok(existing); }
            let (host, port, user, password) = {
              let s = map.get(id).ok_or_else(|| "Sesión no encontrada".to_string())?;
              (s.host.clone(), s.port, s.user.clone(), s.password.clone())
            };
            let (tcp, sess) = sftp2::connect_password(&host, port, &user, &password).map_err(|e| e.to_string())?;
            let arc = Arc::new(Mutex::new(CachedSsh2 { tcp, sess }));
            if let Some(s) = map.get_mut(id) { s.sftp_cached = Some(arc.clone()); }
            Ok(arc)
          }
          if let Ok(mut map) = SESSIONS.lock() {
            if let Ok(cached) = get_or_connect(&mut map, &sid_clone) {
              if let Ok(guard) = cached.lock() {
                if let Ok(sftp) = sftp2::open_sftp(&guard.sess) {
                  if let Ok(entries) = sftp.readdir(std::path::Path::new(&home_clone)) {
                    for (pb, _) in entries {
                      if let Some(n) = pb.file_name().and_then(|s| s.to_str()) {
                        if n.to_lowercase() == target_lower {
                          return Some(n.to_string());
                        }
                      }
                    }
                  }
                }
              }
            }
          }
          None
          });
          match timeout(Duration::from_secs(2), task).await { Ok(Ok(res)) => res, _ => None }
        } {
          let ci_path = format!("{}/{}", home.trim_end_matches('/'), found_name);
          if let Some(b) = try_remote(sid, &ci_path).await { bytes_opt = Some(b); } else { reasons.push(format!("Case-insensitive coincidencia {} falló", ci_path)); }
        }

        // Escaneo subdirectorios /home si aún nada
        if bytes_opt.is_none() {
          let sid_clone2 = sid.to_string();
          let target_lower2 = path.to_lowercase();
          if let Some(found_abs) = {
            use std::time::Duration; use tokio::time::timeout;
            let task = tauri::async_runtime::spawn_blocking(move || {
            use crate::ssh::ssh2_sftp as sftp2;
            use std::sync::{Arc, Mutex};
            use super::state::CachedSsh2;
            fn get_or_connect(map: &mut std::collections::HashMap<String, SessionExt>, id: &str) -> Result<Arc<Mutex<CachedSsh2>>, String> {
              if let Some(existing) = map.get(id).and_then(|s| s.sftp_cached.clone()) { return Ok(existing); }
              let (host, port, user, password) = {
                let s = map.get(id).ok_or_else(|| "Sesión no encontrada".to_string())?;
                (s.host.clone(), s.port, s.user.clone(), s.password.clone())
              };
              let (tcp, sess) = sftp2::connect_password(&host, port, &user, &password).map_err(|e| e.to_string())?;
              let arc = Arc::new(Mutex::new(CachedSsh2 { tcp, sess }));
              if let Some(s) = map.get_mut(id) { s.sftp_cached = Some(arc.clone()); }
              Ok(arc)
            }
            if let Ok(mut map) = SESSIONS.lock() {
              if let Ok(cached) = get_or_connect(&mut map, &sid_clone2) {
                if let Ok(guard) = cached.lock() {
                  if let Ok(sftp) = sftp2::open_sftp(&guard.sess) {
                    if let Ok(entries) = sftp.readdir(std::path::Path::new("/home")) {
                      for (dir_pb, stat) in entries {
                        if stat.is_dir() {
                          if let Ok(inner) = sftp.readdir(&dir_pb) {
                            for (pb, _st2) in inner {
                              if let Some(n) = pb.file_name().and_then(|s| s.to_str()) {
                                if n.to_lowercase() == target_lower2 {
                                  return Some(format!("{}/{}", dir_pb.to_string_lossy(), n));
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
            None
            });
            match timeout(Duration::from_secs(2), task).await { Ok(Ok(res)) => res, _ => None }
          } {
            if let Some(b) = try_remote(sid, &found_abs).await { bytes_opt = Some(b); } else { reasons.push(format!("Búsqueda /home subdirs coincidencia {} falló", found_abs)); }
          } else { reasons.push("Búsqueda /home subdirs sin coincidencias".into()); }
        }
      }
    }
  }

  // Fallback búsqueda remota estilo agent (solo si no hicimos la temprana)
  if !did_amb_search && bytes_opt.is_none() && session_id.as_ref().map(|s| !s.is_empty()).unwrap_or(false) && !path.contains('/') && !path.starts_with('~') {
    if let Some(sid) = &session_id {
      let max_cand: usize = std::env::var("FILE_ANALYSIS_MAX_CANDIDATES").ok().and_then(|v| v.parse().ok()).unwrap_or(8);
      if let Some(found_list) = remote_locate_file_multi(sid, &path, max_cand) {
        if found_list.len() == 1 {
          let found_abs = &found_list[0];
          if let Some(b) = try_remote(sid, found_abs).await { bytes_opt = Some(b); reasons.push(format!("Encontrado por búsqueda remota: {}", found_abs)); }
          else { reasons.push(format!("Búsqueda remota localizó {} pero lectura falló", found_abs)); }
        } else if found_list.len() > 1 {
          // Devolver respuesta parcial solicitando desambiguación
          let analysis = FileAnalysis {
            path: original_input.clone(),
            language: None,
            line_count: 0,
            size_bytes: 0,
            sha256: String::new(),
            head: String::new(),
            tail: String::new(),
            summary_hint: format!("{} coincidencias", found_list.len()),
            semantic_summary: None,
            purpose: None,
            key_points: None,
            purpose_from_ai: None,
            narrative: Some("Nombre ambiguo: selecciona la ruta exacta para continuar".into()),
            ai_only: Some(ai_only_mode),
            candidates: Some(found_list),
            disambiguation_required: Some(true),
          };
          return Ok(AnalyzeFileResponse { analysis });
        } else {
          reasons.push("Búsqueda remota sin coincidencias".into());
        }
      } else { reasons.push("Búsqueda remota sin coincidencias".into()); }
    }
  }

  let bytes = bytes_opt.ok_or_else(|| format!("No se pudo leer el archivo local ni remoto: {} => intentos: {}", original_input, reasons.join(" | ")))?;
  if bytes.len() as u64 > MAX_FILE_SIZE { return Err(format!("Archivo excede límite {} bytes", MAX_FILE_SIZE)); }
  if is_probably_binary(&bytes) { return Err("Archivo parece binario, se rechaza".into()); }

  let content = String::from_utf8_lossy(&bytes);
  let line_count = content.lines().count();
  let head = if ai_only_mode { String::new() } else { content.lines().take(15).collect::<Vec<_>>().join("\n") };
  let tail = if ai_only_mode { String::new() } else { content.lines().rev().take(15).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n") };
  let summary_hint = if ai_only_mode { String::new() } else { format!("{} líneas", line_count) };
  // Heurística de explicación semántica mejorada (sin LLM) para producir una frase entendible
  let semantic_summary_heur = if ai_only_mode { None } else {
    let lang = detect_language(Path::new(&path), &content).unwrap_or_else(|| "texto".into());
    let mut clauses: Vec<String> = Vec::new();
  // (elim: variables is_bash / is_python_script no usadas)
    let def_funcs = content.matches("def ").count();
    let fn_funcs = content.matches("fn ").count();
    let classes = content.matches("class ").count();
    let imports = content.lines().filter(|l| l.trim_start().starts_with("use ") || l.trim_start().starts_with("import ") || l.trim_start().starts_with("from ")).count();

    

    // Estructura
    if def_funcs + fn_funcs > 0 { clauses.push(format!("define {} función{}", def_funcs+fn_funcs, if def_funcs+fn_funcs==1 { "" } else { "es" })); }
    if classes > 0 { clauses.push(format!("contiene {} clase{}", classes, if classes==1 { "" } else { "s" })); }
    if imports > 0 { clauses.push(format!("usa {} importación{}", imports, if imports==1 { "" } else { "es" })); }

    // Aquí pueden añadirse más patrones futuros

    // Construcción final
    let baseline_subject = if lang == "bash" { "Este script Bash" } else if lang == "python" { "Este archivo Python" } else { "Este archivo" };
    let explanation = if clauses.is_empty() {
      format!("{} contiene {} líneas", baseline_subject, line_count)
    } else {
      let mut seen = std::collections::HashSet::new();
      let mut filtered = Vec::new();
      for c in clauses { if seen.insert(c.clone()) { filtered.push(c); } }
      let joined = if filtered.len() == 1 { filtered[0].clone() } else {
        let last = filtered.pop().unwrap();
        format!("{} y {}", filtered.join(", "), last)
      };
      format!("{} {}.", baseline_subject, joined)
    };
    Some(explanation)
  };

  // AI summary opcional + cache (con debug opcional)

// (continúa dentro de analyze_any_file)
  let semantic_summary = semantic_summary_heur.clone();
  let mut purpose_ai: Option<String> = None;
  let mut key_points_ai: Option<Vec<String>> = None;
  let sha_cur = sha256_hex(&bytes);
  let file_ai_debug = std::env::var("FILE_AI_DEBUG").ok().map(|v| v=="1" || v.eq_ignore_ascii_case("true")).unwrap_or(false);
  // Intento cargar .env si la clave no está
  if std::env::var("OPENAI_API_KEY").ok().filter(|v| !v.trim().is_empty()).is_none() { let _ = dotenvy::dotenv(); }
  if std::env::var("ENABLE_FILE_AI_SUMMARY").ok().as_deref() == Some("1") && bytes.len() < 200_000 {
    let mut need_call = true;
    if let Ok(mut map) = AI_CACHE.lock() {
      if let Some((ts,p,kps)) = map.get(&sha_cur) {
        if ts.elapsed().unwrap_or_default() < Duration::from_secs(AI_CACHE_TTL_SECS) {
          purpose_ai = Some(p.clone());
          key_points_ai = Some(kps.clone());
          need_call = false;
          if file_ai_debug { eprintln!("[file_ai] cache hit {}", &sha_cur[..8]); }
        } else { map.remove(&sha_cur); }
      }
    }
    if need_call {
      if let Ok(api_key) = std::env::var("OPENAI_API_KEY") {
        if let Ok(client) = reqwest::Client::builder().timeout(Duration::from_secs(8)).build() {
          let sample = if bytes.len() > 40_000 {
            let h = content.lines().take(120).collect::<Vec<_>>().join("\n");
            let t = content.lines().rev().take(120).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
            format!("[HEAD]\n{}\n[...OMITIDO...]\n[TAIL]\n{}", h, t)
          } else { content.to_string() };
          let prompt = format!(
            "Analiza el siguiente archivo y responde SOLO en JSON con campos: purpose, key_points.\nReglas estrictas:\n1. purpose = UNA frase que comience con 'Este archivo' o 'Este script' y describa con precisión la FUNCIÓN principal (qué hace, con qué datos externos interactúa, qué resultado produce).\n2. Evita descripciones triviales como 'Este archivo contiene X líneas' salvo que literalmente no haya lógica (solo texto estático).\n3. Si el archivo hace peticiones HTTP (requests.get/fetch/curl) dilo: qué endpoint o tipo de API y qué obtiene.\n4. Si obtiene la IP pública (ipify / api ip) indícalo explícitamente.\n5. Si solo imprime mensajes sin lógica extra, indícalo como 'imprime un mensaje de saludo', etc.\n6. key_points = 3-6 bullets concisos (sin punto final) sobre: flujo principal, entradas (parámetros, dependencias), salidas/efectos (prints, archivos, red), librerías clave, riesgos/errores potenciales. No repitas literal el purpose.\n7. Prohibido incluir conteos de líneas o tamaño salvo que NO exista otra función identificable.\n8. Nada fuera del JSON; no añadas explicación adicional.\n---\nNombre:{path}\nTamaño:{size}\nContenido:\n{c}\n---",
            path=path, size=bytes.len(), c=sample);
          let body = serde_json::json!({
            "model": std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-3.5-turbo".into()),
            "messages": [
              {"role":"system","content":"Eres un asistente que resume archivos en español."},
              {"role":"user","content": prompt}
            ],
            "temperature": 0.15,
            "max_tokens": 260
          });
          if let Ok(resp) = client.post("https://api.openai.com/v1/chat/completions").bearer_auth(api_key).json(&body).send().await {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
              if let Some(text) = json.pointer("/choices/0/message/content").and_then(|v| v.as_str()) {
                let trimmed = text.trim().trim_matches('`').trim_start_matches("json").trim();
                if let Ok(vj) = serde_json::from_str::<serde_json::Value>(trimmed) {
                  if let Some(p) = vj.get("purpose").and_then(|x| x.as_str()) { purpose_ai = Some(p.to_string()); }
                  if let Some(kpa) = vj.get("key_points").and_then(|x| x.as_array()) {
                    let mut vkp = Vec::new();
                    for item in kpa.iter().take(6) { if let Some(s) = item.as_str() { vkp.push(s.to_string()); } }
                    if !vkp.is_empty() { key_points_ai = Some(vkp); }
                  }
                  if file_ai_debug { eprintln!("[file_ai] AI OK {}", path); }
                } else if file_ai_debug { eprintln!("[file_ai] JSON inválido"); }
              } else if file_ai_debug { eprintln!("[file_ai] Respuesta sin contenido"); }
            } else if file_ai_debug { eprintln!("[file_ai] Falló parseo JSON resp"); }
          } else if file_ai_debug { eprintln!("[file_ai] Falló petición HTTP"); }
          if let (Some(p), Some(kps)) = (purpose_ai.clone(), key_points_ai.clone()) {
            if let Ok(mut map) = AI_CACHE.lock() {
              if map.len() >= AI_CACHE_MAX { map.retain(|_,(ts,_,_)| ts.elapsed().unwrap_or_default() < Duration::from_secs(AI_CACHE_TTL_SECS)); if map.len() >= AI_CACHE_MAX { if let Some(first_key) = map.keys().next().cloned() { map.remove(&first_key); } } }
              map.insert(sha_cur.clone(), (SystemTime::now(), p, kps)); if file_ai_debug { eprintln!("[file_ai] cache store {}", &sha_cur[..8]); }
            }
          } else if file_ai_debug { eprintln!("[file_ai] Sin purpose/key_points AI"); }
        } else if file_ai_debug { eprintln!("[file_ai] No se pudo crear cliente reqwest"); }
      } else if file_ai_debug { eprintln!("[file_ai] OPENAI_API_KEY no definida"); }
    }
  } else if file_ai_debug {
    if std::env::var("ENABLE_FILE_AI_SUMMARY").ok().as_deref() != Some("1") { eprintln!("[file_ai] desactivado (ENABLE_FILE_AI_SUMMARY!=1)"); }
    if bytes.len() >= 200_000 { eprintln!("[file_ai] tamaño excede límite IA"); }
  }
  // Detect language once for reuse
  let language = detect_language(Path::new(&path), &content);
  // Derivar propósito y puntos clave
  let mut key_points: Vec<String> = Vec::new();
  let mut purpose: Option<String> = purpose_ai.clone();
  let lang_for_points = language.clone().unwrap_or_else(|| "texto".into());
  // Puntos clave genéricos
  if !ai_only_mode {
    key_points.push(format!("Líneas: {}", line_count));
    key_points.push(format!("Tamaño: {} bytes", bytes.len()));
    if let Some(ref langl) = language { key_points.push(format!("Lenguaje: {}", langl)); }
  }
  // Añadir según detecciones previas en semantic_summary
  if let Some(ref sem) = semantic_summary {
    if sem.contains("GPIO") || sem.to_lowercase().contains("gpio") { key_points.push("Interactúa con GPIO".into()); }
  }
  // Heurística de propósito simplificada: primera cláusula de semantic_summary o fallback
  if !ai_only_mode && purpose.is_none() && purpose_ai.is_none() {
    if let Some(ref sem) = semantic_summary {
    let first_sentence = sem.split('.').next().unwrap_or(sem).trim();
    if !first_sentence.is_empty() { purpose = Some(first_sentence.to_string()); }
    }
  }
  if !ai_only_mode && purpose.is_none() { purpose = Some(format!("Archivo {} de {} líneas", lang_for_points, line_count)); }
  // Heurística adicional: si el propósito IA o heurístico es genérico y detectamos patrones específicos, reemplazar
  if let Some(ref ptxt) = purpose {
    let lower_all = content.to_lowercase();
    let generic = ptxt.contains("líneas") || ptxt.len() < 25; // muy corto o solo line count
    if generic {
      if (lower_all.contains("requests.get") || lower_all.contains("urllib") || lower_all.contains("fetch(")) && (lower_all.contains("ipify") || lower_all.contains("/ip") || lower_all.contains("api64.ipify.org")) {
        purpose = Some("Este archivo obtiene y muestra la dirección IP pública usando una petición HTTP a un servicio externo".to_string());
      } else if lower_all.contains("requests.get") && lower_all.contains("api") && lower_all.contains("json") {
        purpose = Some("Este archivo consume una API HTTP y muestra datos JSON obtenidos de la respuesta".to_string());
      } else if lower_all.contains("print(") && !lower_all.contains("def ") && line_count <= 20 {
        purpose = Some("Este archivo imprime mensajes simples en la salida estándar".to_string());
      }
    }
  }
  if let Some(ref kp_ai) = key_points_ai { key_points = kp_ai.clone(); }
  if !ai_only_mode {
    if key_points.len() > 6 { key_points.truncate(6); }
    if key_points.is_empty() { key_points.push("Sin rasgos destacados".into()); }
  } else {
    // En modo AI-only si no hay key_points AI, dejamos None para que UI no muestre heurísticas
    if key_points_ai.is_none() { key_points.clear(); }
  }
  // Construir narrativa tipo: "El usuario pidió analizar <archivo>. Este archivo ... Funciona de esta manera: ..."
  let narrative = if ai_only_mode { None } else {
    let mut parts: Vec<String> = Vec::new();
    if let Some(ref p) = purpose {
      parts.push(format!("Este archivo {}", p.to_lowercase().replacen("este archivo", "", 1).trim_start()));
    }
    if let Some(ref kp) = key_points_ai { // preferimos bullets IA si existen
      let bullets = kp.iter().map(|b| b.trim()).filter(|b| !b.is_empty()).collect::<Vec<_>>();
      if !bullets.is_empty() { parts.push(format!("Funciona de esta manera: {}.", bullets.join(", "))); }
    } else if !key_points.is_empty() {
      let bullets = key_points.iter().map(|b| b.trim()).filter(|b| !b.is_empty()).collect::<Vec<_>>();
      if !bullets.is_empty() { parts.push(format!("Funciona de esta manera: {}.", bullets.join(", "))); }
    }
    if parts.is_empty() { None } else { Some(parts.join(" ")) }
  };
  let analysis = FileAnalysis {
    path: path.clone(),
    language: language,
    line_count,
    size_bytes: bytes.len() as u64,
    sha256: sha_cur,
    head,
    tail,
    summary_hint,
    semantic_summary,
    purpose_from_ai: Some(purpose_ai.is_some()),
    purpose,
    key_points: if ai_only_mode { key_points_ai.clone() } else { Some(key_points) },
    narrative,
    ai_only: Some(ai_only_mode),
    candidates: None,
    disambiguation_required: Some(false),
  };
  Ok(AnalyzeFileResponse { analysis })
}

// Nota: plan_file_edit usa una heurística temporal para demostrar cambios mientras no se integra el modelo.
// Heurística: añade un bloque de comentario inicial con la instrucción si no existe ya una huella similar.
#[tauri::command]
pub fn plan_file_edit(req: PlanFileEditRequest) -> Result<PlanFileEditResponse, String> {
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
pub fn apply_file_edit(req: ApplyFileEditRequest) -> Result<ApplyFileEditResponse, String> {
  let _sec = SecurityManager::new();
  let p = PathBuf::from(&req.path);
  let existing = read_file_checked(&p)?;
  let existing_str = String::from_utf8_lossy(&existing);
  if existing_str == req.new_content { return Err("Nuevo contenido es idéntico al actual".into()); }
  // Backup
  let backup_path = backup_path_for(&p)?;
  fs::write(&backup_path, &existing).map_err(|e| format!("backup write error: {e}"))?;
  rotate_backups(&p);
  // Escribir nuevo
  fs::write(&p, req.new_content.as_bytes()).map_err(|e| format!("write error: {e}"))?;
  let sha256_new = sha256_hex(req.new_content.as_bytes());
  Ok(ApplyFileEditResponse { backup_path: backup_path.display().to_string(), bytes_written: req.new_content.len(), sha256_new })
}

#[tauri::command]
pub fn list_file_backups(path: String) -> Result<ListBackupsResponse, String> {
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
pub fn revert_file(req: RevertFileRequest) -> Result<RevertFileResponse, String> {
  let _sec = SecurityManager::new();
  let p = PathBuf::from(&req.path);
  let backups = list_backups_internal(&p);
  let target = backups.first().ok_or("No hay backups disponibles")?;
  let data = fs::read(target).map_err(|e| format!("read backup error: {e}"))?;
  fs::write(&p, &data).map_err(|e| format!("restore write error: {e}"))?;
  Ok(RevertFileResponse { restored_from: target.display().to_string() })
}
