// Sincronización entre LDAP y Supabase
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserSession {
    pub user_id: String,
    pub ldap_username: String,
    pub email: String,
    pub name: String,
    pub role_id: i16,
    pub token: String,
}

/// Sincroniza usuario LDAP con Supabase
pub async fn sync_ldap_user_to_supabase(
    ldap_username: &str,
    email: &str,
    name: &str,
    role_id: i16,
    ldap_dn: &str,
) -> Result<String, String> {
    let supabase_url = std::env::var("VITE_SUPABASE_URL")
        .map_err(|_| "VITE_SUPABASE_URL no configurado".to_string())?;
    
    let service_role_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY")
        .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY no configurado".to_string())?;

    let client = reqwest::Client::new();
    
    // Buscar si el usuario ya existe
    let search_url = format!(
        "{}/rest/v1/users?ldap_username=eq.{}",
        supabase_url, ldap_username
    );
    
    let existing: Vec<serde_json::Value> = client
        .get(&search_url)
        .header("apikey", &service_role_key)
        .header("Authorization", format!("Bearer {}", service_role_key))
        .send()
        .await
        .map_err(|e| format!("Error buscando usuario: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Error parseando respuesta: {}", e))?;

    let now = chrono::Utc::now().to_rfc3339();

    if let Some(user) = existing.first() {
        // Usuario existe: actualizar
        let user_id = user["id"].as_str().unwrap_or_default();
        
        let update_url = format!(
            "{}/rest/v1/users?id=eq.{}",
            supabase_url, user_id
        );
        
        let update_data = json!({
            "email": email,
            "name": name,
            "role_id": role_id,
            "ldap_dn": ldap_dn,
            "last_login_at": now,
            "ldap_synced_at": now,
            "updated_at": now
        });
        
        client
            .patch(&update_url)
            .header("apikey", &service_role_key)
            .header("Authorization", format!("Bearer {}", service_role_key))
            .header("Content-Type", "application/json")
            .header("Prefer", "return=minimal")
            .json(&update_data)
            .send()
            .await
            .map_err(|e| format!("Error actualizando usuario: {}", e))?;
        
        Ok(user_id.to_string())
    } else {
        // Usuario no existe: crear
        let insert_url = format!("{}/rest/v1/users", supabase_url);
        
        let insert_data = json!({
            "ldap_username": ldap_username,
            "ldap_dn": ldap_dn,
            "email": email,
            "name": name,
            "role_id": role_id,
            "last_login_at": now,
            "ldap_synced_at": now
        });
        
        let response: Vec<serde_json::Value> = client
            .post(&insert_url)
            .header("apikey", &service_role_key)
            .header("Authorization", format!("Bearer {}", service_role_key))
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation")
            .json(&insert_data)
            .send()
            .await
            .map_err(|e| format!("Error creando usuario: {}", e))?
            .json()
            .await
            .map_err(|e| format!("Error parseando respuesta: {}", e))?;
        
        let user_id = response
            .first()
            .and_then(|u| u["id"].as_str())
            .ok_or("No se pudo obtener el ID del usuario creado")?;
        
        Ok(user_id.to_string())
    }
}

/// Guarda un log de sesión en Supabase
pub async fn save_session_log_to_supabase(
    user_id: &str,
    session_id: &str,
    host: &str,
    username: &str,
    started_at: &str,
    ended_at: Option<&str>,
    duration_seconds: Option<i32>,
    html_content: Option<&str>,
    storage_path: Option<&str>,
) -> Result<(), String> {
    let supabase_url = std::env::var("VITE_SUPABASE_URL")
        .map_err(|_| "VITE_SUPABASE_URL no configurado".to_string())?;
    
    let service_role_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY")
        .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY no configurado".to_string())?;

    let client = reqwest::Client::new();
    let insert_url = format!("{}/rest/v1/session_logs", supabase_url);
    
    let mut log_data = json!({
        "user_id": user_id,
        "session_id": session_id,
        "host": host,
        "username": username,
        "started_at": started_at,
    });
    
    if let Some(ended) = ended_at {
        log_data["ended_at"] = json!(ended);
    }
    
    if let Some(duration) = duration_seconds {
        log_data["duration_seconds"] = json!(duration);
    }
    
    if let Some(html) = html_content {
        log_data["html_content"] = json!(html);
    }
    
    if let Some(path) = storage_path {
        log_data["storage_path"] = json!(path);
    }
    
    client
        .post(&insert_url)
        .header("apikey", &service_role_key)
        .header("Authorization", format!("Bearer {}", service_role_key))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=minimal")
        .json(&log_data)
        .send()
        .await
        .map_err(|e| format!("Error guardando log: {}", e))?;
    
    Ok(())
}

