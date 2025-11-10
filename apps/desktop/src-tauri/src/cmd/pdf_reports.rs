use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::fs;
use chrono::Utc;

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionLogForPdf {
    pub id: String,
    pub session_id: String,
    pub user_id: String,
    pub username: Option<String>,
    pub hostname: Option<String>,
    pub port: Option<u16>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_minutes: Option<i32>,
    pub html_content: Option<String>,
    pub storage_path: Option<String>,
}

/// Genera un reporte PDF para una sesión específica
#[tauri::command]
pub async fn generate_session_report_pdf(
    session_log_id: String,
    user_id: String,
    role_id: i32,
) -> Result<String, String> {
    match generate_session_report_pdf_internal(session_log_id, user_id, role_id).await {
        Ok(path) => Ok(path),
        Err(e) => Err(e.to_string()),
    }
}

/// Implementación interna de la generación de reporte PDF
async fn generate_session_report_pdf_internal(
    session_log_id: String,
    user_id: String,
    role_id: i32,
) -> AppResult<String> {
    // 1. Obtener la sesión de Supabase
    let supabase_url = std::env::var("VITE_SUPABASE_URL")
        .map_err(|_| crate::error::AppError::EnvVar("VITE_SUPABASE_URL no configurada".into()))?;
    let service_role_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY")
        .map_err(|_| crate::error::AppError::EnvVar("SUPABASE_SERVICE_ROLE_KEY no configurada".into()))?;

    let client = reqwest::Client::new();
    let url = format!("{}/rest/v1/session_logs", supabase_url);

    // Construir query params
    let mut query_params = vec![
        ("select", "*".to_string()),
        ("session_id", format!("eq.{}", session_log_id)),
    ];
    
    println!("🔍 Generando PDF para session_id={}, user_id={}, role_id={}", session_log_id, user_id, role_id);
    
    // Validar permisos según rol
    match role_id {
        1 => {
            // Estudiante: solo puede generar reportes de sus propias sesiones
            println!("👤 Estudiante: agregando filtro user_id");
            query_params.push(("user_id", format!("eq.{}", user_id)));
        },
        2 => {
            // Profesor: puede ver sesiones de estudiantes de sus grupos
            // Por ahora permitimos la consulta, pero deberíamos validar con JOIN a groups
            println!("👨‍🏫 Profesor: sin filtro adicional (TODO: validar grupo)");
        },
        3 => {
            // Admin: puede ver todas las sesiones (no agregar filtro adicional)
            println!("👑 Admin: sin filtro adicional");
        },
        _ => {
            return Err(crate::error::AppError::Unauthorized(
                "Rol no reconocido".into()
            ));
        }
    }
    
    println!("🌐 Query URL: {}", url);
    println!("🔑 Query params: {:?}", query_params);

    let response = client
        .get(&url)
        .header("apikey", &service_role_key)
        .header("Authorization", format!("Bearer {}", service_role_key))
        .query(&query_params)
        .send()
        .await
        .map_err(|e| crate::error::AppError::Network(e.to_string()))?;

    println!("📡 Response status: {}", response.status());

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        println!("❌ Error response: {}", body);
        return Err(crate::error::AppError::Api(format!(
            "Error al obtener sesión: {} - {}",
            status, body
        )));
    }

    let logs: Vec<SessionLogForPdf> = response
        .json()
        .await
        .map_err(|e| crate::error::AppError::Serialization(e.to_string()))?;

    println!("📊 Logs encontrados: {}", logs.len());

    if logs.is_empty() {
        println!("❌ No se encontró la sesión con id={}", session_log_id);
        return Err(crate::error::AppError::NotFound(
            "Sesión no encontrada o sin permisos".into()
        ));
    }

    let log = &logs[0];

    // 2. Si el contenido está en storage, obtenerlo
    let html_content = if let Some(storage_path) = &log.storage_path {
        // Descargar desde Supabase Storage
        let storage_url = format!("{}/storage/v1/object/public/session-logs/{}", supabase_url, storage_path);
        let storage_response = client
            .get(&storage_url)
            .send()
            .await
            .map_err(|e| crate::error::AppError::Network(e.to_string()))?;

        if storage_response.status().is_success() {
            storage_response
                .text()
                .await
                .map_err(|e| crate::error::AppError::Network(e.to_string()))?
        } else {
            log.html_content.clone().unwrap_or_default()
        }
    } else {
        log.html_content.clone().unwrap_or_default()
    };

    // 3. Generar HTML para el reporte
    let report_html = generate_report_html(log, &html_content)?;

    // 4. Guardar HTML temporal
    let temp_dir = std::env::temp_dir();
    let html_path = temp_dir.join(format!("session_report_{}.html", session_log_id));
    let pdf_path = temp_dir.join(format!("session_report_{}.pdf", session_log_id));

    fs::write(&html_path, report_html)
        .map_err(|e| crate::error::AppError::Io(e))?;

    // 5. Llamar a WeasyPrint para convertir HTML a PDF
    let output = Command::new("python")
        .arg("-m")
        .arg("weasyprint")
        .arg(&html_path)
        .arg(&pdf_path)
        .output()
        .map_err(|e| crate::error::AppError::External(format!("Error ejecutando WeasyPrint: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(crate::error::AppError::External(format!(
            "WeasyPrint falló: {}",
            stderr
        )));
    }

    // 6. Limpiar archivo HTML temporal
    let _ = fs::remove_file(&html_path);

    // 7. Retornar path del PDF generado
    Ok(pdf_path.to_string_lossy().to_string())
}

