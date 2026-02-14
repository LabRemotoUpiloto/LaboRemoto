use serde::{Serialize, Deserialize};
use std::{path::{Path, PathBuf}, fs, time::{Instant, Duration}};
use crate::cmd::search_shared::remote_search_ranked; // reutilizar búsqueda remota compartida
// (timeout import removed; not currently used)

// Acceso a sesiones SSH para modo remoto
use crate::cmd::state::SESSIONS;
use once_cell::sync::Lazy;
use parking_lot::RwLock;

// ------------------------- Índice cacheado -------------------------
#[derive(Debug, Clone)]
struct IndexEntry {
    path: PathBuf,
    file_name_lower: String,
    is_dir: bool,
    snippet: Option<String>,
    ext: Option<String>,
}

#[derive(Debug)]
struct IndexedData {
    entries: Vec<IndexEntry>,
    last_built: Instant,
    root: PathBuf,
}

static FILE_INDEX: Lazy<RwLock<Option<IndexedData>>> = Lazy::new(|| RwLock::new(None));

const INDEX_TTL: Duration = Duration::from_secs(30); // reconstruir cada 30s si hay cambios
const MAX_INDEX_FILE_SIZE: u64 = 32 * 1024; // 32KB para snippet

/// Intenta inferir una raíz de workspace local si no se proporcionó.
/// Simple: si `provided` está Some y existe, usarla. Si no, busca carpeta `apps` hacia arriba.
fn infer_workspace_root(provided: &Option<String>) -> PathBuf {
    if let Some(p) = provided {
        let pb = PathBuf::from(p);
        if pb.exists() { return pb; }
    }
    if let Ok(cwd) = std::env::current_dir() {
        for anc in cwd.ancestors() {
            let apps = anc.join("apps");
            if apps.exists() { return apps; }
        }
        return cwd;
    }
    PathBuf::from(".")
}

/// Petición para el comando `agent_plan`.
/// `workspace_root`: raíz donde se buscará (si None se intentará inferir). 
#[derive(Debug, Deserialize)]
pub struct AgentPlanRequest {
    pub session_id: Option<String>,
    pub user_message: String,
    pub workspace_root: Option<String>,
    /// Límite máximo de coincidencias a devolver (default 50)
    pub limit: Option<usize>,
}

