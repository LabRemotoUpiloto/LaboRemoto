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
use once_cell::sync::Lazy;
use serde::Deserialize;

use crate::error::AppError;
use crate::state_core::TokenBundle;
use super::{config::KeycloakConfig, jwt};

// Perf: `reqwest::Client` es barato de clonar (Arc interno) pero costoso de
// construir (pool TCP/TLS nuevo). `KeycloakClient::new` se llama por cada
// comando admin_* (búsqueda de usuarios, roles, etc.), así que se comparte
// una sola instancia subyacente en vez de reconstruirla cada vez.
static SHARED_HTTP: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .expect("[auth::client] reqwest::Client siempre se puede construir")
});

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
    /// Construye el cliente reutilizando el `reqwest::Client` compartido
    /// (timeout de 15 segundos por petición).
    pub fn new(config: KeycloakConfig) -> Self {
        Self { config, http: SHARED_HTTP.clone() }
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
        // Unix timestamp (no `Instant`, que es relativo al proceso) para poder
        // persistir la expiración del refresh_token entre reinicios (`token_store`).
        let refresh_expires_at_unix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0)
            + token_resp.refresh_expires_in as i64;
        Ok(TokenBundle {
            access_token:       token_resp.access_token,
            refresh_token:      token_resp.refresh_token,
            access_expires_at:  now + Duration::from_secs(token_resp.expires_in),
            refresh_expires_at: now + Duration::from_secs(token_resp.refresh_expires_in),
            refresh_expires_at_unix,
            claims,
        })
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Keycloak Admin REST API (Delegación de Token)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(serde::Deserialize, serde::Serialize, Debug, Clone)]
pub struct KeycloakUser {
    pub id: String,
    pub username: String,
    pub email: Option<String>,
    #[serde(rename = "firstName")]
    pub first_name: Option<String>,
    #[serde(rename = "lastName")]
    pub last_name: Option<String>,
    /// Cuenta habilitada en Keycloak — mostrado como "Estado" en la UI.
    pub enabled: Option<bool>,
    /// Fecha de creación en Keycloak (epoch millis) — "Fecha Registro" en la UI.
    #[serde(rename = "createdTimestamp")]
    pub created_timestamp: Option<i64>,
    /// Atributos custom del usuario (incluye `avatar`, ver `commands::account_set_avatar`).
    /// Keycloak siempre representa cada atributo como array de strings.
    #[serde(default)]
    pub attributes: Option<std::collections::HashMap<String, Vec<String>>>,
}

#[derive(serde::Deserialize, serde::Serialize, Debug, Clone)]
pub struct KeycloakRole {
    pub id: String,
    pub name: String,
}

impl KeycloakClient {
    fn keycloak_admin_error(operation: &str, status: reqwest::StatusCode, body: String) -> AppError {
        if status.as_u16() == 403 {
            return AppError::Api(format!(
                "Keycloak Admin API rechazó {} (403). El token requiere permisos del cliente realm-management, por ejemplo view-users/manage-users/view-realm. {}",
                operation, body
            ));
        }

        AppError::Api(format!("Keycloak Admin API error en {} ({}): {}", operation, status, body))
    }