/// Genera el HTML del reporte con estilos CSS inline
fn generate_report_html(log: &SessionLogForPdf, terminal_content: &str) -> AppResult<String> {
    let duration_text = if let Some(minutes) = log.duration_minutes {
        let hours = minutes / 60;
        let mins = minutes % 60;
        if hours > 0 {
            format!("{}h {}m", hours, mins)
        } else {
            format!("{}m", mins)
        }
    } else {
        "Sesión en curso".to_string()
    };

    let ended_text = log.ended_at.as_ref()
        .map(|e| format!("<p><strong>Finalizado:</strong> {}</p>", e))
        .unwrap_or_else(|| "<p><strong>Estado:</strong> En curso</p>".to_string());

    // Extraer comandos del contenido HTML del terminal (simplificado)
    let commands_section = extract_commands_from_html(terminal_content);

    let html = format!(
        r#"<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Reporte de Sesión - {}</title>
    <style>
        @page {{
            size: A4;
            margin: 2cm;
        }}
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
        }}
        .header {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 30px;
            text-align: center;
        }}
        .header h1 {{
            margin: 0;
            font-size: 28px;
        }}
        .header p {{
            margin: 10px 0 0 0;
            font-size: 14px;
            opacity: 0.9;
        }}
        .info-section {{
            background: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 20px;
            margin-bottom: 25px;
            border-radius: 5px;
        }}
        .info-section h2 {{
            color: #667eea;
            margin-top: 0;
            font-size: 20px;
        }}
        .info-section p {{
            margin: 8px 0;
        }}
        .info-section strong {{
            color: #555;
        }}
        .stats-grid {{
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            margin-bottom: 25px;
        }}
        .stat-card {{
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 15px;
            text-align: center;
        }}
        .stat-card h3 {{
            margin: 0 0 8px 0;
            font-size: 14px;
            color: #666;
            text-transform: uppercase;
        }}
        .stat-card .value {{
            font-size: 24px;
            font-weight: bold;
            color: #667eea;
        }}
        .commands-section {{
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 25px;
        }}
        .commands-section h2 {{
            color: #667eea;
            margin-top: 0;
            font-size: 20px;
        }}
        .terminal-content {{
            background: #1e1e1e;
            color: #d4d4d4;
            padding: 15px;
            border-radius: 5px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            max-height: 400px;
            overflow: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
        }}
        .footer {{
            text-align: center;
            color: #999;
            font-size: 12px;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
        }}
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 Reporte de Sesión SSH</h1>
        <p>Generado el {}</p>
    </div>

    <div class="info-section">
        <h2>Información de la Sesión</h2>
        <p><strong>Usuario:</strong> {}</p>
        <p><strong>Host:</strong> {}:{}</p>
        <p><strong>Iniciado:</strong> {}</p>
        {}
    </div>

    <div class="stats-grid">
        <div class="stat-card">
            <h3>Duración</h3>
            <div class="value">{}</div>
        </div>
        <div class="stat-card">
            <h3>ID de Sesión</h3>
            <div class="value" style="font-size: 14px;">{}</div>
        </div>
    </div>

    <div class="commands-section">
        <h2>Contenido del Terminal</h2>
        <div class="terminal-content">{}</div>
    </div>

    <div class="footer">
        <p>Este reporte fue generado automáticamente por el Sistema de Monitoreo SSH</p>
        <p>Universidad Piloto de Colombia - {}</p>
    </div>