/// Representa una coincidencia de búsqueda en el FS.
#[derive(Debug, Serialize)]
pub struct FsSearchMatch {
    pub path: String,
    pub file_name: String,
    pub is_dir: bool,
    pub snippet: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct GrepMatch {
    pub path: String,
    pub line: u32,
    pub snippet: String,
}

/// Resultado estructurado que la UI puede interpretar como una acción de herramienta.
/// Se usa tagging por campo `tool` para mantener compatibilidad con la forma previa
/// (fs_search mantendrá {"tool":"fs_search", "query":..., "matches": [...] }).
#[derive(Debug, Serialize)]
#[serde(tag = "tool", rename_all = "snake_case")]
pub enum ToolActionResult {
    FsSearch { query: String, matches: Vec<FsSearchMatch>, remote: bool },
    FsRead { path: String, content: String, remote: bool },
    FsGrep { query: String, matches: Vec<GrepMatch>, remote: bool },
}

/// Respuesta del comando `agent_plan`.
#[derive(Debug, Serialize)]
pub struct AgentPlanResponse {
    pub user_message: String,
    pub intent: String,                  // p.ej. "search" | "unknown"
    pub ai_response: String,             // Texto breve para mostrar al usuario
    pub tool_action: Option<ToolActionResult>,
    pub requires_confirmation: bool,     // Para futuras acciones que requieran confirmación
}

/// Normaliza texto: minúsculas, sin tildes, colapsa espacios.
fn normalize(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        let mapped = match ch {
            'á' | 'Á' => 'a',
            'é' | 'É' => 'e',
            'í' | 'Í' => 'i',
            'ó' | 'Ó' => 'o',
            'ú' | 'Ú' => 'u',
            'ñ' | 'Ñ' => 'n',
            _ => ch.to_ascii_lowercase(),
        };
        if mapped.is_alphanumeric() || mapped.is_whitespace() || mapped == '.' || mapped == '_' || mapped == '-' {
            out.push(mapped);
        } else {
            out.push(' ');
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Distancia de Levenshtein simplificada (coste uniforme) con early abort si excede max.
fn levenshtein_bounded(a: &str, b: &str, max: usize) -> Option<usize> {
    if a == b { return Some(0); }
    let (la, lb) = (a.chars().count(), b.chars().count());
    if la.abs_diff(lb) > max { return None; }
    let mut prev: Vec<usize> = (0..=lb).collect();
    let mut cur = vec![0; lb+1];
    for (i, ca) in a.chars().enumerate() {
        cur[0] = i+1;
        let mut row_min = cur[0];
        for (j, cb) in b.chars().enumerate() {
            let cost = if ca == cb { 0 } else { 1 };
            cur[j+1] = std::cmp::min(
                std::cmp::min(cur[j] + 1, prev[j+1] + 1),
                prev[j] + cost
            );
            if cur[j+1] < row_min { row_min = cur[j+1]; }
        }
        if row_min > max { return None; }
        std::mem::swap(&mut prev, &mut cur);
    }
    let d = prev[lb];
    if d <= max { Some(d) } else { None }
}

/// Heurística ampliada: detecta si aunque no haya palabras exactas, el usuario quiere buscar.
fn fuzzy_search_intent(n: &str) -> bool {
    // Palabras objetivo (normalizadas) y tolerancia a 2 errores.
    const TARGETS: &[&str] = &["buscar","busca","busqueda","bucar","busacr","busqeuar","search","find","encontrar","donde","dónde","grep","archivo","fichero","ubicar","ubicacion","ubicación"]; // incluye algunos typos comunes
    for token in n.split_whitespace() {
        for t in TARGETS { if levenshtein_bounded(token, t, 2).is_some() { return true; } }
    }
    // Consultas muy cortas (<=20 chars) sin verbos pero con patrón de nombre (tiene punto o guion bajo) también indican búsqueda.
    let len = n.len();
    if len <= 20 && (n.contains('.') || n.contains('_')) { return true; }
    false
}

/// Determina si se fuerza modo búsqueda exclusivo (no otras intenciones) mediante env SEARCH_MODE_EXCLUSIVE=1
fn search_mode_exclusive() -> bool {
    std::env::var("SEARCH_MODE_EXCLUSIVE").ok().map(|v| v=="1" || v.eq_ignore_ascii_case("true")).unwrap_or(false)
}

/// Detección de intención con soporte para: buscar archivo, abrir/leer archivo, grep contenido.
fn detect_intent(msg: &str) -> Option<String> {
    let n = normalize(msg);
    let grep_trigs = [
        "buscar texto", "busca texto", "contiene", "que tenga", "que contenga",
        "linea que dice", "linea que contiene", "línea que dice", "busca dentro",
        "grep", "en el codigo", "en el archivo", "buscar palabra", "buscar cadena"
    ];
    if grep_trigs.iter().any(|p| n.contains(p)) { return Some("grep".into()); }
    let search_trigs = [
        "donde esta", "donde esta el", "donde se encuentra", "buscar", "busca",
        "encuentra", "en que ruta", "en que carpeta", "ubicacion", "ubica",
        "en que parte", "en qué parte", "en que parte esta", "en qué parte está",
        "donde queda", "donde puedo ver"
    ];
    if search_trigs.iter().any(|p| n.contains(p)) { return Some("search".into()); }
    let open_trigs = ["abre", "abrir", "muestra", "mostrar", "ver", "muestrame", "ensename", "enséñame", "contenido de", "ver archivo", "ver el archivo"];
    if open_trigs.iter().any(|p| n.contains(p)) { return Some("open".into()); }
    // Heurística adicional: si hay un token con extensión típica (.<2-6 letras) considerar search aunque no haya trigger.
    for token in n.split_whitespace() { if let Some(idx)=token.rfind('.') { let ext=&token[idx+1..]; if ext.len()>=1 && ext.len()<=6 && ext.chars().all(|c| c.is_ascii_alphabetic()) { return Some("search".into()); } } }
    None
}

/// Detecta si el usuario pide explícitamente una búsqueda global (en todo el sistema / todas las carpetas)
fn detect_global_flag(msg: &str) -> bool {
    let n = normalize(msg);
    let triggers = [
        "global", "todo el sistema", "todas las carpetas", "en cualquier carpeta",
        "en todas partes", "busca en todo", "todo el arbol", "todo el árbol",
        "en cualquier ruta", "en cualquier sitio", "en cualquier directorio"
    ];
    triggers.iter().any(|t| n.contains(t))
}

/// Detecta si el usuario probablemente quiere coincidencia EXACTA de nombre de archivo.
/// Heurísticas:
/// - El mensaje contiene 'exacto' / 'exacta'.
/// - El usuario usó comillas.
/// - El término extraído no tiene espacios y contiene un '.' (suele ser archivo con extensión) o termina en una extensión típica.
fn detect_exact_filename(msg: &str, extracted: &str) -> bool {
    let n = normalize(msg);
    if n.contains("exacto") || n.contains("exacta") { return true; }
    if msg.contains('"') || msg.contains('\'') { return true; }
    let e = extracted.trim();
    if e.is_empty() { return false; }
    if !e.contains(' ') && e.contains('.') { return true; }
    false
}

/// Extrae un término de búsqueda heurístico a partir del mensaje.
fn extract_search_term(msg: &str) -> Option<String> {
    // 1. Capturar texto entre comillas si parece identificador / nombre compuesto
    if let Some(start) = msg.find('"') { if let Some(end_rel) = msg[start+1..].find('"') { let cand = &msg[start+1..start+1+end_rel]; if !cand.trim().is_empty() { return Some(cand.trim().to_string()); } } }
    if let Some(start) = msg.find('\'') { if let Some(end_rel) = msg[start+1..].find('\'') { let cand = &msg[start+1..start+1+end_rel]; if !cand.trim().is_empty() { return Some(cand.trim().to_string()); } } }

    // 2. Normalizar signos de puntuación a espacios (sin tocar _ o mayúsculas)
    let normalized = msg.replace(['?', '!', ',', ';', ':'], " ");
    let tokens: Vec<&str> = normalized.split_whitespace().collect();

    // 3. Después de palabra disparadora intentar encontrar el verdadero nombre (evitar 'que', 'se', 'llama', etc.) explorando hasta 4 tokens siguientes.
    let stop_follow = ["que","se","llama","llamado","que?","que.","que,","el","la"]; // comunes tras 'archivo'
    for (i, t) in tokens.iter().enumerate() {
        let t_low = t.to_ascii_lowercase();
        if ["archivo", "fichero", "file"].contains(&t_low.as_str()) {
            let mut best: Option<String> = None;
            for look in 1..=4 { // mirar hasta 4 tokens siguientes
                if let Some(cand_raw) = tokens.get(i + look) {
                    let cand = cand_raw.trim_matches(['"','\'']);
                    if cand.is_empty() { continue; }
                    let cand_low = cand.to_ascii_lowercase();
                    if stop_follow.contains(&cand_low.as_str()) { continue; }
                    let has_dot = cand.contains('.');
                    let has_snake = cand.contains('_');
                    let has_camel = cand.chars().zip(cand.chars().skip(1)).any(|(a,b)| a.is_ascii_lowercase() && b.is_ascii_uppercase());
                    if has_dot || has_snake || has_camel || cand.len() >= 3 {
                        best = Some(cand.to_string());
                        if has_dot { break; } // prefer filename con extensión
                    }
                }
            }
            if best.is_some() { return best; }
        }
    }

    // 4. Buscar tokens que parezcan camelCase (tienen minúscula seguida de mayúscula) o snake_case
    for t in tokens.iter().rev() {
        let has_camel = t.chars().zip(t.chars().skip(1)).any(|(a,b)| a.is_ascii_lowercase() && b.is_ascii_uppercase());
        let has_snake = t.contains('_');
        if has_camel || has_snake { return Some(t.trim_matches(['"', '\'']).to_string()); }
    }

    // 5. Fallback: última palabra con punto (archivo con extensión)
    for t in tokens.iter().rev() {
        if t.contains('.') { return Some(t.trim_matches(['"', '\'']).to_string()); }
    }

    // 6. Último recurso: token alfanumérico largo (>=5) con mezcla de mayúsculas/minúsculas
    for t in tokens.iter().rev() {
        if t.len() >= 5 && t.chars().any(|c| c.is_ascii_uppercase()) && t.chars().any(|c| c.is_ascii_lowercase()) {
            return Some(t.trim_matches(['"', '\'']).to_string());
        }
    }
    // 7. Nuevo fallback: última palabra "candidata" que parezca nombre de carpeta/archivo aunque no tenga extensión ni camelCase.
    // Criterios: alfanumérica + '_' + '-' + no estar en lista de stopwords comunes; longitud >=3
    let stop = [
        "donde","esta","esta?","está","el","la","los","las","en","que","qué","ruta","carpeta","directorio","buscar","busca","de" ,"un","una","dime","me","esta?","esta?" 
    ];
    for t in tokens.iter().rev() {
        let raw = t.trim_matches(['"','\'','?']);
        if raw.len() >= 3 && raw.chars().all(|c| c.is_ascii_alphanumeric() || c=='_' || c=='-' ) {
            let low = raw.to_ascii_lowercase();
            if !stop.contains(&low.as_str()) { return Some(raw.to_string()); }
        }
    }
    None
}

/// Búsqueda simple en el filesystem bajo una raíz.
/// Usa walkdir superficial con filtros básicos.
fn build_index(root: &Path) -> Vec<IndexEntry> {
    let mut entries = Vec::new();
    let walker = walkdir::WalkDir::new(root).max_depth(12);
    // Filtros se aplican dentro del loop
    for item in walker.into_iter().filter_map(|e| e.ok()) {
        let path = item.path();
        // Ignorar directorios pesados / no relevantes
        if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
            let lname = name.to_ascii_lowercase();
            if ["node_modules", "target", "dist", ".git", "build", "coverage"].contains(&lname.as_str()) {
                if path.is_dir() { continue; }
            }
        }
        let file_name = match path.file_name().and_then(|s| s.to_str()) { Some(v) => v, None => continue };
        let is_dir = path.is_dir();
        let file_name_lower = file_name.to_ascii_lowercase();
        let ext = if is_dir { None } else { path.extension().and_then(|s| s.to_str()).map(|e| e.to_ascii_lowercase()) };
        let mut snippet = None;
        if !is_dir {
            if let Ok(meta) = path.metadata() {
                if meta.len() <= MAX_INDEX_FILE_SIZE {
                    if let Ok(content) = fs::read_to_string(path) {
                        if let Some(first_line) = content.lines().find(|l| !l.trim().is_empty()) {
                            let preview = if first_line.len() > 120 { format!("{}...", &first_line[..120]) } else { first_line.to_string() };
                            snippet = Some(preview);
                        }
                    }
                }
            }
        }
        entries.push(IndexEntry { path: path.to_path_buf(), file_name_lower, is_dir, snippet, ext });
    }
    entries
}

fn ensure_index(root: &Path) {
    let mut guard = FILE_INDEX.write();
    let rebuild = match &*guard {
        None => true,
        Some(data) => data.root != root || data.last_built.elapsed() > INDEX_TTL,
    };
    if rebuild {
        let entries = build_index(root);
        *guard = Some(IndexedData { entries, last_built: Instant::now(), root: root.to_path_buf() });
    }
}

fn fs_search(root: &Path, needle: &str, ext_filter: Option<&str>, limit: usize, exact: bool) -> Vec<FsSearchMatch> {
    ensure_index(root);
    let guard = FILE_INDEX.read();
    let mut results = Vec::new();
    if needle.is_empty() { return results; }
    let nn = needle.to_ascii_lowercase();
    let ef = ext_filter.map(|e| e.trim_start_matches('.').to_ascii_lowercase());
    if let Some(data) = &*guard {
        for e in data.entries.iter() {
            if results.len() >= limit { break; }
            if let Some(ref need_ext) = ef {
                if e.ext.as_deref() != Some(need_ext) { continue; }
            }
            let matches = if exact { e.file_name_lower == nn } else { e.file_name_lower.contains(&nn) };
            if matches {
                results.push(FsSearchMatch {
                    path: e.path.display().to_string(),
                    file_name: e.path.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string(),
                    is_dir: e.is_dir,
                    snippet: e.snippet.clone(),
                });
            }
        }
    }
    results.sort_by(|a,b| {
        match (a.is_dir, b.is_dir) {
            (false,true) => std::cmp::Ordering::Less,
            (true,false) => std::cmp::Ordering::Greater,
            _ => a.file_name.to_ascii_lowercase().cmp(&b.file_name.to_ascii_lowercase())
        }
    });
    results
}

// ------------------------- Ejecución remota (ssh2) -------------------------

/// Sanitiza un término para inyectarlo de forma segura en comandos simples.
fn sanitize_term(term: &str) -> String {
    let trimmed = term.trim();
    if trimmed.is_empty() { return String::new(); }
    if trimmed.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-' ) {
        trimmed.to_string()
    } else {
        let escaped = trimmed.replace("'", "'\\''");
        format!("'{}'", escaped)
    }
}

/// Obtiene el current_dir almacenado en la sesión (si existe)
fn get_session_current_dir(session_id: &str) -> Option<String> {
    match SESSIONS.lock() {
        Ok(map) => map.get(session_id).and_then(|s| s.current_dir.clone()),
        Err(_) => None,
    }
}

/// Obtiene el directorio base para búsqueda contextual: current_dir o, si no existe, $HOME (fallback a pwd)

/// Sanitiza la ruta para uso en `cd <ruta>`; permite caracteres seguros y escapa comillas simples.
fn sanitize_cd_path(path: &str) -> String {
    if path.is_empty() { return ".".into(); }
    if path.chars().all(|c| c.is_ascii_alphanumeric() || c == '/' || c == '_' || c == '-' || c == '.' || c == '~') {
        path.to_string()
    } else {
        format!("'{}'", path.replace("'", "'\\''"))
    }
}

/// Obtiene (o crea) una sesión ssh2 reutilizable igual que hace el módulo SFTP.
fn get_or_connect_ssh2(id: &str) -> Result<std::sync::Arc<std::sync::Mutex<crate::cmd::state::CachedSsh2>>, String> {
    use crate::cmd::state::SESSIONS;
    let mut map = SESSIONS.lock().map_err(|e| e.to_string())?;
    // Reutilizar lógica similar a sftp.rs (duplicamos mínima parte para evitar dependencia cruzada compleja)
    if let Some(existing) = map.get(id).and_then(|s| s.sftp_cached.clone()) { return Ok(existing); }
    let (host, port, user, password) = {
        let s = map.get(id).ok_or_else(|| "sesión no encontrada".to_string())?;
        (s.host.clone(), s.port, s.user.clone(), s.password.clone())
    };
    let (tcp, sess) = crate::ssh::ssh2_sftp::connect_password(&host, port, &user, &password).map_err(|e| e.to_string())?;
    let arc = std::sync::Arc::new(std::sync::Mutex::new(crate::cmd::state::CachedSsh2 { tcp, sess }));
    if let Some(s) = map.get_mut(id) { s.sftp_cached = Some(arc.clone()); }
    Ok(arc)
}

/// Ejecuta un comando remoto capturando stdout+stderr (limitado en tiempo y tamaño básico).
fn ssh2_exec_capture(blocking_guard: &mut ssh2::Session, command: &str, timeout_ms: u64) -> Result<String, String> {
    use std::io::Read;
    let mut channel = blocking_guard.channel_session().map_err(|e| e.to_string())?;
    channel.exec(command).map_err(|e| e.to_string())?;
    let start = Instant::now();
    let mut buf = Vec::new();
    let mut tmp = [0u8; 16 * 1024];
    while !channel.eof() {
        if start.elapsed() > Duration::from_millis(timeout_ms) { break; }
        match channel.read(&mut tmp) {
            Ok(0) => break,
            Ok(n) => buf.extend_from_slice(&tmp[..n]),
            Err(e) => {
                let es = e.to_string();
                if es.contains("WouldBlock") { std::thread::sleep(std::time::Duration::from_millis(10)); continue; }
                break;
            }
        }
    }
    let _ = channel.wait_close();
    Ok(String::from_utf8_lossy(&buf).to_string())
}

/// Búsqueda unificada (contextual + fallback global).
// Eliminada implementación interna remote_search_unified en favor de remote_search_ranked (módulo compartido)

fn remote_grep_ssh2(session_id: &str, pattern: &str, limit: usize) -> Result<Vec<GrepMatch>, String> {
    if pattern.is_empty() { return Ok(Vec::new()); }
    let pat_escaped = sanitize_term(pattern);
    let base_cmd = format!(
        "grep -R -n -i --exclude-dir=node_modules --exclude-dir=target --exclude-dir=dist --exclude-dir=build --exclude-dir=coverage --exclude-dir=.git -m {limit} {pat} . 2>/dev/null | head -n {limit}",
        limit = limit,
        pat = pat_escaped
    );
    let cmd = if let Some(cd) = get_session_current_dir(session_id) { format!("cd {} && {}", sanitize_cd_path(&cd), base_cmd) } else { base_cmd };
    let output = {
        let arc = get_or_connect_ssh2(session_id)?;
        let mut guard = arc.lock().map_err(|e| format!("Failed to lock SSH session: {}", e))?;
        ssh2_exec_capture(&mut guard.sess, &cmd, 5000)?
    };
    let mut res = Vec::new();
    for line in output.lines() {
        if let Some(idx1) = line.find(':') { if let Some(idx2_rel) = line[idx1+1..].find(':') {
            let idx2 = idx1 + 1 + idx2_rel;
            let path = &line[..idx1];
            let line_no = &line[idx1+1..idx2];
            let content = &line[idx2+1..];
            if let Ok(num) = line_no.parse::<u32>() {
                let snippet = if content.len() > 160 { format!("{}...", &content[..160]) } else { content.to_string() };
                res.push(GrepMatch { path: path.to_string(), line: num, snippet });
            }
        }}
        if res.len() >= limit { break; }
    }
    Ok(res)
}

fn remote_read_ssh2(session_id: &str, path: &str, max_bytes: usize) -> Result<String, String> {
    if path.trim().is_empty() { return Err("ruta vacía".into()); }
    let base_cmd = format!("head -c {} {} 2>/dev/null", max_bytes, sanitize_term(path));
    let cmd = if let Some(cd) = get_session_current_dir(session_id) { format!("cd {} && {}", sanitize_cd_path(&cd), base_cmd) } else { base_cmd };
    let output = {
        let arc = get_or_connect_ssh2(session_id)?;
        let mut guard = arc.lock().map_err(|e| format!("Failed to lock SSH session: {}", e))?;
        ssh2_exec_capture(&mut guard.sess, &cmd, 4000)?
    };
    Ok(output)
}

fn fs_read_file(path: &Path, max_bytes: usize) -> Option<String> {
    if !path.is_file() { return None; }
    match fs::read_to_string(path) {
        Ok(mut content) => {
            if content.len() > max_bytes { content.truncate(max_bytes); }
            Some(content)
        },
        Err(_) => None,
    }
}

fn fs_grep(root: &Path, needle: &str, limit_total: usize) -> Vec<GrepMatch> {
    ensure_index(root);
    let mut out = Vec::new();
    if needle.is_empty() { return out; }
    let pattern = needle.to_ascii_lowercase();
    let guard = FILE_INDEX.read();
    if let Some(data) = &*guard {
        'entries: for e in data.entries.iter() {
            if out.len() >= limit_total { break; }
            if e.is_dir { continue; }
            if let Ok(meta) = e.path.metadata() { if meta.len() > 512 * 1024 { continue; } }
            if let Ok(content) = fs::read_to_string(&e.path) {
                for (idx, line) in content.lines().enumerate() {
                    if out.len() >= limit_total { break 'entries; }
                    if line.to_ascii_lowercase().contains(&pattern) {
                        let snippet = if line.len() > 160 { format!("{}...", &line[..160]) } else { line.to_string() };
                        out.push(GrepMatch { path: e.path.display().to_string(), line: (idx as u32) + 1, snippet });
                    }
                }
            }
        }
    }
    out
}

#[tauri::command]
pub async fn agent_plan(req: AgentPlanRequest) -> Result<AgentPlanResponse, String> {
    let intent_detected = detect_intent(&req.user_message);
    let norm_msg = normalize(&req.user_message);
    let mut intent = intent_detected.clone();
    // Fuzzy fallback: si no se detectó pero parece búsqueda, asignar "search".
    if intent.is_none() && fuzzy_search_intent(&norm_msg) { intent = Some("search".into()); }
    // Modo exclusivo: cualquier cosa que parezca búsqueda (incluso si habría abierto) se fuerza a search.
    if search_mode_exclusive() && intent.as_deref() != Some("grep") {
        if fuzzy_search_intent(&norm_msg) { intent = Some("search".into()); }
    }
    let intent = intent; // sombrear final
    if std::env::var("SEARCH_INTENT_DEBUG").ok().as_deref()==Some("1") {
        #[cfg(debug_assertions)]
        eprintln!("[search_intent] raw='{}' norm='{}' detected={:?}", req.user_message, norm_msg, intent_detected);
    }
    let root = infer_workspace_root(&req.workspace_root);
    // ¿Existe sesión SSH para modo remoto? (simplemente comprobar que session_id esté en el mapa)
    let remote_mode = if let Some(ref sid) = req.session_id {
        match SESSIONS.lock() {
            Ok(sessions) => sessions.contains_key(sid),
            Err(_) => false,
        }
    } else { false };
    match intent.as_deref() {
        Some("search") => {
            let raw_term = extract_search_term(&req.user_message).unwrap_or_else(|| "".into());
            let exact_flag = detect_exact_filename(&req.user_message, &raw_term);
            // Si exacta, no se separa extensión para no degradar la coincidencia.
            let (term, ext_filter) = if exact_flag { (raw_term.clone(), None) } else if let Some(idx) = raw_term.rfind('.') {
                let ext = &raw_term[idx+1..];
                if !ext.is_empty() && ext.len() <= 6 { (raw_term[..idx].to_string(), Some(ext.to_string())) } else { (raw_term.clone(), None) }
            } else { (raw_term.clone(), None) };
            let limit = req.limit.unwrap_or(50);
            let matches = if remote_mode {
                if let Some(sid) = &req.session_id {
                    let _global_flag = detect_global_flag(&req.user_message);
                    let msg_norm = normalize(&req.user_message);
                    let dir_trigs = ["carpeta", "carpetas", "directorio", "directorio global", "folder", "folders", "directorio global", "solo directorios"];
                    let dir_only = dir_trigs.iter().any(|d| msg_norm.contains(d));
                    let _exact_c = exact_flag; // mover al closure
                    tokio::task::spawn_blocking({ let sid = sid.clone(); let t_raw = raw_term.clone(); let t = term.clone(); let limit = limit; let dir_only = dir_only; move || {
                        let search_term = if t.is_empty() { t_raw } else { t };
                        // Usar búsqueda compartida (ranking). Luego mapear a FsSearchMatch.
                        let ranked = remote_search_ranked(&sid, &search_term, limit).unwrap_or_default();
                        let mut mapped: Vec<FsSearchMatch> = ranked.into_iter().map(|m| FsSearchMatch { path: m.path, file_name: m.file_name, is_dir: m.is_dir, snippet: None }).collect();
                        if dir_only { mapped.retain(|m| m.is_dir); }
                        mapped
                    }}).await.unwrap_or_default()
                } else { Vec::new() }
            } else {
                fs_search(&root, if term.is_empty() { &raw_term } else { &term }, ext_filter.as_deref(), limit, exact_flag)
            };
            let total = matches.len();
            let display_term = if raw_term.is_empty() { "(vacío)".to_string() } else { raw_term.clone() };
            let ai_response = if total == 0 {
                format!("No se encontraron coincidencias para '{}'.", display_term)
            } else {
                format!("Encontrado {} coincidencia(s) para '{}'.", total, display_term)
            };
            let action = ToolActionResult::FsSearch { query: raw_term.clone(), matches, remote: remote_mode };
            Ok(AgentPlanResponse { user_message: req.user_message, intent: "search".into(), ai_response, tool_action: Some(action), requires_confirmation: false })
        },
        Some("open") => {
            // Intent de leer archivo: intentar extraer término y luego localizar coincidencia exacta (si una sola) y leer.
            let raw_term = extract_search_term(&req.user_message).unwrap_or_else(|| "".into());
            let exact_flag = detect_exact_filename(&req.user_message, &raw_term);
            if remote_mode {
                if let Some(sid) = &req.session_id {
                    let matches = tokio::task::spawn_blocking({ let sid = sid.clone(); let term = raw_term.clone(); move || {
                        remote_search_ranked(&sid, &term, 20).unwrap_or_default().into_iter()
                            .map(|m| FsSearchMatch { path: m.path, file_name: m.file_name, is_dir: m.is_dir, snippet: None })
                            .collect::<Vec<_>>()
                    }}).await.unwrap_or_default();
                    if let Some(file) = matches.iter().find(|m| !m.is_dir && m.file_name.eq_ignore_ascii_case(&raw_term))
                        .or_else(|| matches.iter().find(|m| !m.is_dir)) {
                        let content = tokio::task::spawn_blocking({ let sid = sid.clone(); let path = file.path.clone(); move || {
                            remote_read_ssh2(&sid, &path, 16 * 1024).unwrap_or_else(|_| "(No se pudo leer o vacío)".into())
                        }}).await.unwrap_or_else(|_| "(No se pudo leer o vacío)".into());
                        let ai_response = format!("Contenido preliminar de '{}': primeras {} bytes.", file.file_name, content.len());
                        let action = ToolActionResult::FsRead { path: file.path.clone(), content, remote: true };
                        return Ok(AgentPlanResponse { user_message: req.user_message, intent: "open".into(), ai_response, tool_action: Some(action), requires_confirmation: false });
                    } else {
                        let ai_response = if raw_term.is_empty() { "No pude determinar el archivo a abrir.".to_string() } else { format!("No encontré un archivo para '{}'.", raw_term) };
                        return Ok(AgentPlanResponse { user_message: req.user_message, intent: "open".into(), ai_response, tool_action: None, requires_confirmation: false });
                    }
                }
                let ai_response = "Sesión remota no disponible".to_string();
                Ok(AgentPlanResponse { user_message: req.user_message, intent: "open".into(), ai_response, tool_action: None, requires_confirmation: false })
            } else {
                let matches = fs_search(&root, &raw_term, None, 20, exact_flag);
                if let Some(file) = matches.iter().find(|m| !m.is_dir && m.file_name.eq_ignore_ascii_case(&raw_term))
                    .or_else(|| matches.iter().find(|m| !m.is_dir)) {
                    let content = fs_read_file(Path::new(&file.path), 16 * 1024).unwrap_or_else(|| "(No se pudo leer o vacío)".into());
                    let ai_response = format!("Contenido preliminar de '{}': primeras {} bytes.", file.file_name, content.len());
                    let action = ToolActionResult::FsRead { path: file.path.clone(), content, remote: false };
                    Ok(AgentPlanResponse { user_message: req.user_message, intent: "open".into(), ai_response, tool_action: Some(action), requires_confirmation: false })
                } else {
                    let ai_response = if raw_term.is_empty() { "No pude determinar el archivo a abrir.".to_string() } else { format!("No encontré un archivo para '{}'.", raw_term) };
                    Ok(AgentPlanResponse { user_message: req.user_message, intent: "open".into(), ai_response, tool_action: None, requires_confirmation: false })
                }
            }
        },
        Some("grep") => {
            // Extraer término entre comillas si existe
            let msg = &req.user_message;
            let term = if let Some(start) = msg.find('"') { if let Some(end_rel) = msg[start+1..].find('"') { msg[start+1..start+1+end_rel].to_string() } else { "".into() } } else { "".into() };
            let search_term = if term.is_empty() { extract_search_term(msg).unwrap_or_else(|| "".into()) } else { term.clone() };
            if remote_mode {
                if let Some(sid) = &req.session_id {
                    let matches = tokio::task::spawn_blocking({ let sid = sid.clone(); let term = search_term.clone(); let limit = req.limit.unwrap_or(80); move || {
                        remote_grep_ssh2(&sid, &term, limit).unwrap_or_default()
                    }}).await.unwrap_or_default();
                    let total = matches.len();
                    let ai_response = if total == 0 { format!("No hubo coincidencias de '{}' (remoto).", search_term) } else { format!("{} coincidencia(s) de '{}' (remoto, límite).", total, search_term) };
                    let action = ToolActionResult::FsGrep { query: search_term.clone(), matches, remote: true };
                    return Ok(AgentPlanResponse { user_message: req.user_message, intent: "grep".into(), ai_response, tool_action: Some(action), requires_confirmation: false });
                }
                let ai_response = "Sesión remota no disponible".to_string();
                Ok(AgentPlanResponse { user_message: req.user_message, intent: "grep".into(), ai_response, tool_action: None, requires_confirmation: false })
            } else {
                let matches = fs_grep(&root, &search_term, req.limit.unwrap_or(80));
                let total = matches.len();
                let ai_response = if total == 0 { format!("No hubo coincidencias de '{}' en archivos indexados.", search_term) } else { format!("{} coincidencia(s) de '{}' (mostrando hasta límite).", total, search_term) };
                let action = ToolActionResult::FsGrep { query: search_term.clone(), matches, remote: false };
                Ok(AgentPlanResponse { user_message: req.user_message, intent: "grep".into(), ai_response, tool_action: Some(action), requires_confirmation: false })
            }
        },
        _ => {
            let msg = if search_mode_exclusive() {
                "No se puede realizar esa búsqueda: no se encontró archivo/directorio. (Modo solo búsqueda)"
            } else {
                "No se puede realizar esa búsqueda: no se encontró archivo/directorio."
            };
            // En modo exclusivo devolvemos intent=search para mantener semántica de UI centrada en búsquedas, pero sin sugerencias extra.
            if search_mode_exclusive() {
                return Ok(AgentPlanResponse { user_message: req.user_message, intent: "search".into(), ai_response: msg.into(), tool_action: None, requires_confirmation: false });
            }
            Ok(AgentPlanResponse { user_message: req.user_message, intent: "unknown".into(), ai_response: msg.into(), tool_action: None, requires_confirmation: false })
        }
    }
}
