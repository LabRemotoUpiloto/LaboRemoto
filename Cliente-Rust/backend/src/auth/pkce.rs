//! # `auth::pkce` — Generación PKCE (RFC 7636)
//!
//! Genera el par `code_verifier` / `code_challenge` para el flujo
//! Authorization Code + PKCE de OAuth 2.1 (RFC 8252).
//!
//! ## Algoritmo
//! 1. Generar 64 bytes aleatorios con `OsRng` (fuente de entropía del SO)
//! 2. Codificar en Base64url sin padding → `code_verifier` (86 chars; rango válido 43–128)
//! 3. `code_challenge` = Base64url(SHA-256(`code_verifier`)) sin padding
//!
//! ## Dependencias usadas (ya en Cargo.toml)
//! - `rand = "0.8"` — generación de bytes aleatorios
//! - `sha2 = "0.10"` — digest SHA-256
//! - `base64 = "0.21"` — codificación Base64url sin padding

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::RngCore;
use sha2::{Digest, Sha256};

/// Número de bytes aleatorios para el verifier.
/// 64 bytes → 86 caracteres Base64url (dentro del rango 43–128 del RFC 7636).
const VERIFIER_BYTES: usize = 64;

/// Par criptográfico PKCE de un solo uso.
///
/// El `verifier` se almacena en `AuthState::pending_pkce_verifier` y
/// se consume exactamente una vez durante el intercambio de código.
/// El `challenge` se envía a Keycloak como parámetro `code_challenge`.
pub struct PkceVerifier {
    verifier: String,
}

impl PkceVerifier {
    /// Genera un nuevo par PKCE con entropía del sistema operativo.
    pub fn new() -> Self {
        let mut bytes = [0u8; VERIFIER_BYTES];
        rand::thread_rng().fill_bytes(&mut bytes);
        let verifier = URL_SAFE_NO_PAD.encode(bytes);
        Self { verifier }
    }

    /// Calcula el `code_challenge` = Base64url(SHA-256(verifier)).
    ///
    /// Este valor se envía a Keycloak en el parámetro `code_challenge`
    /// con `code_challenge_method=S256`.
    pub fn challenge(&self) -> String {
        let hash = Sha256::digest(self.verifier.as_bytes());
        URL_SAFE_NO_PAD.encode(hash)
    }

    /// Referencia al `code_verifier` en formato string.
    pub fn as_str(&self) -> &str {
        &self.verifier
    }

    /// Consume el struct y retorna el `code_verifier` como `String`.
    ///
    /// Usado para almacenar el verifier en `AuthState::set_pending_verifier()`.
    pub fn into_string(self) -> String {
        self.verifier
    }
}

impl Default for PkceVerifier {
    fn default() -> Self {
        Self::new()
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifier_longitud_dentro_del_rango_rfc7636() {
        let v = PkceVerifier::new();
        let len = v.as_str().len();
        assert!(len >= 43, "Verifier demasiado corto: {} chars", len);
        assert!(len <= 128, "Verifier demasiado largo: {} chars", len);
    }

    #[test]
    fn challenge_es_diferente_al_verifier() {
        let v = PkceVerifier::new();
        assert_ne!(v.as_str(), v.challenge().as_str(),
            "El challenge no puede ser igual al verifier");
    }

    #[test]
    fn dos_verifiers_distintos_en_cada_llamada() {
        let v1 = PkceVerifier::new();
        let v2 = PkceVerifier::new();
        assert_ne!(v1.as_str(), v2.as_str(),
            "Cada verifier debe ser único (aleatorio)");
    }

    #[test]
    fn challenge_es_base64url_sin_padding() {
        let v = PkceVerifier::new();
        let ch = v.challenge();
        assert!(!ch.contains('='), "No debe tener padding '='");
        assert!(!ch.contains('+'), "No debe usar '+' (es Base64 estándar, no url)");
        assert!(!ch.contains('/'), "No debe usar '/' (es Base64 estándar, no url)");
    }

    #[test]
    fn challenge_longitud_correcta_para_sha256() {
        // SHA-256 = 32 bytes → Base64url sin padding = ceil(32 * 4/3) = 43 chars
        let v = PkceVerifier::new();
        assert_eq!(v.challenge().len(), 43,
            "SHA-256 en base64url sin padding debe tener 43 caracteres");
    }

    #[test]
    fn into_string_consume_y_devuelve_verifier() {
        let raw = PkceVerifier::new();
        let s = raw.as_str().to_string();
        let owned = raw.into_string();
        assert_eq!(s, owned);
    }
}
