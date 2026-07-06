//! # `auth::pkce` — Generación PKCE (RFC 7636)
//!
//! Implementa la generación criptográficamente segura de:
//! - `code_verifier`: string aleatorio de 43–128 caracteres (Base64url, sin padding)
//! - `code_challenge`: SHA-256(`code_verifier`) codificado en Base64url
//!
//! El `code_verifier` se guarda temporalmente en `AuthState::pending_verifier`
//! (Fase 1) y se consume una sola vez durante el intercambio de código (Fase 2).
//!
//! ## Seguridad
//! La generación usa `rand::thread_rng()` con `OsRng` como fuente de entropía,
//! ya disponible en `Cargo.toml` (`rand = "0.8"`).
//!
//! Su implementación completa se realizará en la Fase 2.

// TODO (Fase 2): Implementar:
//   pub struct PkceVerifier { verifier: String }
//   impl PkceVerifier {
//       pub fn new() -> Self { ... }           // genera verifier aleatorio
//       pub fn challenge(&self) -> String { ... } // SHA256 + base64url
//       pub fn as_str(&self) -> &str { ... }
//   }