/// Sube el archivo HTML del log a Supabase Storage
pub async fn upload_log_to_storage(
    user_id: &str,
    session_id: &str,
    html_content: &str,
) -> Result<String, String> {
    let supabase_url = std::env::var("VITE_SUPABASE_URL")
        .map_err(|_| "VITE_SUPABASE_URL no configurado".to_string())?;
    
    let service_role_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY")
        .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY no configurado".to_string())?;

    let client = reqwest::Client::new();
    
    // Ruta en Storage: user_id/session_id.html
    let storage_path = format!("{}/{}.html", user_id, session_id);
    let upload_url = format!(
        "{}/storage/v1/object/session-logs/{}",
        supabase_url, storage_path
    );
    
    client
        .post(&upload_url)
        .header("apikey", &service_role_key)
        .header("Authorization", format!("Bearer {}", service_role_key))
        .header("Content-Type", "text/html")
        .body(html_content.to_string())
        .send()
        .await
        .map_err(|e| format!("Error subiendo log a Storage: {}", e))?;
    
    Ok(storage_path)
}

/// Obtiene logs del usuario desde Supabase
pub async fn get_user_logs_from_supabase(
    user_id: &str,
    limit: Option<i32>,
) -> Result<Vec<serde_json::Value>, String> {
    let supabase_url = std::env::var("VITE_SUPABASE_URL")
        .map_err(|_| "VITE_SUPABASE_URL no configurado".to_string())?;
    
    let service_role_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY")
        .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY no configurado".to_string())?;

    let client = reqwest::Client::new();
    
    let limit_str = limit.map(|l| format!("&limit={}", l)).unwrap_or_default();
    let search_url = format!(
        "{}/rest/v1/session_logs?user_id=eq.{}&order=started_at.desc{}",
        supabase_url, user_id, limit_str
    );
    
    let logs: Vec<serde_json::Value> = client
        .get(&search_url)
        .header("apikey", &service_role_key)
        .header("Authorization", format!("Bearer {}", service_role_key))
        .send()
        .await
        .map_err(|e| format!("Error obteniendo logs: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Error parseando logs: {}", e))?;
    
    Ok(logs)
}

/// Obtiene logs filtrados por rol del usuario
/// - Estudiante (role_id=1): solo sus propios logs
/// - Profesor (role_id=2): logs de estudiantes de sus grupos
/// - Admin (role_id=3): todos los logs
pub async fn get_logs_by_role(
    user_id: &str,
    role_id: i32,
    limit: Option<i32>,
) -> Result<Vec<serde_json::Value>, String> {
    let supabase_url = std::env::var("VITE_SUPABASE_URL")
        .map_err(|_| "VITE_SUPABASE_URL no configurado".to_string())?;
    
    let service_role_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY")
        .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY no configurado".to_string())?;

    let client = reqwest::Client::new();
    let limit_str = limit.map(|l| format!("&limit={}", l)).unwrap_or_default();
    
    let search_url = match role_id {
        1 => {
            // Estudiante: solo sus propios logs
            format!(
                "{}/rest/v1/session_logs?user_id=eq.{}&order=started_at.desc{}",
                supabase_url, user_id, limit_str
            )
        },
        2 => {
            // Profesor: logs de estudiantes de sus grupos
            // Primero obtener los IDs de estudiantes en grupos del profesor
            let groups_url = format!(
                "{}/rest/v1/group_members?select=student_id&group_id=in.(select%20id%20from%20groups%20where%20professor_id%3D{})",
                supabase_url, user_id
            );
            
            // Hacer query para obtener student_ids
            match client
                .get(&groups_url)
                .header("apikey", &service_role_key)
                .header("Authorization", format!("Bearer {}", service_role_key))
                .send()
                .await
            {
                Ok(response) => {
                    let students: Vec<serde_json::Value> = response.json().await.unwrap_or_default();
                    let student_ids: Vec<String> = students
                        .iter()
                        .filter_map(|s| s["student_id"].as_str())
                        .map(|id| id.to_string())
                        .collect();
                    
                    if student_ids.is_empty() {
                        // Si no tiene estudiantes, mostrar solo sus propios logs
                        format!(
                            "{}/rest/v1/session_logs?user_id=eq.{}&order=started_at.desc{}",
                            supabase_url, user_id, limit_str
                        )
                    } else {
                        // Mostrar logs de sus estudiantes Y los propios
                        let ids_filter = format!("{},{}", user_id, student_ids.join(","));
                        format!(
                            "{}/rest/v1/session_logs?user_id=in.({})&order=started_at.desc{}",
                            supabase_url, ids_filter, limit_str
                        )
                    }
                },
                Err(_) => {
                    // Si falla el query de grupos, mostrar solo sus logs
                    format!(
                        "{}/rest/v1/session_logs?user_id=eq.{}&order=started_at.desc{}",
                        supabase_url, user_id, limit_str
                    )
                }
            }
        },
        3 => {
            // Admin: todos los logs sin filtro
            format!(
                "{}/rest/v1/session_logs?order=started_at.desc{}",
                supabase_url, limit_str
            )
        },
        _ => {
            return Err(format!("Rol inválido: {}", role_id));
        }
    };
    
    let logs: Vec<serde_json::Value> = client
        .get(&search_url)
        .header("apikey", &service_role_key)
        .header("Authorization", format!("Bearer {}", service_role_key))
        .send()
        .await
        .map_err(|e| format!("Error obteniendo logs: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Error parseando logs: {}", e))?;
    
    Ok(logs)
}
