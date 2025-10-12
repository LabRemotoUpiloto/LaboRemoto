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
    // Preferir variable de entorno en tiempo de ejecución
    if let Ok(raw) = std::env::var("CLAUDE_CODE_API_KEY") {
        let trimmed = raw.trim().trim_matches('\'').trim_matches('"').to_string();
        if !trimmed.is_empty() && trimmed.len() >= 40 { return Some(trimmed); }
    }
    None
}

#[derive(Serialize, Deserialize)]
pub struct AiEnvStatus { 
    pub has_openai_key: bool, 
    pub has_claude_key: bool,
    pub model: Option<String>, 
    pub openai_key_prefix: Option<String>, 
    pub claude_key_prefix: Option<String>,
    pub openai_key_length: Option<u32>,
    pub claude_key_length: Option<u32>,
    pub warning: Option<String> 
}

#[tauri::command]
pub fn ai_env_status() -> Result<AiEnvStatus, String> {
    let openai_key_opt = get_openai_api_key();
    let claude_key_opt = get_claude_api_key();
    let model = std::env::var("OPENAI_MODEL").ok();
    let debug = std::env::var("FILE_AI_DEBUG").ok().map(|v| v=="1" || v.eq_ignore_ascii_case("true")).unwrap_or(false);
    
    let mut warning = None;
    let mut openai_key_prefix = None;
    let mut claude_key_prefix = None;
    let mut openai_key_length = None;
    let mut claude_key_length = None;
    
    if let Some(k) = openai_key_opt.as_ref() {
        openai_key_length = Some(k.len() as u32);
        if debug { openai_key_prefix = Some(k.chars().take(8).collect()); }
        if !k.starts_with("sk-") { 
            warning = Some("La clave OpenAI no empieza con 'sk-'".into()); 
        }
    }
    
    if let Some(k) = claude_key_opt.as_ref() {
        claude_key_length = Some(k.len() as u32);
        if debug { claude_key_prefix = Some(k.chars().take(8).collect()); }
        if !k.starts_with("sk-ant-") { 
            warning = Some("La clave Claude no empieza con 'sk-ant-'".into()); 
        }
    }
    
    if openai_key_opt.is_none() && claude_key_opt.is_none() {
        warning = Some("No se detectó ninguna API key válida (OPENAI_API_KEY o CLAUDE_CODE_API_KEY)".into());
    }
    
    Ok(AiEnvStatus { 
        has_openai_key: openai_key_opt.is_some(), 
        has_claude_key: claude_key_opt.is_some(),
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
pub async fn ai_test_key() -> Result<AiTestKeyResult, String> {
    // Determinar qué API key probar basado en el modelo configurado
    let model = std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "claude-sonnet-4-5".to_string());
    
    if model.starts_with("claude") {
        // Probar Claude API
        let key = get_claude_api_key().ok_or_else(|| "CLAUDE_CODE_API_KEY no encontrada".to_string())?;
        
        let client = reqwest::Client::new();
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
        let key = get_openai_api_key().ok_or_else(|| "OPENAI_API_KEY no encontrada".to_string())?;
        
        let client = reqwest::Client::new();
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

/// Estructura para respuesta de análisis AI (compatible con OpenAI y Claude)
#[derive(Serialize, Deserialize, Debug)]
pub struct AiFileAnalysisResult {
    pub description: Option<String>,
    pub key_points: Option<Vec<String>>,
    pub full_analysis: Option<String>,  // Para análisis completo sin estructura
    pub error: Option<String>,
}

/// Llama a Claude API para análisis de archivo
pub async fn call_claude_file_analysis(
    api_key: &str,
    file_path: &str,
    file_size: usize,
    content_sample: &str,
    debug: bool,
) -> Result<AiFileAnalysisResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))  // Aumentado a 30 segundos
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Error construyendo cliente: {}", e))?;

    let prompt = format!(
        "Analiza este código y estructura tu respuesta en estas 4 secciones en español:\n\n\
        ## PROPÓSITO DEL PROGRAMA\n\
        Describe en 1-2 líneas qué hace este programa y cuál es su función principal.\n\n\
        ## EJEMPLO DE EJECUCIÓN\n\
        Explica cómo se ejecutaría este programa:\n\
        - Qué comandos o pasos seguir para ejecutarlo\n\
        - Qué entradas espera (si las hay)\n\
        - Qué salida o resultado produce\n\
        - Un ejemplo concreto de uso si es posible\n\n\
        ## POSIBLES MEJORAS\n\
        Sugiere 3-5 mejoras técnicas que se podrían implementar:\n\
        - Optimizaciones de código o rendimiento\n\
        - Validaciones o manejo de errores mejorado\n\
        - Mejoras en la estructura o arquitectura\n\
        - Características adicionales útiles\n\
        - Aspectos de seguridad a considerar\n\n\
        ## CONCLUSIONES\n\
        Resume en 2-3 puntos tu evaluación técnica del código:\n\
        - Calidad general del código\n\
        - Fortalezas principales\n\
        - Consideraciones importantes\n\n\
        ---\n\
        Archivo: {}\n\
        Tamaño: {} bytes\n\n\
        CÓDIGO:\n\
        {}\n\
        ---",
        file_path, file_size, content_sample
    );

    // Formato de mensajes de Claude (Anthropic API)
    let body = serde_json::json!({
        "model": "claude-sonnet-4-5-20250929",
        "max_tokens": 1000,
        "temperature": 0.15,
        "system": "Eres un analista de código educativo. Tu misión es explicar código de forma clara y estructurada en 4 secciones: PROPÓSITO DEL PROGRAMA (qué hace), EJEMPLO DE EJECUCIÓN (cómo usarlo con ejemplos concretos), POSIBLES MEJORAS (sugerencias técnicas), y CONCLUSIONES (evaluación general). Sé práctico, didáctico y usa español técnico claro.",
        "messages": [
            {
                "role": "user",
                "content": prompt
            }
        ]
    });

    if debug {
        eprintln!("[file_ai] Llamando Claude API con modelo claude-sonnet-4-5-20250929");
        eprintln!("[file_ai] Tamaño del contenido: {} chars", content_sample.len());
    }

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if debug {
                eprintln!("[file_ai] Error detallado de Claude: {:?}", e);
            }
            format!("Error en request HTTP: {}", e)
        })?;

    let status = resp.status();
    let text_body = resp.text().await.unwrap_or_default();

    if debug {
        eprintln!("[file_ai] Claude HTTP status={} length={}", status, text_body.len());
    }

    if !status.is_success() {
        if debug {
            eprintln!("[file_ai] Respuesta no exitosa de Claude: {}", status);
        }
        return Ok(AiFileAnalysisResult {
            description: Some(format!("(IA) Error API Claude: HTTP {}", status)),
            key_points: if status.as_u16() == 401 {
                Some(vec!["API key inválida o expirada".into()])
            } else if status.as_u16() == 429 {
                Some(vec!["Rate limit alcanzado".into()])
            } else {
                Some(vec!["Fallo al obtener resumen".into()])
            },
            full_analysis: None,
            error: Some(format!("HTTP {}", status)),
        });
    }

    let json: serde_json::Value = serde_json::from_str(&text_body)
        .map_err(|e| format!("Error parseando JSON de Claude: {}", e))?;

    if debug {
        let slice = &text_body[..text_body.len().min(300)].replace("\n", " ");
        eprintln!("[file_ai] Claude raw body (300 max): {}", slice);
    }

    // Claude devuelve el contenido en content[0].text
    let extracted = json
        .pointer("/content/0/text")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    if let Some(text) = extracted {
        if debug {
            let preview = &text[..text.len().min(200)];
            eprintln!("[file_ai] Claude análisis completo (primeros 200 chars): {}", preview.replace("\n", " "));
        }

        // Devolver el análisis completo sin intentar parsearlo como JSON
        return Ok(AiFileAnalysisResult {
            description: None,
            key_points: None,
            full_analysis: Some(text),
            error: None,
        });
    } else if debug {
        eprintln!("[file_ai] Campo content ausente en respuesta de Claude");
    }

    Ok(AiFileAnalysisResult {
        description: None,
        key_points: None,
        full_analysis: None,
        error: Some("No se pudo obtener respuesta de Claude".into()),
    })
}

