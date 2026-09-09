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

// Helper centralizado para obtener la API key saneada.
pub fn get_openai_api_key() -> Option<String> {
    // Cargar .env una vez por proceso (dotenvy es idempotente, pero evitamos ruido)
    static DID_DOTENV: Lazy<Mutex<bool>> = Lazy::new(|| Mutex::new(false));
    if let Ok(mut g) = DID_DOTENV.lock() { if !*g { let _ = dotenvy::dotenv(); *g = true; } }
    
    // Intentar múltiples nombres de variables para la API key de OpenAI
    let possible_keys = ["OPENAI_API_KEY3P", "OPENAI_API_KEY", "OPENAI_API_KEY1", "OPENAI_API_KEY2"];
    
    for key_name in possible_keys.iter() {
        if let Ok(raw) = std::env::var(key_name) {
            let trimmed = raw.trim().trim_matches('\'').trim_matches('"').to_string();
            if !trimmed.is_empty() && trimmed.len() >= 40 { 
                return Some(trimmed); 
            }
        }
    }
    
    // 2) Fallback opcional: clave embebida en tiempo de compilación (si se proveyó)
    if let Some(baked) = option_env!("COMPILED_OPENAI_KEY") {
        let trimmed = baked.trim().trim_matches('\'').trim_matches('"').to_string();
        if !trimmed.is_empty() && trimmed.len() >= 40 { return Some(trimmed); }
    }
    None
}

// Helper para obtener la API key de Claude
pub fn get_claude_api_key() -> Option<String> {
    // Cargar .env una vez por proceso
    static DID_DOTENV: Lazy<Mutex<bool>> = Lazy::new(|| Mutex::new(false));
    if let Ok(mut g) = DID_DOTENV.lock() { if !*g { let _ = dotenvy::dotenv(); *g = true; } }
    
    // Intentar múltiples nombres de variables para la API key de Claude
    let possible_keys = ["CLAUDE_API_KEY", "ANTHROPIC_API_KEY", "CLAUDE_CODE_API_KEY"];
    
    for key_name in possible_keys.iter() {
        if let Ok(raw) = std::env::var(key_name) {
            let trimmed = raw.trim().trim_matches('\'').trim_matches('"').to_string();
            if !trimmed.is_empty() && trimmed.len() >= 40 { 
                return Some(trimmed); 
            }
        }
    }
    
    // Fallback opcional: clave embebida en tiempo de compilación (si se proveyó)
    if let Some(baked) = option_env!("COMPILED_CLAUDE_KEY") {
        let trimmed = baked.trim().trim_matches('\'').trim_matches('"').to_string();
        if !trimmed.is_empty() && trimmed.len() >= 40 { return Some(trimmed); }
    }
    None
}

/// Helper para obtener la API key de OpenRouter
pub fn get_openrouter_api_key() -> Option<String> {
    static DID_DOTENV: Lazy<Mutex<bool>> = Lazy::new(|| Mutex::new(false));
    if let Ok(mut g) = DID_DOTENV.lock() { if !*g { let _ = dotenvy::dotenv(); *g = true; } }
    if let Ok(raw) = std::env::var("OPENROUTER_API_KEY") {
        let trimmed = raw.trim().trim_matches('\'').trim_matches('"').to_string();
        if !trimmed.is_empty() && trimmed.len() >= 20 { return Some(trimmed); }
    }
    // Fallback a la key horneada en tiempo de compilación
    if let Some(baked) = option_env!("COMPILED_OPENROUTER_KEY") {
        let trimmed = baked.trim().trim_matches('\'').trim_matches('"');
        if !trimmed.is_empty() && trimmed.len() >= 20 { return Some(trimmed.to_string()); }
    }
    None
}

