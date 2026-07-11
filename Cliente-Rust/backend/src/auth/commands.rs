//! # `auth::commands` — Comandos Tauri del Módulo de Autenticación
//!
//! Expone el flujo OAuth 2.1 al frontend a través de Tauri `invoke()`.
//! El frontend **NUNCA** recibe ni manipula el token directamente (AUTH_SPEC §4).
//!
//! ## Cambios en Fase 3
//! - `auth_login_url`: genera un UUID v4 como `state` anti-CSRF y lo pasa
//!   tanto a Keycloak como al `CallbackServer` para validación.
//! - `auth_logout`: revoca la sesión remotamente en Keycloak antes de limpiar
//!   el estado local. La revocación es "best-effort" (falla → solo log).
//!
//! ## Comandos
//! | Comando Tauri   | Descripción                                              |
//! |-----------------|----------------------------------------------------------|
//! | `auth_login_url`| Inicia el flujo OAuth: PKCE + CSRF UUID + loopback       |
//! | `auth_status`   | Retorna `AuthSessionInfo` (username, rol, exp) o `None`  |
//! | `auth_logout`   | Revocación remota + limpieza local de `AuthState`        |
//!
//! ## Eventos emitidos al frontend
//! | Evento                | Payload           | Cuándo                        |
//! |-----------------------|-------------------|-------------------------------|
//! | `auth://session-ready`| `AuthSessionInfo` | Login o refresh exitoso       |
//! | `auth://error`        | `String`          | Error en cualquier paso OAuth |

use std::time::Duration;
use tauri::{Emitter, Manager};
use uuid::Uuid;

use crate::state_core::{AuthSessionInfo, AuthState};
use super::{
    callback::CallbackServer,
    client::{KeycloakClient, KeycloakRole, KeycloakUser},
    config::KeycloakConfig,
    pkce::PkceVerifier,
};

/// Evento Tauri emitido al frontend cuando la sesión OAuth está lista.
pub const EVENT_SESSION_READY: &str = "auth://session-ready";
/// Evento Tauri emitido al frontend cuando el flujo OAuth falla.
pub const EVENT_AUTH_ERROR:    &str = "auth://error";

// ─────────────────────────────────────────────────────────────────────────────
// Comandos Tauri
// ─────────────────────────────────────────────────────────────────────────────

/// Inicia el flujo OAuth 2.1 con PKCE + protección CSRF (AUTH_SPEC §3).
///
/// # Flujo ejecutado
/// 1. Genera `PkceVerifier` (verifier + challenge SHA-256)
/// 2. Guarda el verifier en `AuthState` (un solo uso)
/// 3. Genera un UUID v4 como `state` anti-CSRF
/// 4. Lee `KeycloakConfig` desde el entorno
/// 5. Arranca `CallbackServer` con el UUID CSRF (para validación interna)
/// 6. Construye la URL de autorización con parámetros PKCE + state UUID
/// 7. Abre el navegador del sistema
/// 8. Lanza tarea background que espera el código y lo intercambia por tokens
///
/// # Retorno
/// La URL de autorización completa (útil para debugging o fallback manual).
///
/// # Eventos (en background)
/// - `auth://session-ready` con `AuthSessionInfo` si el login es exitoso
/// - `auth://error` con mensaje si algo falla
#[tauri::command]
pub async fn auth_login_url(
    app:        tauri::AppHandle,
    auth_state: tauri::State<'_, AuthState>,
) -> Result<String, String> {
    // ── 1-2. Generar y guardar PKCE ──────────────────────────────────────────
    let verifier  = PkceVerifier::new();
    let challenge = verifier.challenge();
    auth_state.set_pending_verifier(verifier.into_string());

    // ── 3. Generar UUID anti-CSRF ────────────────────────────────────────────
    // UUID v4 aleatorio: imposible de predecir por un atacante externo.
    let csrf_state = Uuid::new_v4().to_string();

    // Liberar State<'_> ANTES del primer await (no implementa Send)
    drop(auth_state);

    // ── 4. Leer configuración ────────────────────────────────────────────────
    let config = KeycloakConfig::from_env();

    // ── 5. Arrancar servidor loopback con UUID CSRF ──────────────────────────
    let (redirect_uri, code_rx) = CallbackServer::spawn(csrf_state.clone())
        .await
        .map_err(|e| e.to_string())?;

    // ── 6. Construir URL de autorización ────────────────────────────────────
    let auth_url = config.build_auth_url(&challenge, &redirect_uri, &csrf_state);

    // ── 7. Abrir el navegador del sistema ────────────────────────────────────
    if let Err(e) = open::that(&auth_url) {
        eprintln!(
            "[AUTH] Advertencia: no se pudo abrir el navegador automáticamente: {}. \
             URL disponible como retorno del comando.", e
        );
    }

    // ── 8. Background task: intercambiar código por tokens ───────────────────
    tauri::async_runtime::spawn(exchange_code_background(
        app.clone(),
        config,
        redirect_uri.clone(),
        code_rx,
    ));

    Ok(auth_url)
}

