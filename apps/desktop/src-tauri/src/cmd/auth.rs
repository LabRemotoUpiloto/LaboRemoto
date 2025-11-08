use crate::cmd::jwt::generate_jwt;
use crate::cmd::ldap_auth::authenticate_ldap;
use crate::cmd::mock_auth::{authenticate_mock, AuthMode};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::env;

/// Respuesta exitosa del login
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LoginResponse {
    pub success: bool,
    pub user_id: String,
    pub username: String,
    pub email: String,
    pub name: String,
    pub role_id: i16,
    pub token: String,
    pub auth_mode: String, // "mock" o "ldap"
}

/// Comando Tauri: Autenticar usuario (Mock o LDAP según configuración)
#[tauri::command]
pub async fn login(username: String, password: String) -> Result<LoginResponse, String> {
    let auth_mode = AuthMode::from_env();
    
    match auth_mode {
        AuthMode::Mock => login_mock(username, password).await,
        AuthMode::Ldap => login_ldap(username, password).await,
        AuthMode::Hybrid => {
            // Intentar primero con mock, si falla intentar LDAP
            match login_mock(username.clone(), password.clone()).await {
                Ok(response) => Ok(response),
                Err(_) => login_ldap(username, password).await,
            }
        }
    }
}

/// Login con usuario mock
async fn login_mock(username: String, password: String) -> Result<LoginResponse, String> {
    // 1. Validar contra mock_users en Supabase
    let mock_user = authenticate_mock(&username, &password)
        .await
        .map_err(|e| format!("Error de autenticación: {}", e))?;

    // 2. Buscar user_id en tabla users
    let user_id = get_user_id_from_username(&username)
        .await
        .unwrap_or_else(|_| mock_user.id.clone());

    // 3. Generar JWT token
    let token = generate_jwt(&user_id, &username, &mock_user.email, mock_user.role_id)
        .map_err(|e| format!("Error al generar token: {}", e))?;

    Ok(LoginResponse {
        success: true,
        user_id,
        username,
        email: mock_user.email,
        name: mock_user.name,
        role_id: mock_user.role_id,
        token,
        auth_mode: "mock".to_string(),
    })
}

/// Login con LDAP
async fn login_ldap(username: String, password: String) -> Result<LoginResponse, String> {
    // 1. Validar contra LDAP
    let ldap_user = authenticate_ldap(&username, &password)
        .await
        .map_err(|e| format!("Error de autenticación LDAP: {}", e))?;

    // 2. Sincronizar con Supabase (crear/actualizar usuario)
    let user_id = sync_user_to_supabase(&ldap_user)
        .await
        .map_err(|e| format!("Error al sincronizar con base de datos: {}", e))?;

    // 3. Generar JWT token
    let token = generate_jwt(&user_id, &ldap_user.username, &ldap_user.email, ldap_user.role_id)
        .map_err(|e| format!("Error al generar token: {}", e))?;

    Ok(LoginResponse {
        success: true,
        user_id,
        username: ldap_user.username,
        email: ldap_user.email,
        name: ldap_user.name,
        role_id: ldap_user.role_id,
        token,
        auth_mode: "ldap".to_string(),
    })
}

/// Obtiene el user_id desde la tabla users por username
async fn get_user_id_from_username(username: &str) -> Result<String> {
    let supabase_url = env::var("VITE_SUPABASE_URL")
        .context("VITE_SUPABASE_URL no configurado")?;
    
    let service_role_key = env::var("SUPABASE_SERVICE_ROLE_KEY")
        .context("SUPABASE_SERVICE_ROLE_KEY no configurado")?;

    let client = reqwest::Client::new();
    let search_url = format!(
        "{}/rest/v1/users?ldap_username=eq.{}",
        supabase_url, username
    );
    
    let response: Vec<serde_json::Value> = client
        .get(&search_url)
        .header("apikey", &service_role_key)
        .header("Authorization", format!("Bearer {}", service_role_key))
        .send()
        .await
        .context("Error buscando usuario")?
        .json()
        .await
        .context("Error parseando respuesta")?;
    
    let user_id = response
        .first()
        .and_then(|u| u["id"].as_str())
        .context("Usuario no encontrado")?
        .to_string();
    
    Ok(user_id)
}