/// Resuelve el endpoint y clave para llamadas OpenAI-compatibles.
/// Modelos con "/" en el nombre (ej: "nvidia/nemotron-3-super-120b-a12b:free") se enrutan a OpenRouter.
/// Retorna (url, api_key, is_openrouter)
pub fn resolve_openai_endpoint(model: &str) -> (String, Option<String>, bool) {
    if model.contains('/') {
        if let Some(key) = get_openrouter_api_key() {
            return (
                "https://openrouter.ai/api/v1/chat/completions".to_string(),
                Some(key),
                true,
            );
        }
    }
    (
        "https://api.openai.com/v1/chat/completions".to_string(),
        get_openai_api_key(),
        false,
    )
}

/// Comprime la salida del terminal para reducir tokens al enviarse como contexto IA.
/// - Elimina códigos ANSI de escape (CSI, OSC, etc.) y caracteres de control
/// - Maneja sobreescrituras por retorno de carro (\r)
/// - Deduplica líneas consecutivas idénticas
/// - Mantiene las últimas 40 líneas no vacías
/// - Limita a 1500 caracteres totales (conservando las líneas más recientes)
pub fn compress_terminal_context(raw: &str) -> String {
    const MAX_LINES: usize = 40;
    const MAX_CHARS: usize = 1500;

    // 1. Eliminar secuencias ANSI y caracteres de control
    let mut clean = String::with_capacity(raw.len());
    let mut chars = raw.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '\x1b' {
            match chars.peek() {
                Some('[') => {
                    // CSI: ESC [ ... final byte (0x40-0x7E)
                    chars.next();
                    while let Some(&c) = chars.peek() {
                        chars.next();
                        if (0x40..=0x7E).contains(&(c as u32)) {
                            break;
                        }
                    }
                }
                Some(']') => {
                    // OSC: ESC ] ... BEL (\x07) o ST (ESC \)
                    chars.next();
                    while let Some(&c) = chars.peek() {
                        chars.next();
                        if c == '\x07' {
                            break;
                        }
                        if c == '\x1b' && chars.peek() == Some(&'\\') {
                            chars.next();
                            break;
                        }
                    }
                }
                Some('(') | Some(')') | Some('*') | Some('+') => {
                    // Charset designation
                    chars.next();
                    chars.next();
                }
                Some(_) => {
                    // Otros escapes simples de 1 carácter
                    chars.next();
                }
                None => {}
            }
        } else if ch == '\r' || ch == '\n' || ch == '\t' || (ch >= ' ' && ch != '\x7f') {
            clean.push(ch);
        }
    }

    // 2. Resolver líneas con \r (tomar el último segmento tras un \r dentro de la línea)
    let mut processed_lines: Vec<String> = Vec::new();
    for raw_line in clean.split('\n') {
        let final_segment = if raw_line.contains('\r') {
            raw_line.split('\r').filter(|s| !s.trim().is_empty()).last().unwrap_or("")
        } else {
            raw_line
        };
        let t = final_segment.trim();
        if !t.is_empty() {
            processed_lines.push(t.to_string());
        }
    }

    // 3. Deduplicar líneas consecutivas idénticas
    let mut deduped: Vec<String> = Vec::new();
    let mut prev = "";
    for line in &processed_lines {
        if line.as_str() != prev {
            deduped.push(line.clone());
            prev = line.as_str();
        }
    }

    // 4. Tomar las últimas MAX_LINES líneas
    let start = deduped.len().saturating_sub(MAX_LINES);
    let joined = deduped[start..].join("\n");

    // 5. Truncar a MAX_CHARS conservando las líneas más recientes
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
    pub has_openai_key: bool, 
    pub has_claude_key: bool,
    pub has_openrouter_key: bool,
    pub model: Option<String>, 
    pub openai_key_prefix: Option<String>, 
    pub claude_key_prefix: Option<String>,
    pub openai_key_length: Option<u32>,
    pub claude_key_length: Option<u32>,
    pub warning: Option<String> 
}

