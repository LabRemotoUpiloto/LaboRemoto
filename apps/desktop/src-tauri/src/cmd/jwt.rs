use anyhow::{Context, Result};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::env;

/// Claims del JWT token
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String,        // Subject (user_id)
    pub username: String,   // Nombre de usuario
    pub email: String,      // Email del usuario
    pub role_id: i16,       // Rol: 1=student, 2=professor, 3=admin
    pub exp: i64,           // Expiration time
    pub iat: i64,           // Issued at
}

/// Genera un JWT token para el usuario
pub fn generate_jwt(
    user_id: &str,
    username: &str,
    email: &str,
    role_id: i16,
) -> Result<String> {
    let secret = env::var("JWT_SECRET")
        .unwrap_or_else(|_| "default_secret_change_in_production".to_string());
    
    let expiration_hours: i64 = env::var("JWT_EXPIRATION_HOURS")
        .unwrap_or_else(|_| "24".to_string())
        .parse()
        .unwrap_or(24);

    let now = Utc::now();
    let expiration = now + Duration::hours(expiration_hours);

    let claims = Claims {
        sub: user_id.to_string(),
        username: username.to_string(),
        email: email.to_string(),
        role_id,
        exp: expiration.timestamp(),
        iat: now.timestamp(),
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .context("Error al generar JWT token")?;

    Ok(token)
}

/// Valida un JWT token y extrae los claims
pub fn validate_jwt(token: &str) -> Result<Claims> {
    let secret = env::var("JWT_SECRET")
        .unwrap_or_else(|_| "default_secret_change_in_production".to_string());

    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .context("Token inválido o expirado")?;

    Ok(token_data.claims)
}

/// Verifica si el token está expirado
pub fn is_token_expired(claims: &Claims) -> bool {
    let now = Utc::now().timestamp();
    claims.exp < now
}

/// Extrae el user_id del token sin validar la firma (solo para logging/debugging)
pub fn extract_user_id_unsafe(token: &str) -> Option<String> {
    use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
    
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return None;
    }

    let payload = parts[1];
    let decoded = URL_SAFE_NO_PAD.decode(payload).ok()?;
    let claims: Claims = serde_json::from_slice(&decoded).ok()?;
    
    Some(claims.sub)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_and_validate_jwt() {
        std::env::set_var("JWT_SECRET", "test_secret_key");
        std::env::set_var("JWT_EXPIRATION_HOURS", "24");

        let token = generate_jwt(
            "user-123",
            "test_user",
            "test@universidad.edu",
            1,
        )
        .unwrap();

        assert!(!token.is_empty());

        let claims = validate_jwt(&token).unwrap();
        assert_eq!(claims.sub, "user-123");
        assert_eq!(claims.username, "test_user");
        assert_eq!(claims.email, "test@universidad.edu");
        assert_eq!(claims.role_id, 1);
        assert!(!is_token_expired(&claims));
    }

    #[test]
    fn test_invalid_token() {
        std::env::set_var("JWT_SECRET", "test_secret_key");
        
        let result = validate_jwt("invalid.token.here");
        assert!(result.is_err());
    }

    #[test]
    fn test_extract_user_id_unsafe() {
        std::env::set_var("JWT_SECRET", "test_secret_key");
        
        let token = generate_jwt(
            "user-456",
            "test_user",
            "test@universidad.edu",
            2,
        )
        .unwrap();

        let user_id = extract_user_id_unsafe(&token);
        assert_eq!(user_id, Some("user-456".to_string()));
    }
}
