/// Utilidades compartidas para normalización de contenido AI.
/// Mantener libres de dependencias externas para reducir tiempo de compilación.

use serde::{Serialize, Deserialize};

use once_cell::sync::Lazy;
use std::sync::Mutex;

// Helper centralizado para obtener la API key saneada.
pub fn get_openai_api_key() -> Option<String> {
    // Cargar .env una vez por proceso (dotenvy es idempotente, pero evitamos ruido)
    static DID_DOTENV: Lazy<Mutex<bool>> = Lazy::new(|| Mutex::new(false));
    if let Ok(mut g) = DID_DOTENV.lock() { if !*g { let _ = dotenvy::dotenv(); *g = true; } }
    let raw = std::env::var("OPENAI_API_KEY").ok()?;
    let trimmed = raw.trim().trim_matches('\'').trim_matches('"').to_string();
    if trimmed.is_empty() { return None; }
    // Longitud mínima aproximada de claves modernas (>= 40)
    if trimmed.len() < 40 { return None; }
    Some(trimmed)
}

#[derive(Serialize, Deserialize)]
pub struct AiEnvStatus { pub has_key: bool, pub model: Option<String>, pub key_prefix: Option<String>, pub length: Option<u32>, pub warning: Option<String> }

#[tauri::command]
pub fn ai_env_status() -> Result<AiEnvStatus, String> {
    let key_opt = get_openai_api_key();
    let model = std::env::var("OPENAI_MODEL").ok();
    let debug = std::env::var("FILE_AI_DEBUG").ok().map(|v| v=="1" || v.eq_ignore_ascii_case("true")).unwrap_or(false);
    let mut warning = None;
    let mut key_prefix = None;
    let mut length = None;
    if let Some(k) = key_opt.as_ref() {
        length = Some(k.len() as u32);
        if debug { key_prefix = Some(k.chars().take(8).collect()); }
        if !k.starts_with("sk-") { warning = Some("La clave no empieza con 'sk-' (verifica que sea una API key válida)".into()); }
    } else {
        warning = Some("No se detectó OPENAI_API_KEY válida".into());
    }
    Ok(AiEnvStatus { has_key: key_opt.is_some(), model, key_prefix, length, warning })
}

/// Forzar uso de python3 y pip mediante `python3 -m pip` en fragmentos de texto.
/// Se basa en reemplazos simples para minimizar falsos positivos.
pub fn force_python3_everywhere(s: &str) -> String {
    let mut out = s.to_string();
    // Shebangs
    out = out.replace("#!/usr/bin/env python\r\n", "#!/usr/bin/env python3\r\n");
    out = out.replace("#!/usr/bin/env python\n", "#!/usr/bin/env python3\n");
    out = out.replace("#!/usr/bin/python\r\n", "#!/usr/bin/python3\r\n");
    out = out.replace("#!/usr/bin/python\n", "#!/usr/bin/python3\n");
    // Comandos comunes (espacios para evitar colisiones con nombres de archivo)
    out = out.replace(" python -m pip ", " python3 -m pip ");
    out = out.replace(" python -m venv ", " python3 -m venv ");
    out = out.replace(" pip install ", " python3 -m pip install ");
    out = out.replace(" pip3 install ", " python3 -m pip install ");
    // Ejecutar scripts
    out = out.replace(" python ", " python3 ");
    // Líneas nuevas
    out = out.replace("\npython ", "\npython3 ");
    out = out.replace("\npip ", "\npython3 -m pip ");
    out = out.replace("\npip3 ", "\npython3 -m pip ");
    // Inicio absoluto
    if out.starts_with("python ") { out = out.replacen("python ", "python3 ", 1); }
    if out.starts_with("pip ") { out = out.replacen("pip ", "python3 -m pip ", 1); }
    if out.starts_with("pip3 ") { out = out.replacen("pip3 ", "python3 -m pip ", 1); }
    out
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AiTestKeyResult {
    pub ok: bool,
    pub http_status: u16,
    pub auth_error: bool,
    pub rate_limited: bool,
    pub body_snippet: Option<String>,
    pub model_used: String,
    pub message: Option<String>,
}

#[tauri::command]
pub async fn ai_test_key() -> Result<AiTestKeyResult, String> {
    let key = get_openai_api_key().ok_or_else(|| "OPENAI_API_KEY no encontrada".to_string())?;
    let model = std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-3.5-turbo".to_string());
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(8)).build().map_err(|e| e.to_string())?;
    let body = serde_json::json!({
        "model": model,
        "messages": [
          {"role": "user", "content": "Ping"}
        ],
        "max_tokens": 5,
        "temperature": 0.0
    });
    let resp = client.post("https://api.openai.com/v1/chat/completions").bearer_auth(&key).json(&body).send().await.map_err(|e| format!("http error: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    let snippet = Some(text.chars().take(240).collect::<String>());
    let auth_error = status.as_u16() == 401;
    let rate_limited = status.as_u16() == 429;
    let mut message = None;
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
        if let Some(m) = v.pointer("/error/message").and_then(|x| x.as_str()) { message = Some(m.to_string()); }
    }
    Ok(AiTestKeyResult { ok: status.is_success(), http_status: status.as_u16(), auth_error, rate_limited, body_snippet: snippet, model_used: model, message })
}

#[cfg(test)]
mod tests {
    use super::force_python3_everywhere;

    #[test]
    fn replaces_basic_invocations() {
        let input = "python script.py\npip install requests\n#!/usr/bin/env python\n";
        let out = force_python3_everywhere(input);
        assert!(out.contains("python3 script.py"));
        assert!(out.contains("python3 -m pip install requests"));
        assert!(out.contains("#!/usr/bin/env python3"));
    }
}