#[tauri::command]
pub fn ai_env_status() -> Result<AiEnvStatus, CommandError> {
    let openai_key_opt = get_openai_api_key();
    let claude_key_opt = get_claude_api_key();
    let openrouter_key_opt = get_openrouter_api_key();
    
    // Intentar obtener el modelo de env o de tiempo de compilación
    let model = std::env::var("OPENAI_MODEL").ok()
        .or_else(|| option_env!("COMPILED_OPENAI_MODEL").map(|s| s.to_string()));

    let debug = std::env::var("FILE_AI_DEBUG").ok().map(|v| v=="1" || v.eq_ignore_ascii_case("true")).unwrap_or(false);
    
    let mut warning = None;
    let mut openai_key_prefix = None;
    let mut claude_key_prefix = None;
    let mut openai_key_length = None;
    let mut claude_key_length = None;
    
    if let Some(k) = openai_key_opt.as_ref() {
        openai_key_length = Some(k.len() as u32);
        if debug { openai_key_prefix = Some(k.chars().take(8).collect()); }
        
        // Verificar si la clave es de tiempo de compilación
        let is_baked = option_env!("COMPILED_OPENAI_KEY").map(|b| b == k).unwrap_or(false);
        if is_baked {
            openai_key_prefix = Some("Embebida".to_string());
        }

        if !k.starts_with("sk-") { 
            warning = Some("La clave OpenAI no empieza con 'sk-'".into()); 
        }
    }
    
    if let Some(k) = claude_key_opt.as_ref() {
        claude_key_length = Some(k.len() as u32);
        if debug { claude_key_prefix = Some(k.chars().take(8).collect()); }

        // Verificar si la clave es de tiempo de compilación
        let is_baked = option_env!("COMPILED_CLAUDE_KEY").map(|b| b == k).unwrap_or(false);
        if is_baked {
            claude_key_prefix = Some("Embebida".to_string());
        }

        if !k.starts_with("sk-ant-") { 
            warning = Some("La clave Claude no empieza con 'sk-ant-'".into()); 
        }
    }
    
    if openai_key_opt.is_none() && claude_key_opt.is_none() && openrouter_key_opt.is_none() {
        warning = Some("No se detectó ninguna API key válida (OPENAI_API_KEY, CLAUDE_API_KEY o OPENROUTER_API_KEY)".into());
    }
    
    Ok(AiEnvStatus { 
        has_openai_key: openai_key_opt.is_some(), 
        has_claude_key: claude_key_opt.is_some(),
        has_openrouter_key: openrouter_key_opt.is_some(),
        model, 
        openai_key_prefix, 
        claude_key_prefix,
        openai_key_length,
        claude_key_length,
        warning 
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
    // Determinar qué API key probar basado en el modelo configurado
    let model = std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "deepseek/deepseek-v3.2:free".to_string());

    if model.contains('/') {
        // Probar OpenRouter API
        let key = get_openrouter_api_key().ok_or_else(|| CommandError::permanent(
            "MISSING_API_KEY",
            "OPENROUTER_API_KEY no encontrada",
        ))?;

        let client = &*HTTP_CLIENT;
        let test_payload = serde_json::json!({
            "model": model,
            "messages": [{"role": "user", "content": "test"}],
            "max_tokens": 10
        });

        match client
            .post("https://openrouter.ai/api/v1/chat/completions")
            .bearer_auth(&key)
            .header("HTTP-Referer", "https://github.com/ssh-ai-client")
            .header("X-Title", "SSH AI Client")
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
                    message: if status == 200 { Some("OpenRouter API key válida".to_string()) } else { Some(format!("Error HTTP {}", status)) }
                })
            }
            Err(e) => Ok(AiTestKeyResult {
                ok: false,
                http_status: 0,
                auth_error: false,
                rate_limited: false,
                body_snippet: None,
                model_used: model,
                message: Some(format!("Error de conexión: {}", e))
            })
        }
    } else if model.starts_with("claude") {
        // Probar Claude API
        let key = get_claude_api_key().ok_or_else(|| CommandError::permanent(
            "MISSING_API_KEY",
            "CLAUDE_API_KEY no encontrada",
        ))?;
        
        let client = &*HTTP_CLIENT;
        let test_payload = serde_json::json!({
            "model": model,
            "max_tokens": 10,
            "messages": [{"role": "user", "content": "test"}]
        });
        
        match client
            .post("https://api.anthropic.com/v1/messages")
            .header("anthropic-version", "2023-06-01")
            .header("x-api-key", &key)
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
                    message: if status == 200 { Some("Claude API key válida".to_string()) } else { Some(format!("Error HTTP {}", status)) }
                })
            }
            Err(e) => Ok(AiTestKeyResult {
                ok: false,
                http_status: 0,
                auth_error: false,
                rate_limited: false,
                body_snippet: None,
                model_used: model,
                message: Some(format!("Error de conexión: {}", e))
            })
        }
    } else {
        // Probar OpenAI API
        let key = get_openai_api_key().ok_or_else(|| CommandError::permanent(
            "MISSING_API_KEY",
            "OPENAI_API_KEY no encontrada",
        ))?;
        
        let client = &*HTTP_CLIENT;
        let test_payload = serde_json::json!({
            "model": model,
            "messages": [{"role": "user", "content": "test"}],
            "max_tokens": 10
        });
        
        match client
            .post("https://api.openai.com/v1/chat/completions")
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
                    message: if status == 200 { Some("OpenAI API key válida".to_string()) } else { Some(format!("Error HTTP {}", status)) }
                })
            }
            Err(e) => Ok(AiTestKeyResult {
                ok: false,
                http_status: 0,
                auth_error: false,
                rate_limited: false,
                body_snippet: None,
                model_used: model,
                message: Some(format!("Error de conexión: {}", e))
            })
        }
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

