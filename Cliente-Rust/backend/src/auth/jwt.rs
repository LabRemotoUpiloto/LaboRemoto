//! # `auth::jwt` — Decodificación de Claims del JWT Institucional
//!
//! Extrae los claims del access_token de Keycloak **sin verificar la firma**.
//! La verificación RS256 completa con JWKS se implementa en la Fase 3.
//!
//! ## ¿Por qué decodificar sin verificar aquí?
//! Al recibir el token del Token Endpoint de Keycloak (POST directo server-to-server),
//! la autenticidad del canal ya está garantizada por HTTPS. La decodificación
//! sin verificar es segura en este contexto limitado: solo se usa para extraer
//! metadatos de sesión (username, user_type, exp) para la UI.
//!
//! ## Claims institucionales (AUTH_SPEC §2)
//! El JWT de Keycloak federado con Active Directory incluye:
//! - `user_type`: `"Estudiante"` | `"Docente"` (mapeado desde `postalCode` LDAP)
//! - `preferred_username`: login institucional (ej. `david-carreno1`)
//! - `email`: correo `@upc.edu.co`
//! - `sub`: UUID del usuario en Keycloak
//! - `exp`: Unix timestamp de expiración (300 s según AUTH_SPEC §2)
//! - `sid`: ID de sesión Keycloak (útil para logout federado en Fase 3)

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde::Deserialize;

use crate::error::AppError;
use crate::state_core::{StoredClaims, UserType};

/// Payload raw del JWT tal como viene de Keycloak.
/// Todos los campos custom son `Option` por tolerancia a versiones futuras.
#[derive(Deserialize, Debug)]
struct RawClaims {
    sub:                String,
    exp:                i64,
    preferred_username: String,
    name:               Option<String>,
    email:              Option<String>,
    /// Claim personalizado de Keycloak: mapeado desde `postalCode` del AD (AUTH_SPEC §2).
    user_type:          Option<String>,
    /// ID de sesión de Keycloak (presente en access_token y refresh_token).
    sid:                Option<String>,
}

