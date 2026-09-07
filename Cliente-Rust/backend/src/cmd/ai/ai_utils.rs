/// Utilidades compartidas para normalización de contenido AI.
/// Mantener libres de dependencias externas para reducir tiempo de compilación.

use serde::{Serialize, Deserialize};

use once_cell::sync::Lazy;
use std::sync::Mutex;

use crate::cmd::protocol::CommandError;

// Perf: un único `reqwest::Client` compartido para todas las llamadas HTTP
// de este módulo, en vez de construir uno nuevo (y perder el pool de
// conexiones TCP/TLS) en cada función.
static HTTP_CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap_or_default()
});

/// Helper centralizado para obtener la API key de Groq.
pub fn get_groq_api_key() -> Option<String> {
    // Cargar .env una vez por proceso (dotenvy es idempotente)
    static DID_DOTENV: Lazy<Mutex<bool>> = Lazy::new(|| Mutex::new(false));
    if let Ok(mut g) = DID_DOTENV.lock() { if !*g { let _ = dotenvy::dotenv(); *g = true; } }

    if let Ok(raw) = std::env::var("GROQ_API_KEY") {
        let trimmed = raw.trim().trim_matches('\'').trim_matches('"').to_string();
        if !trimmed.is_empty() && trimmed.len() >= 20 {
            return Some(trimmed);
        }
    }
    // Fallback a clave embebida en tiempo de compilación
    if let Some(baked) = option_env!("COMPILED_GROQ_KEY") {
        let trimmed = baked.trim().trim_matches('\'').trim_matches('"').to_string();
        if !trimmed.is_empty() && trimmed.len() >= 20 { return Some(trimmed); }
    }
    None
}

/// Retorna el endpoint de Groq (compatible con OpenAI).
/// Siempre apunta a api.groq.com — no hay enrutamiento a otros proveedores.
pub fn resolve_groq_endpoint() -> (String, Option<String>) {
    (
        "https://api.groq.com/openai/v1/chat/completions".to_string(),
        get_groq_api_key(),
    )
}

/// Alias de compatibilidad: resuelve endpoint de chat (Groq)
pub fn resolve_openai_endpoint(_model: &str) -> (String, Option<String>, bool) {
    let (url, key) = resolve_groq_endpoint();
    (url, key, false)
}

/// Alias para compatibilidad con código existente
pub fn get_openai_api_key() -> Option<String> {
    if let Ok(raw) = std::env::var("OPENAI_API_KEY") {
        let trimmed = raw.trim().trim_matches('\'').trim_matches('"').to_string();
        if !trimmed.is_empty() && trimmed.len() >= 20 {
            return Some(trimmed);
        }
    }
    get_groq_api_key()
}

/// Alias para compatibilidad con código existente
pub fn get_claude_api_key() -> Option<String> {
    if let Ok(raw) = std::env::var("CLAUDE_API_KEY") {
        let trimmed = raw.trim().trim_matches('\'').trim_matches('"').to_string();
        if !trimmed.is_empty() && trimmed.len() >= 20 {
            return Some(trimmed);
        }
    }
    get_groq_api_key()
}

/// Comprime la salida del terminal para reducir tokens al enviarse como contexto IA.
/// - Elimina códigos ANSI de escape
/// - Deduplica líneas consecutivas idénticas
/// - Mantiene las últimas 40 líneas no vacías
/// - Limita a 1200 caracteres totales (conservando las líneas más recientes)
pub fn compress_terminal_context(raw: &str) -> String {
    const MAX_LINES: usize = 40;
    const MAX_CHARS: usize = 1200;

    // Eliminar códigos ANSI (ESC[ ... letra_final)
    let clean = {
        let mut out = String::with_capacity(raw.len());
        let mut chars = raw.chars().peekable();
        while let Some(ch) = chars.next() {
            if ch == '\x1b' {
                match chars.peek() {
                    Some('[') => {
                        chars.next();
                        loop {
                            match chars.next() {
                                Some(c) if c.is_ascii_alphabetic() => break,
                                None => break,
                                _ => {}
                            }
                        }
                    }
                    Some(_) => { chars.next(); }
                    None => {}
                }
            } else {
                out.push(ch);
            }
        }
        out
    };

    // Deduplicar líneas consecutivas idénticas y filtrar líneas vacías
    let mut deduped: Vec<&str> = Vec::new();
    let mut prev = "";
    for line in clean.lines() {
        let t = line.trim();
        if !t.is_empty() && t != prev {
            deduped.push(t);
            prev = t;
        }
    }

    // Tomar las últimas MAX_LINES líneas
    let start = deduped.len().saturating_sub(MAX_LINES);
    let joined = deduped[start..].join("\n");

    // Truncar al último MAX_CHARS conservando las líneas más recientes
    if joined.len() <= MAX_CHARS {
        joined
    } else {
        let offset = joined.len() - MAX_CHARS;
        let safe_offset = (offset..=joined.len())
            .find(|&o| joined.is_char_boundary(o))
            .unwrap_or(joined.len());
        format!("[...]\n{}", &joined[safe_offset..])
    }
}

