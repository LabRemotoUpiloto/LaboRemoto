//! # `auth::config` — Configuración de Keycloak desde Variables de Entorno
//!
//! Lee los parámetros del servidor Keycloak institucional (AUTH_SPEC §1)
//! y deriva los endpoints estándar OIDC a partir de ellos.
//!
//! ## Variables de entorno
//! | Variable             | Default (AUTH_SPEC §1)                      |
//! |----------------------|---------------------------------------------|
//! | `KEYCLOAK_BASE_URL`  | `https://labo-keycloak.duckdns.org/auth`    |
//! | `KEYCLOAK_REALM`     | `laboratorio-semillero`                     |
//! | `KEYCLOAK_CLIENT_ID` | `semillero-app`                             |
//!
//! Los defaults hardcodeados permiten desarrollo local sin `.env`.
//! `KEYCLOAK_BASE_URL` además se puede embeber al compilar (secreto de GitHub del mismo nombre en
//! `release.yml`); el `.env` de la máquina, si existe, manda sobre lo embebido.

use std::env;
use reqwest::Url;

/// Configuración inmutable de Keycloak.
/// Se clona libremente; no contiene secretos (el client es público/PKCE).
#[derive(Clone, Debug)]
pub struct KeycloakConfig {
    /// URL base del servidor Keycloak, sin trailing slash.
    /// Ej: `https://labo-keycloak.duckdns.org/auth` (el dominio: su certificado es válido; por la IP no lo es y
    /// el emisor del token cambia según por dónde abra el navegador el inicio de sesión)
    pub base_url: String,
    /// Realm institucional. Ej: `laboratorio-semillero`
    pub realm: String,
    /// Client ID público de la aplicación. Ej: `semillero-app`
    pub client_id: String,
}

/// Dirección por defecto de Keycloak: el dominio, con certificado válido.
const BASE_URL_POR_DEFECTO: &str = "https://labo-keycloak.duckdns.org/auth";

/// Qué dirección usar: la variable de entorno (`.env` de la máquina o de desarrollo) si trae algo;
/// si no, la embebida al compilar (`build.rs`, desde un secreto de GitHub); si no, el dominio.
/// La embebida permite publicar una versión que entre por la dirección numérica en las redes cuyo
/// DNS no resuelve el dominio, sin poner ninguna IP en el código.
fn resolver_base_url(entorno: Option<String>, embebida: Option<&str>) -> String {
    entorno
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .or_else(|| embebida.map(str::trim).filter(|v| !v.is_empty()).map(String::from))
        .unwrap_or_else(|| BASE_URL_POR_DEFECTO.to_string())
        .trim_end_matches('/')
        .to_string()
}

impl KeycloakConfig {
    /// Construye la configuración desde variables de entorno, con fallback a
    /// los defaults de AUTH_SPEC §1 (no son secretos — cliente OAuth público
    /// PKCE, ver doc del struct).
    ///
    /// El fallback es necesario para el `.exe` empaquetado: `load_dotenv()`
    /// (`lib.rs`) busca un `.env` a partir de `env!("CARGO_MANIFEST_DIR")`,
    /// una ruta congelada en tiempo de compilación — en el binario instalado
    /// esa ruta es la del runner de CI que compiló el release, no existe en
    /// la máquina del usuario final, así que nunca hay `.env` que cargar ahí.
    /// Sin este fallback, `auth_login_url` entraba en pánico en cualquier
    /// build sin `.env` local (todo build de release).
    pub fn from_env() -> Self {
        Self {
            base_url: resolver_base_url(
                env::var("KEYCLOAK_BASE_URL").ok(),
                option_env!("COMPILED_KEYCLOAK_BASE_URL"),
            ),
            realm: env::var("KEYCLOAK_REALM")
                .unwrap_or_else(|_| "laboratorio-semillero".to_string()),
            client_id: env::var("KEYCLOAK_CLIENT_ID")
                .unwrap_or_else(|_| "semillero-app".to_string()),
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
    fn base_url_sin_nada_usa_el_dominio() {
        assert_eq!(resolver_base_url(None, None), BASE_URL_POR_DEFECTO);
        assert_eq!(resolver_base_url(Some("  ".into()), Some("")), BASE_URL_POR_DEFECTO);
    }

    #[test]
    fn base_url_embebida_reemplaza_al_dominio() {
        assert_eq!(
            resolver_base_url(None, Some(" http://kc.ejemplo.test/auth/ ")),
            "http://kc.ejemplo.test/auth"
        );
    }

    #[test]
    fn base_url_del_entorno_manda_sobre_la_embebida() {
        assert_eq!(
            resolver_base_url(Some("http://local.test/auth".into()), Some("http://kc.ejemplo.test/auth")),
            "http://local.test/auth"
        );
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
