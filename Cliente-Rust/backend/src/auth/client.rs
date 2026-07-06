//! # `auth::client` — Cliente HTTP para Keycloak
//!
//! Encapsula toda comunicación HTTP con el servidor Keycloak:
//! - Intercambio del código de autorización por tokens (`POST /token`)
//! - Renovación silenciosa del access_token vía refresh_token
//! - Revocación del token al hacer logout
//!
//! Utiliza `reqwest::Client` (ya declarado en `Cargo.toml` v0.11)
//! con `rustls-tls` para TLS y `json` para serialización automática.
//!
//! ## Dependencia interna
//! Recibe `KeycloakConfig` (Fase 2) y retorna `TokenBundle` (definido
//! en `state_core::auth_state`).
//!
//! Su implementación completa se realizará en la Fase 2.

// TODO (Fase 2): Implementar KeycloakClient con:
//   - exchange_code(code: &str, verifier: &PkceVerifier) -> AppResult<TokenBundle>
//   - refresh_token(refresh: &str) -> AppResult<TokenBundle>
//   - revoke(token: &str) -> AppResult<()>