#[derive(Serialize, Deserialize)]
pub struct AiEnvStatus {
    pub has_groq_key: bool,
    pub model: Option<String>,
    pub groq_key_prefix: Option<String>,
    pub groq_key_length: Option<u32>,
    pub warning: Option<String>,
}

#[tauri::command]
pub fn ai_env_status() -> Result<AiEnvStatus, CommandError> {
    // Cargar .env
    static DID_DOTENV: Lazy<Mutex<bool>> = Lazy::new(|| Mutex::new(false));
    if let Ok(mut g) = DID_DOTENV.lock() { if !*g { let _ = dotenvy::dotenv(); *g = true; } }

    let groq_key_opt = get_groq_api_key();
    let model = std::env::var("OPENAI_MODEL").ok()
        .or_else(|| option_env!("COMPILED_OPENAI_MODEL").map(|s| s.to_string()));

    let debug = std::env::var("FILE_AI_DEBUG").ok()
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let mut warning = None;
    let mut groq_key_prefix = None;
    let mut groq_key_length = None;

    if let Some(k) = groq_key_opt.as_ref() {
        groq_key_length = Some(k.len() as u32);
        if debug { groq_key_prefix = Some(k.chars().take(8).collect()); }
        if !k.starts_with("gsk_") {
            warning = Some("La clave Groq no empieza con 'gsk_'".into());
        }
    } else {
        warning = Some("No se detectó GROQ_API_KEY".into());
    }

    Ok(AiEnvStatus {
        has_groq_key: groq_key_opt.is_some(),
        model,
        groq_key_prefix,
        groq_key_length,
        warning,
    })
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
pub async fn ai_test_key() -> Result<AiTestKeyResult, CommandError> {
    let model = std::env::var("OPENAI_MODEL")
        .unwrap_or_else(|_| "openai/gpt-oss-120b".to_string());

    let key = get_groq_api_key().ok_or_else(|| CommandError::permanent(
        "MISSING_API_KEY",
        "GROQ_API_KEY no encontrada en .env",
    ))?;

    let client = &*HTTP_CLIENT;
    let test_payload = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": "test"}],
        "max_tokens": 10
    });

    match client
        .post("https://api.groq.com/openai/v1/chat/completions")
        .bearer_auth(&key)
        .json(&test_payload)
        .send()
        .await
    {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            let body_snippet = if body.len() > 200 {
                format!("{}...", &body[..200])
            } else {
                body.clone()
            };
            Ok(AiTestKeyResult {
                ok: status == 200,
                http_status: status,
                auth_error: status == 401 || status == 403,
                rate_limited: status == 429,
                body_snippet: Some(body_snippet),
                model_used: model,
                message: if status == 200 {
                    Some("Groq API key válida".to_string())
                } else {
                    Some(format!("Error HTTP {}", status))
                },
            })
        }
        Err(e) => Ok(AiTestKeyResult {
            ok: false,
            http_status: 0,
            auth_error: false,
            rate_limited: false,
            body_snippet: None,
            model_used: model,
            message: Some(format!("Error de conexión: {}", e)),
        }),
    }
}

/// Estructura para el resultado del análisis de archivos
#[derive(Debug, Clone)]
pub struct FileAnalysisResult {
    pub description: Option<String>,
    pub key_points: Option<Vec<String>>,
    pub full_analysis: Option<String>,
    pub error: Option<String>,
}

