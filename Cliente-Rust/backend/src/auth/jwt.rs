//! # `auth::jwt` — Validación y Extracción de Claims JWT
//!
//! Valida la firma RS256 del access_token usando las llaves públicas
//! del JWKS endpoint de Keycloak y extrae los claims institucionales.
//!
//! ## JWT institucional (AUTH_SPEC §2)
//! El payload incluye claims estándar OIDC más el claim personalizado:
//! - `user_type`: `"Estudiante"` | `"Docente"` (mapeado desde LDAP `postalCode`)
//! - `preferred_username`: login institucional (ej. `david-carreno1`)
//! - `email`: correo institucional (`@upc.edu.co`)
//! - `exp` / `iat`: timestamps de expiración
//!
//! ## Dependencias
//! - `jsonwebtoken = "9"` (ya en Cargo.toml)
//! - JWKS: `http://52.14.162.232/auth/realms/laboratorio-semillero/protocol/openid-connect/certs`
//!
//! Su implementación completa se realizará en la Fase 3 (validación de firma).

// TODO (Fase 3): Implementar:
//   pub struct JwtClaims { exp, iat, sub, preferred_username, user_type, email, ... }
//   pub fn verify_and_decode(token: &str, jwks_uri: &str) -> AppResult<JwtClaims>
//   pub fn decode_unverified(token: &str) -> AppResult<JwtClaims>  // solo para leer exp/username sin validar firma
