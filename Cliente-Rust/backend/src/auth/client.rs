//! # `auth::client` — Cliente HTTP para el Token Endpoint de Keycloak
//!
//! Encapsula toda comunicación HTTP con Keycloak usando `reqwest::Client`
//! (ya declarado en `Cargo.toml` v0.11 con `json` + `rustls-tls`).
//!
//! ## Operaciones implementadas
//! - [`KeycloakClient::exchange_code`] — Intercambia el código OAuth por tokens
//! - [`KeycloakClient::refresh_token`] — Renueva el access_token (silencioso)
//!
//! ## Nota sobre el flujo
//! `exchange_code` llama internamente a `jwt::decode_claims_unverified` para
//! extraer los claims y construir el `TokenBundle`. La verificación de firma
//! RS256 con JWKS se añadirá en la Fase 3 sin modificar esta interfaz.

use std::time::{Duration, Instant};
use serde::Deserialize;

use crate::error::AppError;
use crate::state_core::TokenBundle;
use super::{config::KeycloakConfig, jwt};

// ─────────────────────────────────────────────────────────────────────────────
// Tipos internos
// ─────────────────────────────────────────────────────────────────────────────

/// Respuesta directa del Token Endpoint de Keycloak (AUTH_SPEC §2).
///
/// Solo se deserializan los campos necesarios para construir `TokenBundle`.
#[derive(Deserialize, Debug)]
struct TokenResponse {
    access_token:       String,
    /// Segundos hasta la expiración del access_token (AUTH_SPEC: 300 s).
    expires_in:         u64,
    refresh_token:      String,
    /// Segundos hasta la expiración del refresh_token (AUTH_SPEC: 1800 s).
    refresh_expires_in: u64,
}

/// Respuesta de error del Token Endpoint de Keycloak.
#[derive(Deserialize, Debug)]
struct ErrorResponse {
    error:             String,
    #[serde(default)]
    error_description: String,
}

// ─────────────────────────────────────────────────────────────────────────────
// KeycloakClient
// ─────────────────────────────────────────────────────────────────────────────

/// Cliente HTTP para el Token Endpoint de Keycloak.
///
/// Reutiliza una instancia de `reqwest::Client` para eficiencia
/// (connection pooling, reutilización de sesiones TLS).
///
/// Se construye con `KeycloakClient::new(config)` y se usa dentro
/// de los comandos Tauri de `auth::commands`.
#[derive(Clone)]
pub struct KeycloakClient {
    config: KeycloakConfig,
    http:   reqwest::Client,
}

impl KeycloakClient {
    /// Construye el cliente con un timeout de 15 segundos por petición.
    pub fn new(config: KeycloakConfig) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .expect("[auth::client] reqwest::Client siempre se puede construir");
        Self { config, http }
    }

    /// Intercambia el código de autorización por un par de tokens (AUTH_SPEC §3, paso 7).
    ///
    /// Se llama **una sola vez** después de capturar el `?code=` del redirect loopback.
    ///
    /// # Parámetros
    /// - `code`:          el código de autorización recibido de Keycloak
    /// - `code_verifier`: el `code_verifier` generado por `PkceVerifier::new()` al iniciar el flujo
    /// - `redirect_uri`:  exactamente la misma URI usada al construir la URL de autorización
    pub async fn exchange_code(
        &self,
        code:          &str,
        code_verifier: &str,
        redirect_uri:  &str,
    ) -> Result<TokenBundle, AppError> {
        let response = self.http
            .post(self.config.token_endpoint())
            .form(&[
                ("grant_type",    "authorization_code"),
                ("client_id",     self.config.client_id.as_str()),
                ("code",          code),
                ("redirect_uri",  redirect_uri),
                ("code_verifier", code_verifier),
            ])
            .send()
            .await
            .map_err(|e| AppError::Network(format!("[exchange_code] POST /token falló: {}", e)))?;

        self.parse_token_response(response).await
    }

    /// Renueva el access_token usando el refresh_token almacenado.
    ///
    /// Se llama cuando `AuthState::needs_refresh()` retorna `true`
    /// (access_token con menos de 60 s de vida pero refresh_token aún válido).
    pub async fn refresh_access_token(&self, refresh_token: &str) -> Result<TokenBundle, AppError> {
        let response = self.http
            .post(self.config.token_endpoint())
            .form(&[
                ("grant_type",    "refresh_token"),
                ("client_id",     self.config.client_id.as_str()),
                ("refresh_token", refresh_token),
            ])
            .send()
            .await
            .map_err(|e| AppError::Network(format!("[refresh_token] POST /token falló: {}", e)))?;

        self.parse_token_response(response).await
    }

    /// Revoca la sesión en el servidor Keycloak (logout remoto).
    ///
    /// Llama al OIDC End-Session Endpoint con el `refresh_token` activo.
    /// Keycloak 16.x invalida la sesión SSO completa, desconectando al usuario
    /// de todas las aplicaciones del realm (logout federado).
    ///
    /// Keycloak responde `204 No Content` en éxito. También se acepta `200`
    /// por compatibilidad con versiones antiguas.
    pub async fn revoke_session(&self, refresh_token: &str) -> Result<(), AppError> {
        let response = self.http
            .post(self.config.logout_endpoint())
            .form(&[
                ("client_id",     self.config.client_id.as_str()),
                ("refresh_token", refresh_token),
            ])
            .send()
            .await
            .map_err(|e| AppError::Network(format!(
                "[revoke_session] POST /logout falló: {}", e
            )))?;

        let status = response.status();
        // Keycloak 16.x: 204 No Content en éxito; algunas versiones retornan 200
        if status.is_success() || status.as_u16() == 204 {
            return Ok(());
        }

        let body = response.text().await.unwrap_or_default();
        Err(AppError::Api(format!(
            "Error al revocar sesión en Keycloak ({}) — {}",
            status, body
        )))
    }

    // ── Helpers privados ──────────────────────────────────────────────────────

    /// Parsea la respuesta del Token Endpoint y construye un `TokenBundle`.
    ///
    /// Gestiona tanto respuestas de éxito (2xx) como errores de Keycloak (4xx/5xx).
    async fn parse_token_response(
        &self,
        response: reqwest::Response,
    ) -> Result<TokenBundle, AppError> {
        let status = response.status();

        if !status.is_success() {
            // Intentar parsear el error estructurado de Keycloak
            let body = response.text().await.unwrap_or_default();
            let err_msg = serde_json::from_str::<ErrorResponse>(&body)
                .map(|e| format!("{}: {}", e.error, e.error_description))
                .unwrap_or(body);
            return Err(AppError::Api(format!(
                "Keycloak respondió {} — {}",
                status, err_msg
            )));
        }

        let token_resp: TokenResponse = response
            .json()
            .await
            .map_err(|e| AppError::Serialization(
                format!("Error parseando respuesta del Token Endpoint: {}", e)
            ))?;

        // Validar firma RS256 con JWKS antes de almacenar el token (Fase 3)
        let claims = jwt::verify_and_decode(
            &token_resp.access_token,
            &self.config,
            &self.http,
        ).await?;

        let now = Instant::now();
        Ok(TokenBundle {
            access_token:       token_resp.access_token,
            refresh_token:      token_resp.refresh_token,
            access_expires_at:  now + Duration::from_secs(token_resp.expires_in),
            refresh_expires_at: now + Duration::from_secs(token_resp.refresh_expires_in),
            claims,
        })
    }
}
