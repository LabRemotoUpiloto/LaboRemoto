//! # `auth::config` — Configuración de Keycloak desde Variables de Entorno
//!
//! Lee los parámetros del servidor Keycloak institucional (AUTH_SPEC §1)
//! y deriva los endpoints estándar OIDC a partir de ellos.
//!
//! ## Variables de entorno
//! | Variable             | Default (AUTH_SPEC §1)                      |
//! |----------------------|---------------------------------------------|
//! | `KEYCLOAK_BASE_URL`  | `http://52.14.162.232/auth`                 |
//! | `KEYCLOAK_REALM`     | `laboratorio-semillero`                     |
//! | `KEYCLOAK_CLIENT_ID` | `semillero-app`                             |
//!
//! Los defaults hardcodeados permiten desarrollo local sin `.env`.
//! En producción, siempre definir las variables explícitamente.

use std::env;
use reqwest::Url;

/// Configuración inmutable de Keycloak.
/// Se clona libremente; no contiene secretos (el client es público/PKCE).
#[derive(Clone, Debug)]
pub struct KeycloakConfig {
    /// URL base del servidor Keycloak, sin trailing slash.
    /// Ej: `http://52.14.162.232/auth`
    pub base_url: String,
    /// Realm institucional. Ej: `laboratorio-semillero`
    pub realm: String,
    /// Client ID público de la aplicación. Ej: `semillero-app`
    pub client_id: String,
}

impl KeycloakConfig {
    /// Construye la configuración desde variables de entorno.
    /// Exige obligatoriamente que las variables estén definidas en el `.env`.
    pub fn from_env() -> Self {
        Self {
            base_url: env::var("KEYCLOAK_BASE_URL")
                .expect("Falta la variable de entorno KEYCLOAK_BASE_URL. Define esta variable en tu archivo .env global"),
            realm: env::var("KEYCLOAK_REALM")
                .expect("Falta la variable de entorno KEYCLOAK_REALM. Define esta variable en tu archivo .env global"),
            client_id: env::var("KEYCLOAK_CLIENT_ID")
                .expect("Falta la variable de entorno KEYCLOAK_CLIENT_ID. Define esta variable en tu archivo .env global"),
        }
    }

    // ── Endpoints derivados (AUTH_SPEC §1) ───────────────────────────────────

    /// `GET` — Inicia el flujo OAuth en el browser del usuario.
    /// AUTH_SPEC: `.../protocol/openid-connect/auth`
    pub fn auth_endpoint(&self) -> String {
        format!(
            "{}/realms/{}/protocol/openid-connect/auth",
            self.base_url, self.realm
        )
    }

    /// `POST` — Intercambio de código y renovación por refresh_token.
    /// AUTH_SPEC: `.../protocol/openid-connect/token`
    pub fn token_endpoint(&self) -> String {
        format!(
            "{}/realms/{}/protocol/openid-connect/token",
            self.base_url, self.realm
        )
    }

    /// `GET` — Llaves públicas RS256 para validación de firma (Fase 3).
    /// AUTH_SPEC: `.../protocol/openid-connect/certs`
    pub fn jwks_endpoint(&self) -> String {
        format!(
            "{}/realms/{}/protocol/openid-connect/certs",
            self.base_url, self.realm
        )
    }

    /// `POST` — Cierre de sesión OIDC (revocación en Keycloak).
    /// Body: `client_id=...&refresh_token=...`
    /// Keycloak 16.x responde 204 No Content en éxito.
    pub fn logout_endpoint(&self) -> String {
        format!(
            "{}/realms/{}/protocol/openid-connect/logout",
            self.base_url, self.realm
        )
    }

    /// Construye la URL de autorización completa con parámetros PKCE (S256).
    ///
    /// Usa `reqwest::Url` (re-export de `url::Url`) para encoding correcto
    /// de query params, especialmente del `redirect_uri` que contiene `://`.
    ///
    /// # Parámetros
    /// - `code_challenge`: resultado de `PkceVerifier::challenge()` (SHA-256 + base64url)
    /// - `redirect_uri`:   URL del servidor loopback (ej. `http://127.0.0.1:52341/callback`)
    /// - `state`:          valor anti-CSRF opaco
    pub fn build_auth_url(
        &self,
        code_challenge: &str,
        redirect_uri:   &str,
        state:          &str,
    ) -> String {
        let mut url = Url::parse(&self.auth_endpoint())
            .expect("[auth::config] auth_endpoint siempre genera una URL válida");

        url.query_pairs_mut()
            .append_pair("response_type",          "code")
            .append_pair("client_id",              &self.client_id)
            .append_pair("redirect_uri",           redirect_uri)
            .append_pair("scope",                  "openid profile email")
            .append_pair("code_challenge",         code_challenge)
            .append_pair("code_challenge_method",  "S256")
            .append_pair("state",                  state);

        url.to_string()
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg() -> KeycloakConfig {
        KeycloakConfig {
            base_url:  "http://52.14.162.232/auth".to_string(),
            realm:     "laboratorio-semillero".to_string(),
            client_id: "semillero-app".to_string(),
        }
    }

    #[test]
    fn endpoints_correctos() {
        let c = cfg();
        assert_eq!(
            c.auth_endpoint(),
            "http://52.14.162.232/auth/realms/laboratorio-semillero/protocol/openid-connect/auth"
        );
        assert_eq!(
            c.token_endpoint(),
            "http://52.14.162.232/auth/realms/laboratorio-semillero/protocol/openid-connect/token"
        );
        assert_eq!(
            c.jwks_endpoint(),
            "http://52.14.162.232/auth/realms/laboratorio-semillero/protocol/openid-connect/certs"
        );
    }

    #[test]
    fn build_auth_url_codifica_redirect_uri() {
        let c = cfg();
        let url = c.build_auth_url("mi_challenge", "http://127.0.0.1:52341/callback", "csrf_token");
        // El redirect_uri debe estar URL-encoded
        assert!(url.contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A52341%2Fcallback")
             || url.contains("redirect_uri=http://127.0.0.1:52341/callback"));
        assert!(url.contains("response_type=code"));
        assert!(url.contains("code_challenge=mi_challenge"));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains("client_id=semillero-app"));
    }
}