</body>
</html>"#,
        log.hostname.as_deref().unwrap_or("Unknown"),
        Utc::now().format("%d/%m/%Y %H:%M:%S"),
        log.username.as_deref().unwrap_or("Unknown"),
        log.hostname.as_deref().unwrap_or("Unknown"),
        log.port.unwrap_or(22),
        log.started_at,
        ended_text,
        duration_text,
        log.session_id,
        commands_section,
        Utc::now().format("%Y")
    );

    Ok(html)
}

/// Extrae comandos del contenido HTML del terminal
fn extract_commands_from_html(html_content: &str) -> String {
    // Por ahora, retornamos el contenido HTML sin parsear
    // TODO: Implementar parser HTML para extraer solo los comandos ejecutados
    
    // Limitar el tamaño para evitar PDFs muy grandes
    let max_chars = 5000;
    if html_content.len() > max_chars {
        format!("{}...\n\n(Contenido truncado)", &html_content[..max_chars])
    } else {
        html_content.to_string()
    }
}

/// Genera un reporte PDF con SOLO el historial de comandos (sin output completo)
#[tauri::command]
pub async fn generate_commands_report(
    session_log_id: String,
    user_id: String,
    role_id: i32,
) -> Result<String, String> {
    match generate_commands_report_internal(session_log_id, user_id, role_id).await {
        Ok(path) => Ok(path),
        Err(e) => Err(e.to_string()),
    }
}