/// Decodifica el payload del JWT **sin verificar la firma RS256**.
///
/// # Proceso
/// 1. Divide el JWT en sus 3 partes (`header.payload.signature`)
/// 2. Decodifica el payload en Base64url
/// 3. Deserializa el JSON y mapea los campos institucionales
///
/// # Errores
/// - `AppError::Api` si el formato del JWT no es válido (no tiene 3 partes)
/// - `AppError::Serialization` si el payload no es JSON válido
///
/// ⚠️ **No usar para decisiones de seguridad.** Solo para metadatos de UI.
pub fn decode_claims_unverified(token: &str) -> Result<StoredClaims, AppError> {
    // Un JWT válido siempre tiene exactamente 3 segmentos separados por '.'
    let parts: Vec<&str> = token.splitn(3, '.').collect();
    if parts.len() != 3 {
        return Err(AppError::Api(
            "JWT inválido: se esperaban 3 segmentos (header.payload.signature)".to_string(),
        ));
    }

    // El segmento [1] es el payload en Base64url sin padding
    let payload_bytes = URL_SAFE_NO_PAD
        .decode(parts[1])
        .map_err(|e| AppError::Serialization(format!("Error decodificando payload JWT: {}", e)))?;

    let raw: RawClaims = serde_json::from_slice(&payload_bytes)
        .map_err(|e| AppError::Serialization(format!("Error parseando claims JWT: {}", e)))?;

    Ok(StoredClaims {
        sub:                raw.sub,
        preferred_username: raw.preferred_username,
        name:               raw.name.unwrap_or_else(|| "Usuario".to_string()),
        email:              raw.email.unwrap_or_default(),
        user_type:          UserType::from_claim(&raw.user_type.unwrap_or_default()),
        exp:                raw.exp,
        sid:                raw.sid.unwrap_or_default(),
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests — usando el token real del AUTH_SPEC §2
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Token real de producción incluido en AUTH_SPEC §2.
    /// Permite verificar que los claims institucionales se extraen correctamente.
    const TOKEN_REAL: &str = concat!(
        "eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJ5OV9BTUtRTnpxNnJMYnRLeHd2",
        "RlNENUxmb2hGZmlld2F1ZmNPR0FyLVUwIn0",
        ".",
        "eyJleHAiOjE3ODMzNjExNzEsImlhdCI6MTc4MzM2MDg3MSwianRpIjoiYjY5YTRmMWEtNjlmYS00",
        "YTIzLWI4ZDgtY2I4NzE2Yjc1ZTU3IiwiaXNzIjoiaHR0cDovLzUyLjE0LjE2Mi4yMzIvYXV0aC9y",
        "ZWFsbXMvbGFib3JhdG9yaW8tc2VtaWxsZXJvIiwiYXVkIjoiYWNjb3VudCIsInN1YiI6ImQ2NjY4",
        "OGIxLWU4YjctNGM4OC05N2M4LTM0NThiZTI5MWQ4OSIsInR5cCI6IkJlYXJlciIsImF6cCI6InNl",
        "bWlsbGVyby1hcHAiLCJzZXNzaW9uX3N0YXRlIjoiZTljMTQ4NzctYTRmNC00ODE2LWI4YjQtNDVm",
        "OWFjMTc1NmM3IiwiYWNyIjoiMSIsImFsbG93ZWQtb3JpZ2lucyI6WyIqIl0sInJlYWxtX2FjY2Vz",
        "cyI6eyJyb2xlcyI6WyJkZWZhdWx0LXJvbGVzLWxhYm9yYXRvcmlvLXNlbWlsbGVybyIsIm9mZmxp",
        "bmVfYWNjZXNzIiwidW1hX2F1dGhvcml6YXRpb24iXX0sInJlc291cmNlX2FjY2VzcyI6eyJhY2Nv",
        "dW50Ijp7InJvbGVzIjpbIm1hbmFnZS1hY2NvdW50IiwibWFuYWdlLWFjY291bnQtbGlua3MiLCJ2",
        "aWV3LXByb2ZpbGUiXX19LCJzY29wZSI6InByb2ZpbGUgZW1haWwiLCJzaWQiOiJlOWMxNDg3Ny1h",
        "NGY0LTQ4MTYtYjhiNC00NWY5YWMxNzU2YzciLCJ1c2VyX3R5cGUiOiJFc3R1ZGlhbnRlIiwiZW1h",
        "aWxfdmVyaWZpZWQiOmZhbHNlLCJuYW1lIjoiREFWSUQgQUxFSkFORFJPIENBUlJFw4PCkU8gUEFS",
        "UkEiLCJwcmVmZXJyZWRfdXNlcm5hbWUiOiJkYXZpZC1jYXJyZW5vMSIsImdpdmVuX25hbWUiOiJE",
        "QVZJRCBBTEVKQU5EUk8iLCJmYW1pbHlfbmFtZSI6IkNBUlJFw4PCkU8gUEFSUkEiLCJlbWFpbCI6",
        "ImRhdmlkLWNhcnJlbm8xQHVwYy5lZHUuY28ifQ",
        ".",
        "jfvIFk-TRPY6kB3EQqwZqcFknXlZ75mzoxjErVuvaeokpt5J141yg6QiOEfZTeO5DWhqQZwxDpwjx",
        "zoNioobpHE1tgPN32stFvlR4Q5pCWsY-06R_pcPd5oc6XS0Lv1hJwgoDKbhn6tmIBBgcBFMABvXP",
        "LOR7uGGAgvDJiooS4DKxY5l-QznGzuWR1I6sF5Uwa2KhSs5ZskD99C9zpe90po28raf6CCHgQIhQ",
        "q_s6c2Oax8-aBFR3WfV48HivFkbvcrRf11-N3SpWwBsa92oyKD2GDgkt_zbYO7rgLkzTcZzO2092",
        "we7HSHt8ERu-rdT4XKkicgMZ-ffUYynQPqPBA"
    );

    #[test]
    fn decodifica_claims_del_token_institucional_real() {
        let claims = decode_claims_unverified(TOKEN_REAL)
            .expect("El token del AUTH_SPEC §2 debe decodificarse sin error");

        assert_eq!(claims.preferred_username, "david-carreno1");
        assert_eq!(claims.user_type,          UserType::Estudiante);
        assert_eq!(claims.email,              "david-carreno1@upc.edu.co");
        assert_eq!(claims.sub,                "d66688b1-e8b7-4c88-97c8-3458be291d89");
        assert_eq!(claims.sid,                "e9c14877-a4f4-4816-b8b4-45f9ac1756c7");
        assert_eq!(claims.exp,                1783361171);
    }

    #[test]
    fn jwt_sin_separadores_retorna_error() {
        let result = decode_claims_unverified("sinpuntos");
        assert!(result.is_err());
    }

    #[test]
    fn jwt_con_payload_no_json_retorna_error() {
        // header + payload no-json + firma (cualquier cosa)
        let result = decode_claims_unverified("aGVhZGVy.bm9fanNvbg.c2lnbmF0dXJl");
        assert!(result.is_err());
    }
}
