use anyhow::{Context, Result};
use argon2::{Argon2, PasswordHash, PasswordVerifier};
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MockUser {
    pub id: String,
    pub username: String,
    pub email: String,
    pub name: String,
    pub role_id: i16,
}

/// Modo de autenticación
#[derive(Debug, Clone, PartialEq)]
pub enum AuthMode {
    Mock,       // Solo usuarios mock (desarrollo)
    Ldap,       // Solo LDAP (producción con universidad)
    Hybrid,     // Ambos: mock para admins, LDAP para usuarios normales
}

impl AuthMode {
    pub fn from_env() -> Self {
        match env::var("AUTH_MODE")
            .unwrap_or_else(|_| "mock".to_string())
            .to_lowercase()
            .as_str()
        {
            "ldap" => AuthMode::Ldap,
            "hybrid" => AuthMode::Hybrid,
            _ => AuthMode::Mock,
        }
    }
}

/// Autentica usuario mock contra la base de datos
pub async fn authenticate_mock(username: &str, password: &str) -> Result<MockUser> {
    let supabase_url = env::var("VITE_SUPABASE_URL")
        .context("VITE_SUPABASE_URL no configurado")?;
    
    let service_role_key = env::var("SUPABASE_SERVICE_ROLE_KEY")
        .context("SUPABASE_SERVICE_ROLE_KEY no configurado")?;

    let client = reqwest::Client::new();
    
    // Buscar usuario mock por username
    let search_url = format!(
        "{}/rest/v1/mock_users?username=eq.{}&is_active=eq.true",
        supabase_url, username
    );
    
    let response: Vec<serde_json::Value> = client
        .get(&search_url)
        .header("apikey", &service_role_key)
        .header("Authorization", format!("Bearer {}", service_role_key))
        .send()
        .await
        .context("Error buscando usuario mock")?
        .json()
        .await
        .context("Error parseando respuesta")?;
    
    let user_data = response.first().context("Usuario no encontrado")?;
    
    // Verificar password
    let password_hash = user_data["password_hash"]
        .as_str()
        .context("Hash de password no encontrado")?;
    
    verify_password(password, password_hash)?;
    
    // Retornar usuario
    Ok(MockUser {
        id: user_data["id"].as_str().unwrap_or_default().to_string(),
        username: user_data["username"].as_str().unwrap_or_default().to_string(),
        email: user_data["email"].as_str().unwrap_or_default().to_string(),
        name: user_data["name"].as_str().unwrap_or_default().to_string(),
        role_id: user_data["role_id"].as_i64().unwrap_or(1) as i16,
    })
}

/// Verifica password con Argon2
fn verify_password(password: &str, hash: &str) -> Result<()> {
    let parsed_hash = PasswordHash::new(hash)
        .map_err(|e| anyhow::anyhow!("Hash de password inválido: {}", e))?;
    
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .map_err(|e| anyhow::anyhow!("Password incorrecto: {}", e))?;
    
    Ok(())
}

/// Crea hash de password con Argon2 (para registrar nuevos usuarios)
pub fn hash_password(password: &str) -> Result<String> {
    use argon2::{
        password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
        Argon2,
    };
    
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| anyhow::anyhow!("Error generando hash: {}", e))?
        .to_string();
    
    Ok(hash)
}

/// Registra un nuevo usuario mock en Supabase
#[tauri::command]
pub async fn register_mock_user(
    username: String,
    password: String,
    email: String,
    name: String,
    role_id: i16,
) -> Result<String, String> {
    let password_hash = hash_password(&password)
        .map_err(|e| e.to_string())?;
    
    let supabase_url = env::var("VITE_SUPABASE_URL")
        .map_err(|_| "VITE_SUPABASE_URL no configurado".to_string())?;
    
    let service_role_key = env::var("SUPABASE_SERVICE_ROLE_KEY")
        .map_err(|_| "SUPABASE_SERVICE_ROLE_KEY no configurado".to_string())?;

    let client = reqwest::Client::new();
    
    // Llamar a la función SQL register_mock_user
    let rpc_url = format!("{}/rest/v1/rpc/register_mock_user", supabase_url);
    
    let body = serde_json::json!({
        "p_username": username,
        "p_password_hash": password_hash,
        "p_email": email,
        "p_name": name,
        "p_role_id": role_id,
    });
    
    let response: serde_json::Value = client
        .post(&rpc_url)
        .header("apikey", &service_role_key)
        .header("Authorization", format!("Bearer {}", service_role_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Error registrando usuario: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Error parseando respuesta: {}", e))?;
    
    let user_id = response.as_str()
        .ok_or_else(|| "ID no devuelto".to_string())?;
    Ok(user_id.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_and_verify_password() {
        let password = "test123";
        let hash = hash_password(password).unwrap();
        
        assert!(verify_password(password, &hash).is_ok());
        assert!(verify_password("wrong", &hash).is_err());
    }

    #[test]
    fn test_auth_mode_from_env() {
        std::env::set_var("AUTH_MODE", "mock");
        assert_eq!(AuthMode::from_env(), AuthMode::Mock);
        
        std::env::set_var("AUTH_MODE", "ldap");
        assert_eq!(AuthMode::from_env(), AuthMode::Ldap);
        
        std::env::set_var("AUTH_MODE", "hybrid");
        assert_eq!(AuthMode::from_env(), AuthMode::Hybrid);
    }
}
