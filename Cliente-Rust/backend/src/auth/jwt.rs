//! # `auth::jwt` — Validación RS256 con JWKS y Decodificación de Claims
//!
//! ## Dos modos de decodificación
//!
//! | Función                  | Validación firma | Usa red | Uso principal          |
//! |--------------------------|-----------------|---------|------------------------|
//! | `decode_claims_unverified` | ❌ No          | ❌ No   | Tests, fallback debug  |
//! | `verify_and_decode`        | ✅ RS256        | ✅ Sí   | **Producción** (Fase 3)|
//!
//! ## Caché JWKS
//! Las llaves públicas de Keycloak se cachean en memoria por **1 hora**.
//! Se usan `once_cell::sync::Lazy` + `parking_lot::RwLock` para concurrencia
//! segura sin overhead (ambas crates ya estaban en `Cargo.toml`).
//!
//! El flujo de caché es:
//! 1. Leer con `read()` lock (concurrente, sin bloqueo)
//! 2. Si hay cache válida y la llave `kid` está en ella → usar directamente
//! 3. Si no (miss o TTL expirado) → `fetch_jwks()` + actualizar con `write()` lock
//!
//! ## Claims institucionales validados (AUTH_SPEC §2)
//! - `iss` = `http://52.14.162.232/auth/realms/laboratorio-semillero`
//! - `aud` = `"account"`
//! - `exp` > now (validado automáticamente por `jsonwebtoken`)
//! - `alg` = `RS256` (único algoritmo aceptado)

use std::time::{Duration, Instant};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use once_cell::sync::Lazy;
use parking_lot::RwLock;
use serde::Deserialize;

use crate::error::AppError;
use crate::state_core::{StoredClaims, UserType};
use super::config::KeycloakConfig;

// ─────────────────────────────────────────────────────────────────────────────
// Caché de llaves JWKS (singleton de proceso)
// ─────────────────────────────────────────────────────────────────────────────

/// Tiempo de vida del caché de llaves JWKS: 1 hora.
/// Las llaves de Keycloak rotan raramente; refrescar cada hora es más que suficiente.
const JWKS_CACHE_TTL: Duration = Duration::from_secs(3_600);

/// Caché global de llaves JWKS. Se inicializa vacío en el primer acceso.
static JWKS_CACHE: Lazy<RwLock<Option<CachedJwks>>> =
    Lazy::new(|| RwLock::new(None));

/// Snapshot cacheado de las llaves JWKS.
struct CachedJwks {
    entries:    Vec<JwkEntry>,
    fetched_at: Instant,
}

impl CachedJwks {
    fn is_fresh(&self) -> bool {
        self.fetched_at.elapsed() < JWKS_CACHE_TTL
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de deserialización del JWKS endpoint
// ─────────────────────────────────────────────────────────────────────────────

/// Respuesta raíz del JWKS endpoint de Keycloak.
#[derive(Deserialize)]
struct JwksResponse {
    keys: Vec<JwkEntry>,
}

/// Entrada individual de una llave pública RSA en el JWKS.
#[derive(Deserialize, Clone, Debug)]
struct JwkEntry {
    kid: String,
    /// Solo procesamos `kty = "RSA"`.
    kty: String,
    /// Modulus RSA en Base64url (sin padding).
    n: Option<String>,
    /// Exponente RSA en Base64url (típicamente `AQAB` = 65537).
    e: Option<String>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Claims para decodificación verificada (jsonwebtoken valida firma + exp + iss + aud)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Deserialize, Debug, Clone)]
struct RealmAccess {
    roles: Vec<String>,
}

/// Subset del payload JWT que necesita validación completa.
/// `jsonwebtoken::decode` valida automáticamente `exp`, `nbf`, `iss` y `aud`.
#[derive(Deserialize, Debug)]
struct VerifiedClaims {
    sub:                String,
    exp:                i64,
    preferred_username: String,
    name:               Option<String>,
    email:              Option<String>,
    /// Claim personalizado del realm (mapeado desde `postalCode` LDAP).
    user_type:          Option<String>,
    /// ID de sesión Keycloak (útil para logout federado).
    sid:                Option<String>,
    /// Roles del realm.
    realm_access:       Option<RealmAccess>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Claims para decodificación sin verificar (mantener para fallback/tests)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Deserialize, Debug)]
struct RawClaims {
    sub:                String,
    exp:                i64,
    preferred_username: String,
    name:               Option<String>,
    email:              Option<String>,
    user_type:          Option<String>,
    sid:                Option<String>,
    realm_access:       Option<RealmAccess>,
}

// ─────────────────────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────────────────────