/// Implementación interna para generar reporte solo de comandos
async fn generate_commands_report_internal(
    session_log_id: String,
    user_id: String,
    role_id: i32,
) -> AppResult<String> {
    // 1. Obtener la sesión de Supabase (similar a generate_session_report_pdf_internal)
    let supabase_url = std::env::var("VITE_SUPABASE_URL")
        .map_err(|_| crate::error::AppError::EnvVar("VITE_SUPABASE_URL no configurada".into()))?;
    let service_role_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY")
        .map_err(|_| crate::error::AppError::EnvVar("SUPABASE_SERVICE_ROLE_KEY no configurada".into()))?;

    let client = reqwest::Client::new();
    let url = format!("{}/rest/v1/session_logs", supabase_url);

    // Construir query params con permisos según rol
    let mut query_params = vec![
        ("select", "*".to_string()),
        ("session_id", format!("eq.{}", session_log_id)),
    ];
    
    println!("🔍 Generando reporte de comandos para session_id={}, user_id={}, role_id={}", session_log_id, user_id, role_id);
    
    // Validar permisos según rol (igual que generate_session_report_pdf)
    match role_id {
        1 => {
            // Estudiante: solo puede generar reportes de sus propias sesiones
            println!("� Estudiante: agregando filtro user_id");
            query_params.push(("user_id", format!("eq.{}", user_id)));
        },
        2 => {
            // Profesor: puede ver sesiones de estudiantes de sus grupos
            println!("👨‍🏫 Profesor: sin filtro adicional (TODO: validar grupo)");
        },
        3 => {
            // Admin: puede ver todas las sesiones
            println!("👑 Admin: sin filtro adicional");
        },
        _ => {
            return Err(crate::error::AppError::Unauthorized(
                "Rol no reconocido".into()
            ));
        }
    }
    
    println!("🌐 Query URL: {}", url);
    println!("🔑 Query params: {:?}", query_params);

    let response = client
        .get(&url)
        .header("apikey", &service_role_key)
        .header("Authorization", format!("Bearer {}", service_role_key))
        .query(&query_params)
        .send()
        .await
        .map_err(|e| crate::error::AppError::Network(e.to_string()))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(crate::error::AppError::Api(format!(
            "Error al obtener sesión: {} - {}",
            status, body
        )));
    }

    let logs: Vec<SessionLogForPdf> = response
        .json()
        .await
        .map_err(|e| crate::error::AppError::Serialization(e.to_string()))?;

    if logs.is_empty() {
        return Err(crate::error::AppError::NotFound(
            "Sesión no encontrada o sin permisos".into()
        ));
    }

    let log = &logs[0];
    
    println!("📊 Sesión encontrada:");
    println!("  - ID: {}", log.id);
    println!("  - Session ID: {}", log.session_id);
    println!("  - User: {}", log.user_id);
    println!("  - Storage path: {:?}", log.storage_path);
    println!("  - HTML content length: {:?}", log.html_content.as_ref().map(|s| s.len()));

    // 2. Obtener contenido (de storage o directamente)
    let html_content = if let Some(storage_path) = &log.storage_path {
        println!("☁️ Recuperando contenido desde storage: {}", storage_path);
        let storage_url = format!("{}/storage/v1/object/public/session-logs/{}", supabase_url, storage_path);
        println!("🔗 Storage URL: {}", storage_url);
        
        let storage_response = client
            .get(&storage_url)
            .send()
            .await
            .map_err(|e| crate::error::AppError::Network(e.to_string()))?;

        if storage_response.status().is_success() {
            let content = storage_response
                .text()
                .await
                .map_err(|e| crate::error::AppError::Network(e.to_string()))?;
            println!("✅ Contenido desde storage: {} bytes", content.len());
            content
        } else {
            println!("⚠️ No se pudo obtener desde storage, usando html_content de DB");
            log.html_content.clone().unwrap_or_default()
        }
    } else {
        println!("💾 Usando html_content de la base de datos");
        log.html_content.clone().unwrap_or_default()
    };
    
    println!("📄 Contenido total a procesar: {} bytes", html_content.len());
    
    if html_content.is_empty() {
        println!("❌ ERROR: El contenido HTML está vacío!");
        return Err(crate::error::AppError::NotFound(
            "El contenido de la sesión está vacío. Es posible que la sesión no haya guardado datos.".into()
        ));
    }

    // 3. Extraer solo comandos (versión simplificada)
    let commands = extract_commands_only(&html_content);

    // 4. Generar HTML simple para comandos
    let report_html = generate_commands_html(log, &commands)?;

    // 5. Guardar HTML temporal
    let temp_dir = std::env::temp_dir();
    let html_path = temp_dir.join(format!("commands_report_{}.html", session_log_id));
    let pdf_path = temp_dir.join(format!("commands_report_{}.pdf", session_log_id));

    fs::write(&html_path, report_html)
        .map_err(|e| crate::error::AppError::Io(e))?;

    // 6. Llamar a WeasyPrint
    let output = Command::new("python")
        .arg("-m")
        .arg("weasyprint")
        .arg(&html_path)
        .arg(&pdf_path)
        .output()
        .map_err(|e| crate::error::AppError::External(format!("Error ejecutando WeasyPrint: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(crate::error::AppError::External(format!(
            "WeasyPrint falló: {}",
            stderr
        )));
    }

    // 7. Limpiar HTML temporal
    let _ = fs::remove_file(&html_path);

    // 8. Retornar path del PDF
    Ok(pdf_path.to_string_lossy().to_string())
}