/// Retorna la información de sesión actual si el usuario está autenticado.
///
/// El frontend usa esto al iniciar para mostrar el nombre de usuario
/// o el botón de login en el Sidebar.
///
/// Retorna `None` si no hay sesión activa o si el access_token ya expiró.
#[tauri::command]
pub fn auth_status(auth_state: tauri::State<'_, AuthState>) -> Option<AuthSessionInfo> {
    auth_state.session_info()
}

/// Cierra la sesión del usuario con revocación remota en Keycloak.
///
/// ## Estrategia "best-effort"
/// 1. Captura el `refresh_token` de `AuthState`
/// 2. Limpia el `AuthState` **inmediatamente** (logout local garantizado)
/// 3. Intenta revocar la sesión en Keycloak (POST /logout)
///    - Si falla → solo se registra en el log; el logout local ya ocurrió
///    - Si tiene éxito → la sesión SSO en el AD también queda invalidada
///
/// Esta estrategia garantiza que la UI nunca queda bloqueada por
/// un error de red en el servidor Keycloak.
#[tauri::command]
pub async fn auth_logout(
    app:        tauri::AppHandle,
    auth_state: tauri::State<'_, AuthState>,
) -> Result<(), String> {
    // Capturar refresh_token ANTES de limpiar el estado (y antes del await)
    let refresh_token = auth_state.get_refresh_token();

    // Limpiar estado local INMEDIATAMENTE (garantiza logout aunque falle la red)
    auth_state.clear();

    // Liberar State<'_> antes del primer await
    drop(auth_state);

    // Revocación remota best-effort
    if let Some(rt) = refresh_token {
        let config = KeycloakConfig::from_env();
        let client = KeycloakClient::new(config);

        // Ignoramos el error intencionalmente porque el logout local ya fue exitoso
        let _ = client.revoke_session(&rt).await;
    }

    // Notificar al frontend que la sesión fue cerrada
    // (el frontend puede usar esto para redirigir al login)
    let _ = app.emit("auth://logged-out", ());

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers privados
// ─────────────────────────────────────────────────────────────────────────────

/// Background task: espera el código OAuth del canal del `CallbackServer`,
/// lo intercambia por tokens (con validación RS256 incluida en Fase 3)
/// y actualiza `AuthState`. Emite eventos Tauri al completar.
async fn exchange_code_background(
    app:          tauri::AppHandle,
    config:       KeycloakConfig,
    redirect_uri: String,
    code_rx:      tokio::sync::oneshot::Receiver<String>,
) {
    // Esperar el código (con margen de 10 s sobre el timeout del servidor loopback)
    let code = match tokio::time::timeout(Duration::from_secs(310), code_rx).await {
        Ok(Ok(code)) => code,
        Ok(Err(_)) => {
            let _ = app.emit(EVENT_AUTH_ERROR, "Flujo OAuth cancelado");
            return;
        }
        Err(_) => {
            let _ = app.emit(EVENT_AUTH_ERROR, "Timeout: el login tardó demasiado");
            return;
        }
    };

    // Recuperar y consumir el verifier PKCE (semántica de un solo uso)
    let auth_state = app.state::<AuthState>();
    let verifier: String = match auth_state.take_pending_verifier() {
        Some(v) => v,
        None => {
            let _ = app.emit(EVENT_AUTH_ERROR, "Error interno: verifier PKCE no encontrado");
            return;
        }
    };

    // Intercambiar código por tokens (incluye validación RS256 con JWKS)
    let client = KeycloakClient::new(config.clone());
    match client.exchange_code(&code, &verifier, &redirect_uri).await {
        Ok(bundle) => {
            let session_info = bundle_to_session_info(&bundle);
            auth_state.store(bundle);
            let _ = app.emit(EVENT_SESSION_READY, &session_info);

            // Lanzar el daemon de renovación en background
            tauri::async_runtime::spawn(token_refresh_daemon(app.clone(), config));
        }
        Err(e) => {
            let _ = app.emit(EVENT_AUTH_ERROR, e.to_string());
        }
    }
}

/// Extrae `AuthSessionInfo` de un `TokenBundle` para enviar al frontend.
fn bundle_to_session_info(bundle: &crate::state_core::TokenBundle) -> AuthSessionInfo {
    AuthSessionInfo {
        preferred_username: bundle.claims.preferred_username.clone(),
        name:               bundle.claims.name.clone(),
        email:              bundle.claims.email.clone(),
        user_type:          bundle.claims.user_type.clone(),
        roles:              bundle.claims.roles.clone(),
        exp:                bundle.claims.exp,
    }
}

/// Daemon asíncrono que se ejecuta en segundo plano para renovar el token
/// silenciosamente antes de que expire.
async fn token_refresh_daemon(app: tauri::AppHandle, config: KeycloakConfig) {
    let client = KeycloakClient::new(config);
    
    loop {
        let auth_state = app.state::<AuthState>();
        
        let (_refresh_token, access_expires_at) = match auth_state.get_refresh_info() {
            Some(info) => info,
            None => {
                break;
            }
        };

        let now = std::time::Instant::now();
        // Despertar 45 segundos antes de que expire el access token
        let margin = std::time::Duration::from_secs(45);
        
        if access_expires_at > now + margin {
            let sleep_duration = access_expires_at - now - margin;
            tokio::time::sleep(sleep_duration).await;
        } else {
            // Si ya está muy cerca de expirar, esperar solo un momento para evitar saturar en caso de fallo continuo
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }

        // Al despertar, verificamos si hay sesión (puede haber hecho logout manualmente)
        let current_refresh_token = match auth_state.get_refresh_token() {
            Some(rt) => rt,
            None => {
                break;
            }
        };

        match client.refresh_access_token(&current_refresh_token).await {
            Ok(bundle) => {
                let session_info = bundle_to_session_info(&bundle);
                auth_state.store(bundle);
                let _ = app.emit(EVENT_SESSION_READY, &session_info);
            }
            Err(_e) => {
                auth_state.clear();
                let _ = app.emit("auth://logged-out", ());
                break;
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin REST API Commands
// ─────────────────────────────────────────────────────────────────────────────

fn check_admin_lab(auth_state: &tauri::State<'_, AuthState>) -> Result<String, String> {
    let session = auth_state.session_info().ok_or("No hay sesión activa")?;
    if !session.roles.contains(&"admin_lab".to_string()) {
        return Err("Permisos insuficientes: se requiere rol admin_lab".to_string());
    }
    auth_state.get_access_token().ok_or("Token de acceso expirado o inválido".to_string())
}

#[tauri::command]
pub async fn admin_search_users(
    query: String,
    auth_state: tauri::State<'_, AuthState>,
) -> Result<Vec<KeycloakUser>, String> {
    let query = query.trim().to_string();
    if query.len() < 2 {
        return Err("La búsqueda debe tener al menos 2 caracteres".to_string());
    }

    let token = check_admin_lab(&auth_state)?;
    let config = KeycloakConfig::from_env();
    let client = KeycloakClient::new(config);
    client.admin_search_users(&token, &query).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn admin_get_user_roles(
    user_id: String,
    auth_state: tauri::State<'_, AuthState>,
) -> Result<Vec<KeycloakRole>, String> {
    let token = check_admin_lab(&auth_state)?;
    let config = KeycloakConfig::from_env();
    let client = KeycloakClient::new(config);
    client.admin_get_user_roles(&token, &user_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn admin_toggle_user_role(
    user_id: String,
    role_name: String,
    assign: bool,
    auth_state: tauri::State<'_, AuthState>,
) -> Result<(), String> {
    let token = check_admin_lab(&auth_state)?;
    let config = KeycloakConfig::from_env();
    let client = KeycloakClient::new(config);
    
    let role = client.admin_get_role_by_name(&token, &role_name)
        .await
        .map_err(|e| format!("Error obteniendo rol {}: {}", role_name, e))?;

    if assign {
        client.admin_assign_role(&token, &user_id, &role).await.map_err(|e| e.to_string())
    } else {
        client.admin_remove_role(&token, &user_id, &role).await.map_err(|e| e.to_string())
    }
}