/// Sincroniza el usuario LDAP con Supabase
async fn sync_user_to_supabase(ldap_user: &crate::cmd::ldap_auth::LdapUser) -> Result<String> {
    let supabase_url = env::var("VITE_SUPABASE_URL")
        .context("VITE_SUPABASE_URL no configurado")?;
    let service_key = env::var("SUPABASE_SERVICE_ROLE_KEY")
        .context("SUPABASE_SERVICE_ROLE_KEY no configurado")?;

    let client = reqwest::Client::new();

    // 1. Buscar si el usuario ya existe
    let search_url = format!(
        "{}/rest/v1/users?email=eq.{}",
        supabase_url, ldap_user.email
    );

    let search_response = client
        .get(&search_url)
        .header("apikey", &service_key)
        .header("Authorization", format!("Bearer {}", service_key))
        .send()
        .await
        .context("Error al buscar usuario en Supabase")?;

    let existing_users: Vec<serde_json::Value> = search_response
        .json()
        .await
        .context("Error al parsear respuesta de Supabase")?;

    if let Some(existing_user) = existing_users.first() {
        // Usuario ya existe, actualizar
        let user_id = existing_user["id"]
            .as_str()
            .context("ID de usuario no encontrado")?
            .to_string();

        let update_url = format!("{}/rest/v1/users?id=eq.{}", supabase_url, user_id);
        let update_body = serde_json::json!({
            "name": ldap_user.name,
            "role_id": ldap_user.role_id,
            "is_active": true,
            "updated_at": chrono::Utc::now().to_rfc3339(),
        });

        client
            .patch(&update_url)
            .header("apikey", &service_key)
            .header("Authorization", format!("Bearer {}", service_key))
            .header("Content-Type", "application/json")
            .json(&update_body)
            .send()
            .await
            .context("Error al actualizar usuario en Supabase")?;

        Ok(user_id)
    } else {
        // Usuario nuevo, crear
        let create_url = format!("{}/rest/v1/users", supabase_url);
        let create_body = serde_json::json!({
            "email": ldap_user.email,
            "name": ldap_user.name,
            "role_id": ldap_user.role_id,
            "is_active": true,
        });

        let create_response = client
            .post(&create_url)
            .header("apikey", &service_key)
            .header("Authorization", format!("Bearer {}", service_key))
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation")
            .json(&create_body)
            .send()
            .await
            .context("Error al crear usuario en Supabase")?;

        let created_users: Vec<serde_json::Value> = create_response
            .json()
            .await
            .context("Error al parsear respuesta de creación")?;

        let user_id = created_users
            .first()
            .and_then(|u| u["id"].as_str())
            .context("ID de usuario no devuelto después de creación")?
            .to_string();

        Ok(user_id)
    }
}

/// Comando Tauri: Validar token JWT
#[tauri::command]
pub fn validate_token(token: String) -> Result<bool, String> {
    use crate::cmd::jwt::validate_jwt;
    
    match validate_jwt(&token) {
        Ok(_claims) => Ok(true),
        Err(e) => Err(format!("Token inválido: {}", e)),
    }
}

/// Comando Tauri: Obtener información del usuario desde el token
#[tauri::command]
pub fn get_user_from_token(token: String) -> Result<serde_json::Value, String> {
    use crate::cmd::jwt::validate_jwt;
    
    let claims = validate_jwt(&token)
        .map_err(|e| format!("Token inválido: {}", e))?;

    Ok(serde_json::json!({
        "user_id": claims.sub,
        "username": claims.username,
        "email": claims.email,
        "role_id": claims.role_id,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_ldap_login_mock() {
        // Configurar variables de entorno de prueba
        std::env::set_var("JWT_SECRET", "test_secret");
        std::env::set_var("JWT_EXPIRATION_HOURS", "24");
        std::env::set_var("VITE_SUPABASE_URL", "http://localhost:54321");
        std::env::set_var("SUPABASE_SERVICE_ROLE_KEY", "test_key");

        // Nota: Este test fallará sin un servidor LDAP real
        // Para testing, usa authenticate_ldap_mock en lugar de authenticate_ldap
    }
}