/// Extrae solo los comandos del contenido HTML (sin output)
fn extract_commands_only(html_content: &str) -> Vec<String> {
    let mut commands = Vec::new();
    
    println!("📄 Procesando contenido HTML de {} bytes", html_content.len());
    
    // Extraer el contenido del <body> si existe (ignorar head, style, etc.)
    let body_content = if let Some(body_start) = html_content.find("<body>") {
        if let Some(body_end) = html_content.find("</body>") {
            &html_content[body_start + 6..body_end]
        } else {
            html_content
        }
    } else {
        html_content
    };
    
    println!("📦 Contenido del body: {} bytes", body_content.len());
    println!("🔍 Primeras 1000 caracteres del body:");
    println!("{}", &body_content[..body_content.len().min(1000)]);
    
    // Remover todas las etiquetas HTML
    let text_content = body_content
        .replace("<br>", "\n")
        .replace("<br/>", "\n")
        .replace("<br />", "\n")
        .replace("</div>", "\n")
        .replace("</p>", "\n")
        .replace("<div>", "")
        .replace("</span>", "")
        .replace("<p>", "")
        .replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        // Decodificar entidades HTML de caracteres especiales del prompt Kali
        .replace("&#x250C;", "┌")
        .replace("&#x2500;", "─")
        .replace("&#x2514;", "└")
        .replace("&#x327F;", "㉿");
    
    // Remover todas las etiquetas HTML que queden (regex para <tag...>)
    let tag_regex = regex::Regex::new(r"<[^>]+>").unwrap();
    let text_without_tags = tag_regex.replace_all(&text_content, "");
    
    // Remover secuencias ANSI (códigos de color/formato)
    let ansi_regex = regex::Regex::new(r"\x1b\[[0-9;]*[a-zA-Z]").unwrap();
    let clean_text = ansi_regex.replace_all(&text_without_tags, "");
    
    println!("📝 Texto limpio de {} caracteres", clean_text.len());
    println!("🔍 Primeras 50 líneas del texto limpio (buscando comandos):");
    for (i, line) in clean_text.lines().take(50).enumerate() {
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            println!("  Línea {}: '{}'", i + 1, trimmed);
        }
    }
    
    // Patrones de prompts comunes en Linux/Unix
    // Ahora incluimos el formato de Kali: └─$ comando
    let prompt_patterns = [
        r"└─\$\s*(.+)",                                          // └─$ comando (Kali Linux)
        r"└─#\s*(.+)",                                          // └─# comando (Kali root)
        r"([\w\-\.]+@[\w\-\.]+)[:\s]+([^\$#]*?)[\$#]\s*(.+)",  // user@host:path$ comando
        r"\[[\w\-\.]+@[\w\-\.]+[^\]]*\][\$#]\s*(.+)",           // [user@host path]$ comando
        r"^[\$#]\s*(.+)",                                        // $ comando o # comando (prompt simple)
    ];
    
    let mut found_any = false;
    
    for line in clean_text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        
        // Estrategia 1: Usar regex para detectar prompts
        for pattern in &prompt_patterns {
            if let Ok(re) = regex::Regex::new(pattern) {
                if let Some(captures) = re.captures(trimmed) {
                    // El último grupo de captura debería ser el comando
                    if let Some(cmd) = captures.get(captures.len() - 1) {
                        let command = cmd.as_str().trim();
                        if !command.is_empty() && command.len() > 1 {
                            println!("  ✅ Comando encontrado: '{}'", command);
                            commands.push(command.to_string());
                            found_any = true;
                            break;
                        }
                    }
                }
            }
        }
        
        // Estrategia 2: Buscar manualmente $ o # precedido por @
        if !found_any || commands.is_empty() {
            // Buscar @ seguido de algo y luego $ o #
            if trimmed.contains('@') {
                if let Some(dollar_pos) = trimmed.find('$').or_else(|| trimmed.find('#')) {
                    if dollar_pos < trimmed.len() - 1 {
                        let after_prompt = trimmed[dollar_pos + 1..].trim();
                        // Solo agregar si tiene contenido y no es solo output
                        if !after_prompt.is_empty() 
                            && after_prompt.len() > 1 
                            && !after_prompt.starts_with("bash")
                            && !after_prompt.starts_with("sh") {
                            println!("  ✅ Comando (manual): '{}'", after_prompt);
                            commands.push(after_prompt.to_string());
                            found_any = true;
                        }
                    }
                }
            }
        }
    }
    
    println!("✅ Total de comandos extraídos: {}", commands.len());
    
    // Si no se encontraron comandos, mostrar el contenido raw como fallback
    if commands.is_empty() {
        commands.push("❌ No se pudieron extraer comandos específicos del contenido.".to_string());
        commands.push("".to_string());
        commands.push("📋 Contenido de la sesión (primeras líneas):".to_string());
        commands.push("".to_string());
        
        // Mostrar primeras 30 líneas no vacías del contenido
        let mut line_count = 0;
        for line in clean_text.lines() {
            let trimmed = line.trim();
            if !trimmed.is_empty() && line_count < 30 {
                commands.push(trimmed.to_string());
                line_count += 1;
            }
        }
        
        if line_count == 0 {
            commands.push("(El contenido de la sesión está vacío)".to_string());
        }
    } else {
        println!("📋 Comandos encontrados:");
        for (i, cmd) in commands.iter().enumerate() {
            println!("  {}. {}", i + 1, cmd);
        }
    }
    
    commands
}