/// Valida la firma RS256 del access_token usando las llaves públicas del JWKS
/// y extrae los claims institucionales.
///
/// ## Proceso
/// 1. Extrae el `kid` del header JWT
/// 2. Busca la llave en el caché (TTL 1 hora)  
/// 3. Si no está en caché → `GET {jwks_endpoint}` y actualiza caché
/// 4. Valida: firma RS256, `exp`, `iss`, `aud = "account"`
/// 5. Retorna `StoredClaims` si todo es correcto
///
/// ## Errores
/// - `AppError::Unauthorized` — firma inválida, token expirado, issuer/audience incorrectos
/// - `AppError::Api` — `kid` no encontrado en JWKS, formato JWK inválido
/// - `AppError::Network` — no se pudo contactar el JWKS endpoint
pub async fn verify_and_decode(
    token:  &str,
    config: &KeycloakConfig,
    http:   &reqwest::Client,
) -> Result<StoredClaims, AppError> {
    // 1. Extraer kid del header
    let kid = extract_kid(token).ok_or_else(|| {
        AppError::Api("JWT header no contiene el campo 'kid' requerido".to_string())
    })?;

    // 2. Buscar llave en caché (solo read lock, sin bloqueo para lectores concurrentes)
    let cached_entry = {
        let cache = JWKS_CACHE.read();
        cache.as_ref()
            .filter(|c| c.is_fresh())
            .and_then(|c| c.entries.iter().find(|k| k.kid == kid).cloned())
    };

    // 3. Si no está en caché, fetchear JWKS y actualizar
    let key_entry = match cached_entry {
        Some(entry) => {
            entry
        }
        None => {
            let fresh_entries = fetch_jwks(http, &config.jwks_endpoint()).await?;

            // Buscar la llave antes de actualizar el caché
            let entry = fresh_entries
                .iter()
                .find(|k| k.kid == kid)
                .cloned()
                .ok_or_else(|| AppError::Api(format!(
                    "Llave JWKS con kid='{}' no encontrada. \
                     ¿El Keycloak rotó sus llaves? Intenta de nuevo.", kid
                )))?;

            // Actualizar caché con write lock
            {
                let mut cache = JWKS_CACHE.write();
                *cache = Some(CachedJwks {
                    entries:    fresh_entries,
                    fetched_at: Instant::now(),
                });
            }

            entry
        }
    };

    // 4. Extraer componentes RSA y construir DecodingKey
    if key_entry.kty != "RSA" {
        return Err(AppError::Api(format!(
            "Tipo de llave no soportado: '{}'. Se esperaba 'RSA'.", key_entry.kty
        )));
    }

    let n = key_entry.n.as_deref().ok_or_else(|| {
        AppError::Api("JWK no contiene campo 'n' (modulus RSA)".to_string())
    })?;
    let e = key_entry.e.as_deref().ok_or_else(|| {
        AppError::Api("JWK no contiene campo 'e' (exponent RSA)".to_string())
    })?;

    let decoding_key = DecodingKey::from_rsa_components(n, e)
        .map_err(|err| AppError::Unauthorized(format!(
            "Error construyendo llave RSA pública desde JWKS: {}", err
        )))?;

    // 5. Configurar validación estricta
    let issuer = format!("{}/realms/{}", config.base_url, config.realm);
    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_issuer(&[issuer]);
    // AUTH_SPEC §2: `"aud": "account"` en el access_token del realm
    validation.set_audience(&["account"]);
    // leeway de 30 s para compensar diferencias de reloj entre cliente y servidor
    validation.leeway = 30;

    // 6. Decodificar y verificar (jsonwebtoken valida firma + exp + iss + aud)
    let token_data = decode::<VerifiedClaims>(token, &decoding_key, &validation)
        .map_err(|err| AppError::Unauthorized(format!(
            "Validación JWT fallida: {}", err
        )))?;

    let c = token_data.claims;

    let user_type_str = c.user_type.unwrap_or_default();
    let u_type = UserType::from_claim(&user_type_str);

    let mut roles = Vec::new();
    if let Some(ra) = c.realm_access {
        for role in ra.roles {
            if !role.starts_with("default-roles") && role != "offline_access" && role != "uma_authorization" {
                roles.push(role);
            }
        }
    }

    let u_type_lower = u_type.to_string().to_lowercase();
    if !roles.contains(&u_type_lower) && u_type != UserType::Unknown {
        roles.push(u_type_lower);
    }

    Ok(StoredClaims {
        sub:                c.sub,
        preferred_username: c.preferred_username,
        name:               c.name.unwrap_or_else(|| "Usuario".to_string()),
        email:              c.email.unwrap_or_default(),
        user_type:          u_type,
        roles,
        exp:                c.exp,
        sid:                c.sid.unwrap_or_default(),
    })
}