/// Llama a OpenAI API para análisis de archivo
pub async fn call_openai_file_analysis(
    api_key: &str,
    model: &str,
    file_path: &str,
    file_size: usize,
    content_sample: &str,
    debug: bool,
) -> Result<AiFileAnalysisResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))  // Aumentado a 30 segundos
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Error construyendo cliente: {}", e))?;

    let prompt = format!(
        "Analiza este archivo de código y devuelve SOLO un JSON con la siguiente estructura:\n\
        {{\n  \
          \"descripcion\": \"Descripción clara y concisa en UNA línea\",\n  \
          \"key_points\": [\"punto1\", \"punto2\", ...]\n\
        }}\n\n\
        INSTRUCCIONES DETALLADAS:\n\
        1. descripcion: Resume en UNA LÍNEA la función/propósito principal del archivo.\n   \
           - NO empieces con 'Este archivo' o 'Este script'\n   \
           - Sé directo y específico\n   \
           - Ejemplo: \"Gestiona conexiones SSH con autenticación y manejo de sesiones\"\n\n\
        2. key_points: Array de 6-10 puntos técnicos relevantes:\n   \
           - Funcionalidad principal y características clave\n   \
           - Dependencias y librerías importantes utilizadas\n   \
           - Estructura del código (clases, funciones principales, módulos)\n   \
           - Entradas esperadas y salidas generadas\n   \
           - Patrones de diseño o arquitectura aplicados\n   \
           - Manejo de errores y validaciones\n   \
           - Consideraciones de seguridad o performance\n   \
           - Puntos de integración con otros módulos\n   \
           - Riesgos potenciales o limitaciones conocidas\n   \
           - Configuraciones o variables de entorno necesarias\n\n\
        3. FORMATO:\n   \
           - Cada punto debe ser conciso pero informativo (1-2 líneas máximo)\n   \
           - NO uses punto final en los bullets\n   \
           - Prioriza información técnica relevante\n   \
           - Usa terminología técnica apropiada en español\n\n\
        4. IMPORTANTE: Devuelve ÚNICAMENTE el JSON, sin texto adicional antes o después.\n\n\
        ---\n\
        Nombre archivo: {}\n\
        Tamaño: {} bytes\n\
        Lenguaje: (detectar automáticamente)\n\n\
        CONTENIDO:\n\
        {}\n\
        ---",
        file_path, file_size, content_sample
    );

    let body = serde_json::json!({
        "model": model,
        "messages": [
            {"role": "system", "content": "Eres un analista de código experto que genera análisis técnicos detallados y estructurados en español. Tu especialidad es identificar patrones de arquitectura, dependencias, flujos de datos y riesgos potenciales en código fuente."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.15,
        "max_tokens": 600
    });

    if debug {
        eprintln!("[file_ai] Llamando OpenAI API con modelo {}", model);
    }

    let resp = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Error en request HTTP: {}", e))?;

    let status = resp.status();
    let text_body = resp.text().await.unwrap_or_default();

    if debug {
        eprintln!("[file_ai] OpenAI HTTP status={} length={}", status, text_body.len());
    }

    if !status.is_success() {
        if debug {
            eprintln!("[file_ai] Respuesta no exitosa de OpenAI: {}", status);
        }
        return Ok(AiFileAnalysisResult {
            description: Some(format!("(IA) Error API OpenAI: HTTP {}", status)),
            key_points: if status.as_u16() == 401 {
                Some(vec!["API key inválida o expirada".into()])
            } else if status.as_u16() == 429 {
                Some(vec!["Rate limit alcanzado".into()])
            } else {
                Some(vec!["Fallo al obtener resumen".into()])
            },
            full_analysis: None,
            error: Some(format!("HTTP {}", status)),
        });
    }

    let json: serde_json::Value = serde_json::from_str(&text_body)
        .map_err(|e| format!("Error parseando JSON de OpenAI: {}", e))?;

    if debug {
        let slice = &text_body[..text_body.len().min(300)].replace("\n", " ");
        eprintln!("[file_ai] OpenAI raw body (300 max): {}", slice);
    }

    let mut extracted: Option<String> = json
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    
    if extracted.is_none() {
        extracted = json
            .pointer("/choices/0/text")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
    }

    if let Some(text) = extracted {
        if debug {
            let preview = &text[..text.len().min(140)];
            eprintln!("[file_ai] OpenAI contenido (primeros 140 chars): {}", preview.replace("\n", " "));
        }

        let trimmed = text.trim().trim_matches('`').trim_start_matches("json").trim();
        
        if let Ok(vj) = serde_json::from_str::<serde_json::Value>(trimmed) {
            if debug {
                eprintln!("[file_ai] OpenAI respuesta parseada OK");
            }

            let description = vj.get("descripcion").and_then(|x| x.as_str()).map(|s| s.to_string());
            let key_points = vj.get("key_points")
                .and_then(|x| x.as_array())
                .map(|arr| {
                    arr.iter()
                        .take(10)
                        .filter_map(|item| item.as_str().map(|s| s.to_string()))
                        .collect::<Vec<String>>()
                });

            return Ok(AiFileAnalysisResult {
                description,
                key_points,
                full_analysis: None,
                error: None,
            });
        } else if debug {
            eprintln!("[file_ai] JSON inválido tras recorte de OpenAI");
        }
    } else if debug {
        eprintln!("[file_ai] Campo content ausente en respuesta de OpenAI");
    }

    Ok(AiFileAnalysisResult {
        description: None,
        key_points: None,
        full_analysis: None,
        error: Some("No se pudo parsear respuesta de OpenAI".into()),
    })
}

/// Detecta si el usuario quiere analizar un archivo usando IA
/// Retorna (quiere_analizar: bool, nombre_archivo: Option<String>)
pub async fn detect_analysis_intent(
    user_message: &str,
) -> Result<(bool, Option<String>), String> {
    // Obtener API key (preferir Claude, fallback a OpenAI)
    let api_key = get_claude_api_key()
        .or_else(|| get_openai_api_key())
        .ok_or_else(|| "No hay API key disponible".to_string())?;
    
    let use_claude = get_claude_api_key().is_some();
    
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Error construyendo cliente: {}", e))?;

    let prompt = format!(
        "Analiza este mensaje del usuario y determina:\n\
        1. ¿Quiere analizar/ver/revisar/inspeccionar un archivo de código?\n\
        2. Si sí, ¿cuál es el nombre del archivo mencionado?\n\n\
        Responde SOLO en formato JSON:\n\
        {{\"quiere_analizar\": true/false, \"archivo\": \"nombre_archivo\" o null}}\n\n\
        Mensaje del usuario: \"{}\"\n\n\
        Ejemplos:\n\
        - \"muéstrame el main.py\" → {{\"quiere_analizar\": true, \"archivo\": \"main.py\"}}\n\
        - \"qué hace el script test.sh\" → {{\"quiere_analizar\": true, \"archivo\": \"test.sh\"}}\n\
        - \"cómo funciona index.js\" → {{\"quiere_analizar\": true, \"archivo\": \"index.js\"}}\n\
        - \"explícame qué es Linux\" → {{\"quiere_analizar\": false, \"archivo\": null}}\n\
        - \"crea un archivo nuevo\" → {{\"quiere_analizar\": false, \"archivo\": null}}",
        user_message
    );

    let (response_text, endpoint) = if use_claude {
        // Claude API
        let body = serde_json::json!({
            "model": "claude-sonnet-4-5-20250929",
            "max_tokens": 200,
            "temperature": 0.0,
            "system": "Eres un asistente que detecta intención de análisis de archivos. Responde SOLO con JSON válido, sin texto adicional.",
            "messages": [{"role": "user", "content": prompt}]
        });

        let resp = client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Error en request HTTP: {}", e))?;

        let response_json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Error parseando JSON: {}", e))?;

        let content_text = response_json
            .get("content")
            .and_then(|c| c.get(0))
            .and_then(|c| c.get("text"))
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .trim()
            .to_string();

        (content_text, "Claude")
    } else {
        // OpenAI API
        let body = serde_json::json!({
            "model": "gpt-3.5-turbo",
            "messages": [
                {"role": "system", "content": "Eres un asistente que detecta intención de análisis de archivos. Responde SOLO con JSON válido, sin texto adicional."},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": 200,
            "temperature": 0.0
        });

        let resp = client
            .post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Error en request HTTP: {}", e))?;

        let response_json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Error parseando JSON: {}", e))?;

        let content_text = response_json
            .get("choices")
            .and_then(|c| c.get(0))
            .and_then(|c| c.get("message"))
            .and_then(|m| m.get("content"))
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .trim()
            .to_string();

        (content_text, "OpenAI")
    };

    eprintln!("[detect_intent] Respuesta de {}: {}", endpoint, response_text);

    // Limpiar markdown code blocks (```json ... ```) si existen
    let cleaned_text = if response_text.contains("```json") {
        // Extraer contenido entre ```json y ```
        let start = response_text.find("```json").unwrap_or(0) + 7; // "```json".len() = 7
        let end_marker = response_text[start..].find("```").unwrap_or(response_text[start..].len());
        response_text[start..start + end_marker].trim().to_string()
    } else if response_text.contains("```") {
        // Formato sin "json" explícito: ``` ... ```
        let start = response_text.find("```").unwrap_or(0) + 3;
        let end_marker = response_text[start..].find("```").unwrap_or(response_text[start..].len());
        response_text[start..start + end_marker].trim().to_string()
    } else {
        response_text.clone()
    };

    eprintln!("[detect_intent] JSON limpio: {}", cleaned_text);

    // Parsear JSON response
    let json_result: serde_json::Value = serde_json::from_str(&cleaned_text)
        .map_err(|e| format!("Error parseando respuesta JSON: {}", e))?;

    let quiere_analizar = json_result
        .get("quiere_analizar")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let archivo = json_result
        .get("archivo")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    Ok((quiere_analizar, archivo))
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