/// Llama a Claude API para análisis de archivos
pub async fn call_claude_file_analysis(
    api_key: &str,
    path: &str,
    size: usize,
    sample: &str,
    debug: bool
) -> Result<FileAnalysisResult, String> {
    let prompt = format!(
        "Analiza el siguiente código y proporciona un análisis completo en español con las siguientes secciones:\n\n\
        ## PROPÓSITO DEL PROGRAMA\n\
        [Descripción clara del propósito principal en 2-3 líneas]\n\n\
        ## EJEMPLO DE EJECUCIÓN\n\
        - Comando para ejecutar\n\
        - Entradas esperadas\n\
        - Salidas generadas\n\
        - Ejemplo práctico\n\n\
        ## POSIBLES MEJORAS\n\
        - Mejora 1 con descripción detallada\n\
        - Mejora 2 con descripción detallada\n\
        - Mejora 3 con descripción detallada\n\n\
        ## CONCLUSIONES\n\
        - Conclusión 1 sobre el código\n\
        - Conclusión 2 sobre el código\n\n\
        Archivo: {}\n\
        Tamaño: {} bytes\n\n\
        CÓDIGO:\n\
        {}",
        path, size, sample
    );
    
    let client = &*HTTP_CLIENT;

    let body = serde_json::json!({
        "model": std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "claude-sonnet-4-5".into()),
        "max_tokens": 2000,
        "messages": [{"role": "user", "content": prompt}]
    });
    
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("anthropic-version", "2023-06-01")
        .header("x-api-key", api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Error en request: {}", e))?;
    
    let status = response.status();
    let text_body = response.text().await.unwrap_or_default();
    
    if debug {
        let _ = (status, text_body.len());
    }
    
    if !status.is_success() {
        return Ok(FileAnalysisResult {
            description: Some(format!("Error API Claude: HTTP {}", status)),
            key_points: None,
            full_analysis: None,
            error: Some(format!("HTTP {}", status)),
        });
    }
    
    let json: serde_json::Value = serde_json::from_str(&text_body)
        .map_err(|e| format!("Error parseando JSON: {}", e))?;
    
    // Extraer contenido de Claude
    let content = json.pointer("/content/0/text")
        .and_then(|v| v.as_str())
        .ok_or("No se encontró texto en respuesta de Claude")?;
    
    if debug {
        let _ = content.len();
    }
    
    Ok(FileAnalysisResult {
        description: None,
        key_points: None,
        full_analysis: Some(content.to_string()),
        error: None,
    })
}