/// Llama a Groq API para análisis de archivos (endpoint OpenAI-compatible)
pub async fn call_groq_file_analysis(
    api_key: &str,
    path: &str,
    size: usize,
    sample: &str,
    debug: bool
) -> Result<FileAnalysisResult, String> {
    let model = std::env::var("OPENAI_MODEL")
        .unwrap_or_else(|_| "openai/gpt-oss-120b".to_string());

    let prompt = format!(
        "Analiza el siguiente código y devuelve SOLO un objeto JSON con esta estructura:\n\
        {{\n\
          \"proposito\": \"Descripción del propósito principal (2-3 líneas)\",\n\
          \"ejemplo_ejecucion\": [\n\
            \"Comando para ejecutar\",\n\
            \"Entradas esperadas\",\n\
            \"Salidas generadas\",\n\
            \"Ejemplo práctico\"\n\
          ],\n\
          \"mejoras\": [\n\
            \"Mejora 1\",\n\
            \"Mejora 2\",\n\
            \"Mejora 3\"\n\
          ],\n\
          \"conclusiones\": [\n\
            \"Conclusión 1\",\n\
            \"Conclusión 2\"\n\
          ]\n\
        }}\n\n\
        Archivo: {}\n\
        Tamaño: {} bytes\n\n\
        CÓDIGO:\n\
        {}",
        path, size, sample
    );

    let client = &*HTTP_CLIENT;
    let body = serde_json::json!({
        "model": model,
        "messages": [
            {"role": "system", "content": "Eres un asistente experto que analiza código en español."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.15,
        "max_tokens": 1500
    });

    let response = client
        .post("https://api.groq.com/openai/v1/chat/completions")
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Error en request Groq: {}", e))?;

    let status = response.status();
    let text_body = response.text().await.unwrap_or_default();

    if debug {
        let _ = (status, text_body.len());
    }

    if !status.is_success() {
        return Ok(FileAnalysisResult {
            description: Some(format!("Error API Groq: HTTP {}", status)),
            key_points: None,
            full_analysis: None,
            error: Some(format!("HTTP {}", status)),
        });
    }

    let json: serde_json::Value = serde_json::from_str(&text_body)
        .map_err(|e| format!("Error parseando JSON: {}", e))?;

    // Extraer contenido (formato OpenAI-compatible)
    let content = json.pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .ok_or("No se encontró contenido en respuesta de Groq")?;

    if debug {
        let _ = content.len();
    }

    // Parsear JSON de la respuesta
    let trimmed = content.trim().trim_matches('`').trim_start_matches("json").trim();
    let vj: serde_json::Value = serde_json::from_str(trimmed)
        .map_err(|e| format!("Error parseando JSON interno: {}", e))?;

    let mut key_points = Vec::new();

    if let Some(p) = vj.get("proposito").and_then(|x| x.as_str()) {
        if let Some(arr) = vj.get("ejemplo_ejecucion").and_then(|x| x.as_array()) {
            key_points.push("**▶ EJEMPLO DE EJECUCIÓN**".to_string());
            for item in arr.iter() {
                if let Some(s) = item.as_str() { key_points.push(s.to_string()); }
            }
        }
        if let Some(arr) = vj.get("mejoras").and_then(|x| x.as_array()) {
            key_points.push("**🔧 POSIBLES MEJORAS**".to_string());
            for item in arr.iter() {
                if let Some(s) = item.as_str() { key_points.push(s.to_string()); }
            }
        }
        if let Some(arr) = vj.get("conclusiones").and_then(|x| x.as_array()) {
            key_points.push("**📊 CONCLUSIONES**".to_string());
            for item in arr.iter() {
                if let Some(s) = item.as_str() { key_points.push(s.to_string()); }
            }
        }
        return Ok(FileAnalysisResult {
            description: Some(p.to_string()),
            key_points: Some(key_points),
            full_analysis: None,
            error: None,
        });
    }

    Ok(FileAnalysisResult {
        description: None,
        key_points: None,
        full_analysis: None,
        error: Some("No se pudo extraer información del JSON".to_string()),
    })
}

// ── Alias de compatibilidad: las llamadas existentes a call_openai_file_analysis
//    y call_claude_file_analysis se redirigen a Groq transparentemente.

/// @deprecated — usar call_groq_file_analysis directamente
pub async fn call_openai_file_analysis(
    api_key: &str,
    _model: &str,
    path: &str,
    size: usize,
    sample: &str,
    debug: bool
) -> Result<FileAnalysisResult, String> {
    call_groq_file_analysis(api_key, path, size, sample, debug).await
}

/// @deprecated — usar call_groq_file_analysis directamente
pub async fn call_claude_file_analysis(
    api_key: &str,
    path: &str,
    size: usize,
    sample: &str,
    debug: bool
) -> Result<FileAnalysisResult, String> {
    call_groq_file_analysis(api_key, path, size, sample, debug).await
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

    #[tokio::test]
    async fn test_groq_api_connection() {
        let res = super::ai_test_key().await.expect("ai_test_key failed");
        assert!(res.ok, "Groq connection failed: {:?}", res);
    }
}
