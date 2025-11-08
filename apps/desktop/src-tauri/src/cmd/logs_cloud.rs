use crate::cmd::ldap_sync::{save_session_log_to_supabase, upload_log_to_storage};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveLogRequest {
    pub user_id: String,
    pub session_id: String,
    pub host: String,
    pub username: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_seconds: Option<i32>,
    pub html_content: String,
    pub save_to_storage: bool, // true: Storage, false: directamente en DB
}

#[tauri::command]
pub async fn save_session_log_cloud(request: SaveLogRequest) -> Result<String, String> {
    let storage_path = if request.save_to_storage {
        // Opción 1: Subir HTML a Supabase Storage (recomendado para logs grandes)
        let path = upload_log_to_storage(
            &request.user_id,
            &request.session_id,
            &request.html_content,
        ).await?;
        
        // Guardar metadata con referencia al archivo en Storage
        save_session_log_to_supabase(
            &request.user_id,
            &request.session_id,
            &request.host,
            &request.username,
            &request.started_at,
            request.ended_at.as_deref(),
            request.duration_seconds,
            None, // No guardar HTML en DB
            Some(&path),
        ).await?;
        
        path
    } else {
        // Opción 2: Guardar HTML directamente en la columna de DB (para logs pequeños)
        save_session_log_to_supabase(
            &request.user_id,
            &request.session_id,
            &request.host,
            &request.username,
            &request.started_at,
            request.ended_at.as_deref(),
            request.duration_seconds,
            Some(&request.html_content),
            None, // No usar Storage
        ).await?;
        
        "saved_to_db".to_string()
    };
    
    Ok(storage_path)
}

#[tauri::command]
pub async fn get_user_session_logs(
    user_id: String,
    limit: Option<i32>,
) -> Result<Vec<serde_json::Value>, String> {
    use crate::cmd::ldap_sync::get_user_logs_from_supabase;
    
    get_user_logs_from_supabase(&user_id, limit).await
}

/// Obtiene logs de sesión filtrados por rol del usuario
/// - Estudiantes: solo sus propios logs
/// - Profesores: logs de sus grupos (cuando se implemente)
/// - Administradores: todos los logs
#[tauri::command]
pub async fn get_session_logs_by_role(
    user_id: String,
    role_id: i32,
    limit: Option<i32>,
) -> Result<Vec<serde_json::Value>, String> {
    use crate::cmd::ldap_sync::get_logs_by_role;
    
    println!("🔍 Getting logs for user {} with role {}", user_id, role_id);
    
    let logs = get_logs_by_role(&user_id, role_id, limit).await?;
    
    println!("✅ Retrieved {} logs for role {}", logs.len(), role_id);
    
    Ok(logs)
}

#[tauri::command]
pub async fn get_log_html_content(
    user_id: String,
    session_id: String,
) -> Result<String, String> {
    let supabase_url = std::env::var("VITE_SUPABASE_URL")
        .map_err(|_| "VITE_SUPABASE_URL no configurado".to_string())?;
    
    let service_role_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY")
        .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY no configurado".to_string())?;

    let client = reqwest::Client::new();
    
    // 1. Buscar el log en la DB solo por session_id (es único)
    let search_url = format!(
        "{}/rest/v1/session_logs?session_id=eq.{}",
        supabase_url, session_id
    );
    
    let logs: Vec<serde_json::Value> = client
        .get(&search_url)
        .header("apikey", &service_role_key)
        .header("Authorization", format!("Bearer {}", service_role_key))
        .send()
        .await
        .map_err(|e| format!("Error buscando log: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Error parseando respuesta: {}", e))?;
    
    let log = logs.first().ok_or("Log no encontrado")?;
    
    // 2. Verificar si está en DB o en Storage
    if let Some(html) = log.get("html_content").and_then(|v| v.as_str()) {
        // Está guardado directamente en DB
        return Ok(html.to_string());
    }
    
    if let Some(storage_path) = log.get("storage_path").and_then(|v| v.as_str()) {
        // Está en Storage: descargar
        let download_url = format!(
            "{}/storage/v1/object/session-logs/{}",
            supabase_url, storage_path
        );
        
        let html_content = client
            .get(&download_url)
            .header("apikey", &service_role_key)
            .header("Authorization", format!("Bearer {}", service_role_key))
            .send()
            .await
            .map_err(|e| format!("Error descargando log: {}", e))?
            .text()
            .await
            .map_err(|e| format!("Error leyendo contenido: {}", e))?;
        
        return Ok(html_content);
    }
    
    Err("Log no tiene contenido HTML".to_string())
}
