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
//! | `auth_refresh`  | Renueva el access_token con el refresh_token almacenado  |
//!
//! ## Eventos emitidos al frontend
//! | Evento                | Payload           | Cuándo                        |
//! |-----------------------|-------------------|-------------------------------|
//! | `auth://session-ready`| `AuthSessionInfo` | Login o refresh exitoso       |
//! | `auth://error`        | `String`          | Error en cualquier paso OAuth |

use std::time::Duration;
use tauri::Emitter;
use uuid::Uuid;

use crate::state_core::{AuthSessionInfo, AuthState};
use super::{
    callback::CallbackServer,
    client::KeycloakClient,
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

    println!("[AUTH] Flujo OAuth iniciado. Callback en: {}", redirect_uri);
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

        match client.revoke_session(&rt).await {
            Ok(()) => {
                println!("[AUTH] ✓ Sesión revocada en Keycloak (logout federado SSO).");
            }
            Err(e) => {
                // No retornar error: el logout local ya fue exitoso
                eprintln!(
                    "[AUTH] Advertencia: revocación remota falló: {}. \
                     La sesión local fue eliminada correctamente.", e
                );
            }
        }
    } else {
        println!("[AUTH] auth_logout llamado sin sesión activa.");
    }

    // Notificar al frontend que la sesión fue cerrada
    // (el frontend puede usar esto para redirigir al login)
    let _ = app.emit("auth://logged-out", ());

    Ok(())
}

/// Renueva el access_token usando el refresh_token almacenado en `AuthState`.
///
/// El frontend puede llamar este comando proactivamente cuando
/// `exp` del `auth_status` está próximo a vencer (menos de 60 s).
///
/// Si el refresh falla (refresh_token expirado o revocado),
/// limpia la sesión y retorna error para que el frontend redirija al login.
#[tauri::command]
pub async fn auth_refresh(
    app:        tauri::AppHandle,
    auth_state: tauri::State<'_, AuthState>,
) -> Result<(), String> {
    let refresh_token = auth_state
        .get_refresh_token()
        .ok_or_else(|| "No hay sesión activa o el refresh_token ha expirado".to_string())?;

    let config = KeycloakConfig::from_env();
    drop(auth_state); // Liberar State<'_> antes del await

    let client = KeycloakClient::new(config);
    match client.refresh_token(&refresh_token).await {
        Ok(bundle) => {
            let session_info = bundle_to_session_info(&bundle);
            let auth_state = app.state::<AuthState>();
            auth_state.store(bundle);
            let _ = app.emit(EVENT_SESSION_READY, &session_info);
            println!(
                "[AUTH] ✓ Token renovado: {} ({})",
                session_info.preferred_username, session_info.user_type
            );
            Ok(())
        }
        Err(e) => {
            eprintln!("[AUTH] Error al renovar token: {}. Forzando re-login.", e);
            app.state::<AuthState>().clear();
            Err(e.to_string())
        }
    }
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
            eprintln!("[AUTH] Canal del callback cerrado antes de recibir código.");
            let _ = app.emit(EVENT_AUTH_ERROR, "Flujo OAuth cancelado");
            return;
        }
        Err(_) => {
            eprintln!("[AUTH] Timeout esperando el código OAuth (>5 min).");
            let _ = app.emit(EVENT_AUTH_ERROR, "Timeout: el login tardó demasiado");
            return;
        }
    };

    // Recuperar y consumir el verifier PKCE (semántica de un solo uso)
    let auth_state = app.state::<AuthState>();
    let verifier = match auth_state.take_pending_verifier() {
        Some(v) => v,
        None => {
            eprintln!("[AUTH] No hay verifier PKCE pendiente. Posible ataque de replay.");
            let _ = app.emit(EVENT_AUTH_ERROR, "Error interno: verifier PKCE no encontrado");
            return;
        }
    };

    // Intercambiar código por tokens (incluye validación RS256 con JWKS)
    let client = KeycloakClient::new(config);
    match client.exchange_code(&code, &verifier, &redirect_uri).await {
        Ok(bundle) => {
            let session_info = bundle_to_session_info(&bundle);
            println!(
                "[AUTH] ✓ Sesión iniciada: {} ({})",
                session_info.preferred_username, session_info.user_type
            );
            auth_state.store(bundle);
            let _ = app.emit(EVENT_SESSION_READY, &session_info);
        }
        Err(e) => {
            eprintln!("[AUTH] Error al intercambiar código: {}", e);
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
        exp:                bundle.claims.exp,
    }
}