/// Genera HTML simple para el reporte de comandos
fn generate_commands_html(log: &SessionLogForPdf, commands: &[String]) -> AppResult<String> {
    let duration_text = if let Some(minutes) = log.duration_minutes {
        let hours = minutes / 60;
        let mins = minutes % 60;
        if hours > 0 {
            format!("{}h {}m", hours, mins)
        } else {
            format!("{}m", mins)
        }
    } else {
        "Sesión en curso".to_string()
    };

    let commands_list = commands
        .iter()
        .enumerate()
        .map(|(i, cmd)| format!("<div class='command-line'><span class='cmd-number'>{}</span> {}</div>", i + 1, cmd))
        .collect::<Vec<_>>()
        .join("\n");

    let html = format!(
        r#"<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Historial de Comandos - {}</title>
    <style>
        @page {{
            size: A4;
            margin: 2cm;
        }}
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
        }}
        .header {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 30px;
            text-align: center;
        }}
        .header h1 {{
            margin: 0;
            font-size: 28px;
        }}
        .header p {{
            margin: 10px 0 0 0;
            font-size: 14px;
            opacity: 0.9;
        }}
        .info-section {{
            background: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 20px;
            margin-bottom: 25px;
            border-radius: 5px;
        }}
        .info-section p {{
            margin: 8px 0;
        }}
        .info-section strong {{
            color: #555;
        }}
        .commands-section {{
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 25px;
        }}
        .commands-section h2 {{
            color: #667eea;
            margin-top: 0;
            font-size: 20px;
        }}
        .command-line {{
            background: #f8f9fa;
            border-left: 3px solid #667eea;
            padding: 10px 15px;
            margin: 8px 0;
            font-family: 'Courier New', monospace;
            font-size: 13px;
            border-radius: 4px;
        }}
        .cmd-number {{
            display: inline-block;
            background: #667eea;
            color: white;
            padding: 2px 8px;
            border-radius: 3px;
            margin-right: 10px;
            font-size: 11px;
            font-weight: bold;
        }}
        .footer {{
            text-align: center;
            color: #999;
            font-size: 12px;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
        }}
    </style>
</head>
<body>
    <div class="header">
        <h1>📜 Historial de Comandos SSH</h1>
        <p>Generado el {}</p>
    </div>

    <div class="info-section">
        <p><strong>Usuario:</strong> {}</p>
        <p><strong>Host:</strong> {}:{}</p>
        <p><strong>Iniciado:</strong> {}</p>
        <p><strong>Duración:</strong> {}</p>
        <p><strong>Total de comandos:</strong> {}</p>
    </div>

    <div class="commands-section">
        <h2>Comandos Ejecutados</h2>
        {}
    </div>

    <div class="footer">
        <p>Este reporte fue generado automáticamente por el Sistema de Monitoreo SSH</p>
        <p>Universidad Piloto de Colombia - {}</p>
    </div>
</body>
</html>"#,
        log.hostname.as_deref().unwrap_or("Unknown"),
        Utc::now().format("%d/%m/%Y %H:%M:%S"),
        log.username.as_deref().unwrap_or("Unknown"),
        log.hostname.as_deref().unwrap_or("Unknown"),
        log.port.unwrap_or(22),
        log.started_at,
        duration_text,
        commands.len(),
        commands_list,
        Utc::now().format("%Y")
    );

    Ok(html)
}

/// Copia un archivo de una ubicación a otra
#[tauri::command]
pub async fn copy_file(source: String, destination: String) -> Result<(), String> {
    fs::copy(&source, &destination)
        .map_err(|e| format!("Error copiando archivo: {}", e))?;
    
    // Limpiar archivo temporal
    let _ = fs::remove_file(&source);
    
    Ok(())
}

/// Muestra un diálogo para guardar archivo y copia el PDF temporal a la ubicación elegida
#[tauri::command]
pub async fn save_pdf_dialog(temp_pdf_path: String, default_filename: String) -> Result<String, String> {
    use rfd::FileDialog;
    
    let save_path = FileDialog::new()
        .set_file_name(&default_filename)
        .add_filter("PDF", &["pdf"])
        .save_file();
    
    if let Some(path) = save_path {
        let destination = path.to_string_lossy().to_string();
        
        // Copiar el archivo temporal a la ubicación elegida
        fs::copy(&temp_pdf_path, &destination)
            .map_err(|e| format!("Error copiando PDF: {}", e))?;
        
        // Limpiar archivo temporal
        let _ = fs::remove_file(&temp_pdf_path);
        
        Ok(destination)
    } else {
        // Usuario canceló el diálogo, limpiar archivo temporal
        let _ = fs::remove_file(&temp_pdf_path);
        Err("Diálogo cancelado".into())
    }
}
