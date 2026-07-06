//! # `auth::commands` — Comandos Tauri del Módulo de Autenticación
//!
//! Expone el flujo OAuth 2.1 al frontend a través de Tauri `invoke()`.
//! El frontend **NUNCA** recibe ni manipula el token directamente (AUTH_SPEC §4).
//!
//! ## Comandos
//! | Comando Tauri   | Descripción                                              |
//! |-----------------|----------------------------------------------------------|
//! | `auth_login_url`| Inicia el flujo OAuth: PKCE + loopback + browser         |
//! | `auth_status`   | Retorna `AuthSessionInfo` (username, rol, exp) o `None`  |
//! | `auth_logout`   | Limpia `AuthState` localmente (revocación en Fase 3)     |
//! | `auth_refresh`  | Renueva el access_token con el refresh_token almacenado  |
//!
//! ## Eventos emitidos al frontend
//! | Evento                | Payload           | Cuándo                        |
//! |-----------------------|-------------------|-------------------------------|
//! | `auth://session-ready`| `AuthSessionInfo` | Login o refresh exitoso       |
//! | `auth://error`        | `String`          | Error en cualquier paso OAuth |

use std::time::Duration;
use tauri::Emitter;

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

/// Inicia el flujo OAuth 2.1 con PKCE (AUTH_SPEC §3).
///
/// # Flujo ejecutado
/// 1. Genera `PkceVerifier` (verifier + challenge)
/// 2. Guarda el verifier en `AuthState` (consumo único en paso 7)
/// 3. Lee `KeycloakConfig` desde el entorno
/// 4. Arranca `CallbackServer` en puerto dinámico (`127.0.0.1:0`)
/// 5. Construye la URL de autorización de Keycloak con parámetros PKCE
/// 6. Abre el navegador del sistema con la URL
/// 7. Lanza tarea en background que espera el código y lo intercambia
///
/// Retorna la URL de autorización (útil para debugging o fallback manual).
///
/// # Eventos emitidos (en background)
/// - `auth://session-ready` con `AuthSessionInfo` si el login es exitoso
/// - `auth://error` con mensaje de error si algo falla
#[tauri::command]
pub async fn auth_login_url(
    app:        tauri::AppHandle,
    auth_state: tauri::State<'_, AuthState>,
) -> Result<String, String> {
    // ── 1-2. Generar y guardar PKCE ──────────────────────────────────────────
    // Todo el uso de auth_state ANTES del primer await
    let verifier  = PkceVerifier::new();
    let challenge = verifier.challenge();
    auth_state.set_pending_verifier(verifier.into_string());
    // Liberar explícitamente State<'_> antes de los awaits
    // (State<'_> no implementa Send; no puede cruzar puntos de await)
    drop(auth_state);

    // ── 3. Leer configuración ────────────────────────────────────────────────
    let config = KeycloakConfig::from_env();

    // ── 4. Arrancar servidor loopback ────────────────────────────────────────
    let (redirect_uri, code_rx) = CallbackServer::spawn()
        .await
        .map_err(|e| e.to_string())?;

    // ── 5. Construir URL de autorización ────────────────────────────────────
    // El valor de 'state' anti-CSRF debería ser un UUID aleatorio en producción.
    // En Fase 3 se generará con rand::Rng y se almacenará en AuthState para validación.
    let auth_url = config.build_auth_url(&challenge, &redirect_uri, "laboremoto_csrf_placeholder");

    // ── 6. Abrir el navegador del sistema ────────────────────────────────────
    if let Err(e) = open::that(&auth_url) {
        eprintln!(
            "[AUTH] Advertencia: no se pudo abrir el navegador automáticamente: {}. \
             URL disponible como retorno del comando.", e
        );
    }

    // ── 7. Background task: intercambiar código por tokens ───────────────────
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
/// Retorna `None` si no hay sesión o si el access_token ya expiró.
#[tauri::command]
pub fn auth_status(auth_state: tauri::State<'_, AuthState>) -> Option<AuthSessionInfo> {
    auth_state.session_info()
}

/// Cierra la sesión del usuario de forma local.
///
/// Limpia el `TokenBundle` de `AuthState`. Los tokens quedan inaccesibles
/// y serán reclamados por el GC de Rust al salir de scope.
///
/// **Nota:** La revocación del token en el servidor Keycloak (POST /logout)
/// se implementará en la Fase 3 para soportar logout federado con el AD.
#[tauri::command]
pub async fn auth_logout(auth_state: tauri::State<'_, AuthState>) -> Result<(), String> {
    auth_state.clear();
    println!("[AUTH] Sesión cerrada localmente (tokens eliminados de memoria).");
    Ok(())
}

/// Renueva el access_token usando el refresh_token almacenado en `AuthState`.
///
/// El frontend puede llamar este comando proactivamente al detectar que
/// `exp` del `auth_status` está próximo (menos de 60 s).
/// Tras un refresh exitoso, emite `auth://session-ready` con los nuevos metadatos.
///
/// Si el refresh falla (refresh_token expirado), limpia la sesión y retorna error
/// para que el frontend redirija al login.
#[tauri::command]
pub async fn auth_refresh(
    app:        tauri::AppHandle,
    auth_state: tauri::State<'_, AuthState>,
) -> Result<(), String> {
    // Extraer refresh_token ANTES del primer await
    let refresh_token = auth_state
        .get_refresh_token()
        .ok_or_else(|| "No hay sesión activa o el refresh_token ha expirado".to_string())?;

    let config = KeycloakConfig::from_env();
    drop(auth_state); // Liberar State<'_> antes del await

    let client = KeycloakClient::new(config);
    match client.refresh_token(&refresh_token).await {
        Ok(bundle) => {
            let session_info = bundle_to_session_info(&bundle);
            // Obtener nueva referencia al estado desde el AppHandle (pattern correcto post-await)
            let auth_state = app.state::<AuthState>();
            auth_state.store(bundle);
            let _ = app.emit(EVENT_SESSION_READY, &session_info);
            println!(
                "[AUTH] Token renovado exitosamente para: {}",
                session_info.preferred_username
            );
            Ok(())
        }
        Err(e) => {
            eprintln!("[AUTH] Error al renovar token: {}. Sesión limpiada.", e);
            // Si el refresh falla, forzar re-login
            app.state::<AuthState>().clear();
            Err(e.to_string())
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers privados
// ─────────────────────────────────────────────────────────────────────────────

/// Tarea en background: espera el código OAuth del canal, lo intercambia
/// por tokens y actualiza `AuthState`. Emite eventos Tauri al completar.
///
/// Se ejecuta en el runtime de Tauri (`tauri::async_runtime::spawn`).
/// Usa `app.state::<AuthState>()` post-await para acceder al estado de forma segura.
async fn exchange_code_background(
    app:          tauri::AppHandle,
    config:       KeycloakConfig,
    redirect_uri: String,
    code_rx:      tokio::sync::oneshot::Receiver<String>,
) {
    // Esperar el código con un margen de 10 s sobre el timeout del servidor
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

    // Recuperar y consumir el verifier PKCE (un solo uso)
    let auth_state = app.state::<AuthState>();
    let verifier = match auth_state.take_pending_verifier() {
        Some(v) => v,
        None => {
            eprintln!("[AUTH] No hay verifier PKCE pendiente. Posible ataque de replay.");
            let _ = app.emit(EVENT_AUTH_ERROR, "Error interno: verifier PKCE no encontrado");
            return;
        }
    };

    // Intercambiar código por tokens
    let client = KeycloakClient::new(config);
    match client.exchange_code(&code, &verifier, &redirect_uri).await {
        Ok(bundle) => {
            let session_info = bundle_to_session_info(&bundle);
            println!(
                "[AUTH] ✓ Sesión iniciada: {} ({})",
                session_info.preferred_username, session_info.user_type
            );
            auth_state.store(bundle);
            // Notificar al frontend — el Sidebar cambia de "Invitado" al nombre real
            let _ = app.emit(EVENT_SESSION_READY, &session_info);
        }
        Err(e) => {
            eprintln!("[AUTH] Error al intercambiar código: {}", e);
            let _ = app.emit(EVENT_AUTH_ERROR, e.to_string());
        }
    }
}

/// Extrae `AuthSessionInfo` de un `TokenBundle` para enviarlo al frontend.
///
/// Función auxiliar para evitar duplicar la misma conversión en `auth_login_url`
/// y `auth_refresh`.
fn bundle_to_session_info(bundle: &crate::state_core::TokenBundle) -> AuthSessionInfo {
    AuthSessionInfo {
        preferred_username: bundle.claims.preferred_username.clone(),
        name:               bundle.claims.name.clone(),
        email:              bundle.claims.email.clone(),
        user_type:          bundle.claims.user_type.clone(),
        exp:                bundle.claims.exp,
    }
}
