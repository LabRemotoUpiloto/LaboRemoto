//! Carga de variables de entorno (.env) para el chat de IA.

use std::path::Path;

// Carga forzada única desde apps/.env (raíz relativa: subir dos niveles desde src-tauri)
pub(super) fn force_load_single_env() {
  let debug = std::env::var("FILE_AI_DEBUG").ok().as_deref() == Some("1");
  // Intentar localizar apps/.env partiendo de current_exe o current_dir
  let mut candidate_paths: Vec<String> = Vec::new();
  if let Ok(exe) = std::env::current_exe() {
    if let Some(parent) = exe.parent() { // .../src-tauri/target/debug
      // subir hasta encontrar "apps" y luego .env
      let apps_env = parent
        .ancestors()
        .find(|p| p.file_name().map(|n| n == "apps").unwrap_or(false))
        .map(|apps_dir| apps_dir.join(".env"));
      if let Some(p) = apps_env { candidate_paths.push(p.display().to_string()); }
    }
  }
  if let Ok(cwd) = std::env::current_dir() {
    // Caso desarrollo: normalmente cwd = .../apps/desktop/src-tauri
    // 1. Probar en el directorio actual (.env local)
    let local_env = cwd.join(".env");
    candidate_paths.push(local_env.display().to_string());

    // 2. Probar en el directorio "apps" si existe en la jerarquía
    let apps_candidate = cwd
      .ancestors()
      .find(|p| p.file_name().map(|n| n == "apps").unwrap_or(false))
      .map(|a| a.join(".env"));
    if let Some(p) = apps_candidate { let disp = p.display().to_string(); if !candidate_paths.contains(&disp) { candidate_paths.push(disp); } }
  }
  // Si no encontramos nada, intentar relativo: ../../.env respecto a src-tauri (desarrollo)
  if candidate_paths.is_empty() {
    if let Ok(cwd) = std::env::current_dir() {
      let fallback = cwd.join("..").join("..").join(".env");
      candidate_paths.push(fallback.display().to_string());
    }
  }
  for path_str in candidate_paths {
    let p = Path::new(&path_str);
    if p.exists() {
      if debug { let _ = p.display(); }
      // En lugar de confiar únicamente en dotenv (que puede dejar el antiguo si ya estaba seteado
      // dependiendo de ciertas variantes), parseamos manualmente y sobreescribimos.
      if let Ok(content) = std::fs::read_to_string(p) {
        for line in content.lines() {
          let line = line.trim();
            if line.is_empty() || line.starts_with('#') { continue; }
            if let Some(eq_idx) = line.find('=') {
              let (k, v_raw) = line.split_at(eq_idx);
              let key = k.trim();
              let val = v_raw[1..].trim();
              // Buscar múltiples variantes de la API key de OpenAI
              if ["OPENAI_API_KEY", "OPENAI_API_KEY1", "OPENAI_API_KEY2", "OPENAI_API_KEY3P"].contains(&key) {
                std::env::set_var("OPENAI_API_KEY", val);
                if debug { let _ = (key, p.display()); }
              } else if ["CLAUDE_API_KEY", "CLAUDE_CODE_API_KEY", "ANTHROPIC_API_KEY"].contains(&key) {
                std::env::set_var("CLAUDE_API_KEY", val);
                if debug { let _ = (key, p.display()); }
              }
            }
        }
      } else if debug { let _ = p.display(); }
      break; // solo el primero válido
    } else if debug { let _ = p.display(); }
  }
  // Si aún no está set, intentar dotenv() (por si ejecutan desde raíz y .env ya está ahí)
  if std::env::var("OPENAI_API_KEY").ok().map(|v| v.trim().is_empty()).unwrap_or(true) {
    let _ = dotenvy::dotenv();
  }
  if debug {
    let _ = std::env::var("OPENAI_API_KEY");
  }
}