    /// GET /admin/realms/{realm}/users?search={query}
    /// `briefRepresentation=false` es necesario para que Keycloak incluya
    /// `attributes` (avatar, etc.) en la respuesta -- por defecto los
    /// endpoints de LISTA (a diferencia de GET de un solo usuario) vienen en
    /// modo "brief" y omiten ese campo.
    pub async fn admin_search_users(&self, token: &str, query: &str) -> Result<Vec<KeycloakUser>, AppError> {
        let url = format!("{}/admin/realms/{}/users", self.config.base_url, self.config.realm);
        let response = self.http
            .get(&url)
            .bearer_auth(token)
            .query(&[("search", query), ("briefRepresentation", "false")])
            .send()
            .await
            .map_err(|e| AppError::Network(format!("[admin_search_users] GET falló: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Self::keycloak_admin_error("buscar usuarios", status, body));
        }

        let users = response.json().await.map_err(|e| AppError::Serialization(e.to_string()))?;
        Ok(users)
    }

    /// GET /admin/realms/{realm}/users?max=1000
    /// Lista TODOS los usuarios del realm (sin filtro) — usado para derivar
    /// el grupo "Estudiante": cualquiera que no esté en ninguno de los roles
    /// especiales. `max=1000` es un límite razonable para no traer un realm
    /// completo entero; si el realm crece más allá de eso, esta vista deja
    /// de ser exhaustiva (limitación conocida, no paginada por ahora).
    pub async fn admin_list_all_users(&self, token: &str) -> Result<Vec<KeycloakUser>, AppError> {
        let url = format!("{}/admin/realms/{}/users", self.config.base_url, self.config.realm);
        let response = self.http
            .get(&url)
            .bearer_auth(token)
            .query(&[("max", "1000"), ("briefRepresentation", "false")])
            .send()
            .await
            .map_err(|e| AppError::Network(format!("[admin_list_all_users] GET falló: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Self::keycloak_admin_error("listar todos los usuarios", status, body));
        }

        let users = response.json().await.map_err(|e| AppError::Serialization(e.to_string()))?;
        Ok(users)
    }

    /// GET /admin/realms/{realm}/roles/{role_name}/users
    /// Lista los usuarios que ya tienen asignado un rol dado — usado por la
    /// vista por defecto de gestión de roles (lista, no búsqueda).
    pub async fn admin_list_role_users(&self, token: &str, role_name: &str) -> Result<Vec<KeycloakUser>, AppError> {
        let url = format!("{}/admin/realms/{}/roles/{}/users", self.config.base_url, self.config.realm, role_name);
        let response = self.http
            .get(&url)
            .bearer_auth(token)
            .query(&[("briefRepresentation", "false")])
            .send()
            .await
            .map_err(|e| AppError::Network(format!("[admin_list_role_users] GET falló: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Self::keycloak_admin_error("listar usuarios por rol", status, body));
        }

        let users = response.json().await.map_err(|e| AppError::Serialization(e.to_string()))?;
        Ok(users)
    }

    /// GET /admin/realms/{realm}/users/{id}/role-mappings/realm
    pub async fn admin_get_user_roles(&self, token: &str, user_id: &str) -> Result<Vec<KeycloakRole>, AppError> {
        let url = format!("{}/admin/realms/{}/users/{}/role-mappings/realm", self.config.base_url, self.config.realm, user_id);
        let response = self.http
            .get(&url)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| AppError::Network(format!("[admin_get_user_roles] GET falló: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Self::keycloak_admin_error("consultar roles de usuario", status, body));
        }

        let roles = response.json().await.map_err(|e| AppError::Serialization(e.to_string()))?;
        Ok(roles)
    }

    /// GET /admin/realms/{realm}/roles/{role_name}
    pub async fn admin_get_role_by_name(&self, token: &str, role_name: &str) -> Result<KeycloakRole, AppError> {
        let url = format!("{}/admin/realms/{}/roles/{}", self.config.base_url, self.config.realm, role_name);
        let response = self.http
            .get(&url)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| AppError::Network(format!("[admin_get_role_by_name] GET falló: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Self::keycloak_admin_error("consultar rol", status, body));
        }

        let role = response.json().await.map_err(|e| AppError::Serialization(e.to_string()))?;
        Ok(role)
    }

    /// POST /admin/realms/{realm}/users/{id}/role-mappings/realm
    pub async fn admin_assign_role(&self, token: &str, user_id: &str, role: &KeycloakRole) -> Result<(), AppError> {
        let url = format!("{}/admin/realms/{}/users/{}/role-mappings/realm", self.config.base_url, self.config.realm, user_id);
        let response = self.http
            .post(&url)
            .bearer_auth(token)
            .json(&vec![role])
            .send()
            .await
            .map_err(|e| AppError::Network(format!("[admin_assign_role] POST falló: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Self::keycloak_admin_error("asignar rol", status, body));
        }
        Ok(())
    }

    /// DELETE /admin/realms/{realm}/users/{id}/role-mappings/realm
    pub async fn admin_remove_role(&self, token: &str, user_id: &str, role: &KeycloakRole) -> Result<(), AppError> {
        let url = format!("{}/admin/realms/{}/users/{}/role-mappings/realm", self.config.base_url, self.config.realm, user_id);
        let response = self.http
            .delete(&url)
            .bearer_auth(token)
            .json(&vec![role])
            .send()
            .await
            .map_err(|e| AppError::Network(format!("[admin_remove_role] DELETE falló: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Self::keycloak_admin_error("remover rol", status, body));
        }
        Ok(())
    }

    // ─────────────────────────────────────────────────────────────────────
    // Keycloak Account REST API (self-service)
    // ─────────────────────────────────────────────────────────────────────
    // A diferencia del Admin REST API de arriba (requiere rol admin_lab +
    // permisos realm-management), esto es la API de "mi propia cuenta" —
    // cualquier usuario autenticado puede leer/editar SU PROPIO registro con
    // su propio access_token, sin necesitar privilegios especiales. Es lo
    // que usa la consola de cuenta de Keycloak (`/realms/{realm}/account`).

    /// GET /realms/{realm}/account
    /// `Accept: application/json` explícito -- sin esto, algunos despliegues
    /// de Keycloak intentan negociar la consola de cuenta (SPA en HTML) en
    /// vez de la API REST. Reintenta una vez ante un error de red: se vio
    /// `connection closed before message completed` en pruebas reales, un
    /// síntoma típico de reusar una conexión keep-alive que el proxy (nginx)
    /// ya había cerrado del otro lado -- una conexión nueva del pool resuelve
    /// esto casi siempre.
    pub async fn account_get(&self, token: &str) -> Result<serde_json::Value, AppError> {
        let url = format!("{}/realms/{}/account", self.config.base_url, self.config.realm);

        let mut last_err = None;
        for attempt in 0..2 {
            let result = self.http
                .get(&url)
                .bearer_auth(token)
                .header("Accept", "application/json")
                .send()
                .await;

            match result {
                Ok(response) => {
                    if !response.status().is_success() {
                        let status = response.status();
                        let body = response.text().await.unwrap_or_default();
                        return Err(AppError::Api(format!("Keycloak Account API error consultando cuenta ({}): {}", status, body)));
                    }
                    return response.json().await.map_err(|e| AppError::Serialization(e.to_string()));
                }
                Err(e) => {
                    last_err = Some(e);
                    if attempt == 0 { continue; }
                }
            }
        }
        Err(AppError::Network(format!("[account_get] GET falló tras reintentar: {}", last_err.unwrap())))
    }

    /// POST /realms/{realm}/account
    /// Keycloak espera el objeto de cuenta completo (no soporta PATCH parcial)
    /// — el caller debe partir de un `account_get` previo y solo pisar el
    /// campo que quiere cambiar antes de reenviar, para no perder el resto.
    pub async fn account_update(&self, token: &str, account: &serde_json::Value) -> Result<(), AppError> {
        let url = format!("{}/realms/{}/account", self.config.base_url, self.config.realm);
        let response = self.http
            .post(&url)
            .bearer_auth(token)
            .header("Accept", "application/json")
            .json(account)
            .send()
            .await
            .map_err(|e| AppError::Network(format!("[account_update] POST falló: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::Api(format!("Keycloak Account API error actualizando cuenta ({}): {}", status, body)));
        }
        Ok(())
    }

    /// GET /admin/realms/{realm}/users/{id}
    /// Usado antes de `admin_update_user` para partir de un objeto ya en el
    /// formato exacto que espera el PUT del Admin API -- el objeto que
    /// devuelve `account_get` (self-service) no sirve como base para el PUT:
    /// trae campos como `userProfileMetadata` que `UserRepresentation` (el
    /// deserializador estricto del lado de Keycloak para el Admin API) no
    /// reconoce y rechaza con 400.
    pub async fn admin_get_user(&self, token: &str, user_id: &str) -> Result<serde_json::Value, AppError> {
        let url = format!("{}/admin/realms/{}/users/{}", self.config.base_url, self.config.realm, user_id);
        let response = self.http
            .get(&url)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| AppError::Network(format!("[admin_get_user] GET falló: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Self::keycloak_admin_error("consultar usuario", status, body));
        }

        response.json().await.map_err(|e| AppError::Serialization(e.to_string()))
    }

    /// PUT /admin/realms/{realm}/users/{id}
    /// A diferencia de `account_update` (self-service), este SÍ puede escribir
    /// atributos custom aunque el usuario venga federado de LDAP en modo
    /// solo-lectura (`readOnlyUserMessage` que devuelve la Account API) — la
    /// restricción de solo-lectura de LDAP aplica a los campos mapeados
    /// (username/email/nombre), no a atributos propios de Keycloak como
    /// `avatar`. Requiere permisos de admin (`manage-users`), por eso solo
    /// admin_lab puede usarlo (ver `check_admin_lab` en commands.rs).
    pub async fn admin_update_user(&self, token: &str, user_id: &str, user: &serde_json::Value) -> Result<(), AppError> {
        let url = format!("{}/admin/realms/{}/users/{}", self.config.base_url, self.config.realm, user_id);
        let response = self.http
            .put(&url)
            .bearer_auth(token)
            .json(user)
            .send()
            .await
            .map_err(|e| AppError::Network(format!("[admin_update_user] PUT falló: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(Self::keycloak_admin_error("actualizar usuario", status, body));
        }
        Ok(())
    }
}