/// Llama a OpenAI API para análisis de archivos
pub async fn call_openai_file_analysis(
    api_key: &str,
    model: &str,
    path: &str,
    size: usize,
    sample: &str,
    debug: bool
) -> Result<FileAnalysisResult, String> {
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
        .post("https://api.openai.com/v1/chat/completions")
        .header("authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Error en request: {}", e))?;
    
    let status = response.status();
    let text_body = response.text().await.unwrap_or_default();
    
    if debug {
        let _ = (status, text_body.len());
    }
    
    if !status.is_success() {
        return Ok(FileAnalysisResult {
            description: Some(format!("Error API OpenAI: HTTP {}", status)),
            key_points: None,
            full_analysis: None,
            error: Some(format!("HTTP {}", status)),
        });
    }
    
    let json: serde_json::Value = serde_json::from_str(&text_body)
        .map_err(|e| format!("Error parseando JSON: {}", e))?;
    
    // Extraer contenido de OpenAI
    let content = json.pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .ok_or("No se encontró contenido en respuesta de OpenAI")?;
    
    if debug {
        let _ = content.len();
    }
    
    // Parsear JSON de la respuesta
    let trimmed = content.trim().trim_matches('`').trim_start_matches("json").trim();
    let vj: serde_json::Value = serde_json::from_str(trimmed)
        .map_err(|e| format!("Error parseando JSON interno: {}", e))?;
    
    let mut key_points = Vec::new();
    
    if let Some(p) = vj.get("proposito").and_then(|x| x.as_str()) {
        // Construir key_points estructurados
        if let Some(arr) = vj.get("ejemplo_ejecucion").and_then(|x| x.as_array()) {
            key_points.push("**▶ EJEMPLO DE EJECUCIÓN**".to_string());
            for item in arr.iter() {
                if let Some(s) = item.as_str() {
                    key_points.push(format!("{}", s));
                }
            }
        }
        
        if let Some(arr) = vj.get("mejoras").and_then(|x| x.as_array()) {
            key_points.push("**🔧 POSIBLES MEJORAS**".to_string());
            for item in arr.iter() {
                if let Some(s) = item.as_str() {
                    key_points.push(format!("{}", s));
                }
            }
        }
        
        if let Some(arr) = vj.get("conclusiones").and_then(|x| x.as_array()) {
            key_points.push("**📊 CONCLUSIONES**".to_string());
            for item in arr.iter() {
                if let Some(s) = item.as_str() {
                    key_points.push(format!("{}", s));
                }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_basic_invocations() {
        let input = "python script.py\npip install requests\n#!/usr/bin/env python\n";
        let out = force_python3_everywhere(input);
        assert!(out.contains("python3 script.py"));
        assert!(out.contains("python3 -m pip install requests"));
        assert!(out.contains("#!/usr/bin/env python3"));
    }

    #[test]
    fn test_compress_terminal_context_ansi_and_osc() {
        let input = "\x1b]0;user@host:~\x07\x1b[32muser@host:~\x1b[0m$ ls\r\nfile1.txt\r\nfile2.txt\r\n";
        let out = compress_terminal_context(input);
        assert!(!out.contains("\x1b"));
        assert!(!out.contains("\x07"));
        assert!(out.contains("user@host:~$ ls"));
        assert!(out.contains("file1.txt"));
        assert!(out.contains("file2.txt"));
    }

    #[test]
    fn test_compress_terminal_context_carriage_return() {
        let input = "user@host:~$ old_cmd\ruser@host:~$ new_cmd\r\noutput line\r\n";
        let out = compress_terminal_context(input);
        assert!(out.contains("new_cmd"));
        assert!(out.contains("output line"));
    }
}