/// Decodifica el payload del JWT **sin verificar la firma RS256**.
///
/// Se mantiene para:
/// - Tests unitarios que necesitan decodificar tokens de muestra
/// - Debugging de claims sin conexión a Keycloak
///
/// ⚠️ **No usar en producción.** En producción, usar siempre `verify_and_decode`.
pub fn decode_claims_unverified(token: &str) -> Result<StoredClaims, AppError> {
    let parts: Vec<&str> = token.splitn(3, '.').collect();
    if parts.len() != 3 {
        return Err(AppError::Api(
            "JWT inválido: se esperaban 3 segmentos (header.payload.signature)".to_string(),
        ));
    }

    let payload_bytes = URL_SAFE_NO_PAD
        .decode(parts[1])
        .map_err(|e| AppError::Serialization(format!("Error decodificando payload JWT: {}", e)))?;

    let raw: RawClaims = serde_json::from_slice(&payload_bytes)
        .map_err(|e| AppError::Serialization(format!("Error parseando claims JWT: {}", e)))?;

    let user_type_str = raw.user_type.unwrap_or_default();
    let u_type = UserType::from_claim(&user_type_str);

    let mut roles = Vec::new();
    if let Some(ra) = raw.realm_access {
        for role in ra.roles {
            if !role.starts_with("default-roles") && role != "offline_access" && role != "uma_authorization" {
                roles.push(role);
            }
        }
    }

    let u_type_lower = u_type.to_string().to_lowercase();
    if !roles.contains(&u_type_lower) && u_type != UserType::Unknown {
        roles.push(u_type_lower);
    }

    Ok(StoredClaims {
        sub:                raw.sub,
        preferred_username: raw.preferred_username,
        name:               raw.name.unwrap_or_else(|| "Usuario".to_string()),
        email:              raw.email.unwrap_or_default(),
        user_type:          u_type,
        roles,
        exp:                raw.exp,
        sid:                raw.sid.unwrap_or_default(),
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers privados
// ─────────────────────────────────────────────────────────────────────────────

/// Extrae el campo `kid` del header JWT sin verificar la firma.
fn extract_kid(token: &str) -> Option<String> {
    let header_b64 = token.splitn(2, '.').next()?;

    let header_bytes = URL_SAFE_NO_PAD.decode(header_b64).ok()?;

    // Keycloak usa espacios extra alrededor de ':' en el header; serde_json los tolera.
    let header: serde_json::Value = serde_json::from_slice(&header_bytes).ok()?;

    header.get("kid")?.as_str().map(|s| s.to_string())
}

/// Descarga las llaves JWKS del endpoint de Keycloak.
async fn fetch_jwks(http: &reqwest::Client, url: &str) -> Result<Vec<JwkEntry>, AppError> {
    let response = http
        .get(url)
        .send()
        .await
        .map_err(|e| AppError::Network(format!(
            "No se pudo contactar el JWKS endpoint '{}': {}", url, e
        )))?;

    let status = response.status();
    if !status.is_success() {
        return Err(AppError::Api(format!(
            "JWKS endpoint respondió con error {}", status
        )));
    }

    let jwks: JwksResponse = response
        .json()
        .await
        .map_err(|e| AppError::Serialization(format!(
            "Error parseando respuesta JWKS: {}", e
        )))?;

    if jwks.keys.is_empty() {
        return Err(AppError::Api(
            "El JWKS endpoint retornó un conjunto de llaves vacío".to_string()
        ));
    }

    Ok(jwks.keys)
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Access token real incluido en AUTH_SPEC §2.
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

    // ── Tests de decode_claims_unverified (sin red, sin firma) ────────────────

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
        assert!(claims.roles.contains(&"estudiante".to_string()));
        assert!(!claims.roles.contains(&"uma_authorization".to_string()));
        assert_eq!(claims.roles.len(), 1);
    }

    #[test]
    fn jwt_sin_separadores_retorna_error() {
        assert!(decode_claims_unverified("sinpuntos").is_err());
    }

    #[test]
    fn jwt_payload_no_json_retorna_error() {
        // header=aGVhZGVy | payload=bm9fanNvbg (= "no_json") | firma=c2ln
        assert!(decode_claims_unverified("aGVhZGVy.bm9fanNvbg.c2ln").is_err());
    }

    // ── Tests de extract_kid ──────────────────────────────────────────────────

    #[test]
    fn extrae_kid_del_token_real() {
        let kid = extract_kid(TOKEN_REAL).expect("Debe encontrar kid en el token real");
        // kid del header del AUTH_SPEC §2
        assert_eq!(kid, "y9_AMKQNzq6rLbtKxwvFSD5LfohFfiewaufcOGAr-U0");
    }

    #[test]
    fn extrae_kid_retorna_none_si_token_invalido() {
        assert!(extract_kid("notavalidjwt").is_none());
    }

    // ── Test de integración real (requiere Keycloak activo) ───────────────────

    /// Valida el token institucional completo contra el JWKS del Keycloak real.
    /// Marcado con #[ignore] para no ejecutarse en CI sin conexión.
    ///
    /// Ejecutar manualmente con:
    /// `cargo test -p app verify_token_real -- --ignored --nocapture`
    #[tokio::test]
    #[ignore = "Requiere conexión al Keycloak institucional (52.14.162.232)"]
    async fn verify_token_real_contra_keycloak() {
        let config = KeycloakConfig {
            base_url:  "http://52.14.162.232/auth".to_string(),
            realm:     "laboratorio-semillero".to_string(),
            client_id: "semillero-app".to_string(),
        };
        let http = reqwest::Client::new();
        // El resultado puede ser Err si el token expiró, pero no debe paniquear
        let result = verify_and_decode(TOKEN_REAL, &config, &http).await;
        println!("[test] Resultado de verify_and_decode: {:?}", result);
    }
}
