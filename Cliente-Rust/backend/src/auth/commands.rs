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
//!
//! ## REFACTOR #5 Fase B — piloto de integración con `ipc`
//! Los tres puntos de emisión de arriba ya NO llaman a `AppHandle::emit`
//! directamente. En su lugar construyen un `Message::AuthStateChange`,
//! lo envuelven en un `MessageEnvelope` (`Priority::High`, `require_ack:
//! false` — ver justificación en `enqueue_auth_event`) y lo encolan vía
//! `IpcHub` (managed state de Tauri, ver `lib.rs`). Un dispatcher en
//! `ipc::IpcHub::spawn_dispatcher` (arrancado en `.setup()`) consume la cola
//! y hace el `emit` real, preservando exactamente los mismos nombres de
//! canal y el mismo payload que el frontend (`store/auth.ts`) ya consume
//! hoy — cero cambios requeridos ahí.

use std::sync::Arc;
use std::time::Duration;
use tauri::Manager;
use uuid::Uuid;

use crate::ipc::{AuthStateKind, IpcHub, Message, MessageEnvelope, Priority};
use crate::session_manager::SessionManager;
use crate::state_core::AuthSessionInfo;
use super::{
    callback::CallbackServer,
    client::{KeycloakClient, KeycloakRole, KeycloakUser},
    config::KeycloakConfig,
    pkce::PkceVerifier,
};

/// Evento Tauri emitido al frontend cuando la sesión OAuth está lista.
/// (Referencia documental: el nombre real de canal vive en
/// `ipc::EVENT_AUTH_SESSION_READY`, única fuente de verdad usada por el
/// dispatcher — ver módulo `ipc`.)
pub const EVENT_SESSION_READY: &str = "auth://session-ready";
/// Evento Tauri emitido al frontend cuando el flujo OAuth falla.
/// (Referencia documental: el nombre real vive en `ipc::EVENT_AUTH_ERROR`.)
pub const EVENT_AUTH_ERROR:    &str = "auth://error";

/// Construye un `Message::AuthStateChange`, lo envuelve en un
/// `MessageEnvelope` fresco (nuevo `message_id` UUID v4 en cada llamada —
/// nunca reutilizar ids entre reintentos, ver advertencia de Fase A sobre
/// `DuplicateRegistration` transitorio en `AckRegistry`) y lo encola en el
/// `IpcHub`.
///
/// ## `require_ack: false` — justificación
/// Los eventos de auth son de altísima prioridad (`Priority::High`, que
/// `BackpressureChannel` **nunca** descarta, incluso con la cola saturada)
/// pero de bajísima frecuencia (1x por login/logout/error). No usamos
/// `require_ack: true` porque:
/// 1. El mecanismo de ACK existente requeriría que el frontend invoque un
///    comando Tauri de confirmación tras recibir el evento — un cambio de
///    contrato en `store/auth.ts` que el piloto explícitamente evita.
/// 2. `Priority::High` ya garantiza que el mensaje no se pierde en la cola
///    interna del backend; el riesgo real que un ACK mitigaría (pérdida en
///    la capa de transporte hacia el frontend) no cambia con este piloto:
///    `AppHandle::emit` es exactamente el mismo mecanismo de entrega de hoy.
/// 3. Bloquear el flujo de login/logout esperando una confirmación del
///    frontend para un evento informativo introduciría latencia y una
///    nueva fuente de fallos (timeout) sin beneficio de negocio claro.
fn enqueue_auth_event(
    hub: &IpcHub,
    session_id: String,
    new_state: AuthStateKind,
    payload: serde_json::Value,
) {
    let envelope = MessageEnvelope::new(
        Message::AuthStateChange { session_id, new_state, payload },
        Priority::High,
        false,
    );
    hub.enqueue(envelope);
}

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
    app:     tauri::AppHandle,
    manager: tauri::State<'_, Arc<dyn SessionManager>>,
) -> Result<String, String> {
    // Extraer el Arc antes de cualquier await (el guard de `State` no se retiene).
    let manager = manager.inner().clone();

    // ── 1-2. Generar y guardar PKCE ──────────────────────────────────────────
    let verifier  = PkceVerifier::new();
    let challenge = verifier.challenge();
    manager.set_pending_verifier(verifier.into_string()).await.map_err(|e| e.to_string())?;

    // ── 3. Generar UUID anti-CSRF ────────────────────────────────────────────
    // UUID v4 aleatorio: imposible de predecir por un atacante externo.
    let csrf_state = Uuid::new_v4().to_string();

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
pub async fn auth_status(manager: tauri::State<'_, Arc<dyn SessionManager>>) -> Result<Option<AuthSessionInfo>, String> {
    let manager = manager.inner().clone();
    manager.session_info().await.map_err(|e| e.to_string())
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
    app:     tauri::AppHandle,
    manager: tauri::State<'_, Arc<dyn SessionManager>>,
) -> Result<(), String> {
    // Extraer el Arc antes de cualquier await (el guard de `State` no se retiene).
    let manager = manager.inner().clone();

    // Capturar refresh_token ANTES de limpiar el estado
    let refresh_token = manager.get_refresh_token().await.map_err(|e| e.to_string())?;

    // Limpiar estado local INMEDIATAMENTE (garantiza logout aunque falle la red)
    manager.clear_auth().await.map_err(|e| e.to_string())?;

    // Revocación remota best-effort
    if let Some(rt) = refresh_token {
        let config = KeycloakConfig::from_env();
        let client = KeycloakClient::new(config);

        // Ignoramos el error intencionalmente porque el logout local ya fue exitoso
        let _ = client.revoke_session(&rt).await;
    }

    // Notificar al frontend que la sesión fue cerrada
    // (el frontend puede usar esto para redirigir al login)
    let hub = app.state::<IpcHub>().inner().clone();
    enqueue_auth_event(&hub, "local".to_string(), AuthStateKind::LoggedOut, serde_json::Value::Null);

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
    let hub = app.state::<IpcHub>().inner().clone();

    // Esperar el código (con margen de 10 s sobre el timeout del servidor loopback)
    let code = match tokio::time::timeout(Duration::from_secs(310), code_rx).await {
        Ok(Ok(code)) => code,
        Ok(Err(_)) => {
            enqueue_auth_event(&hub, "unknown".to_string(), AuthStateKind::Error, serde_json::Value::String("Flujo OAuth cancelado".to_string()));
            return;
        }
        Err(_) => {
            enqueue_auth_event(&hub, "unknown".to_string(), AuthStateKind::Error, serde_json::Value::String("Timeout: el login tardó demasiado".to_string()));
            return;
        }
    };

    // Recuperar y consumir el verifier PKCE (semántica de un solo uso)
    let manager = app.state::<Arc<dyn SessionManager>>().inner().clone();
    let verifier: String = match manager.take_pending_verifier().await {
        Ok(Some(v)) => v,
        Ok(None) | Err(_) => {
            enqueue_auth_event(&hub, "unknown".to_string(), AuthStateKind::Error, serde_json::Value::String("Error interno: verifier PKCE no encontrado".to_string()));
            return;
        }
    };

    // Intercambiar código por tokens (incluye validación RS256 con JWKS)
    let client = KeycloakClient::new(config.clone());
    match client.exchange_code(&code, &verifier, &redirect_uri).await {
        Ok(bundle) => {
            let session_info = bundle_to_session_info(&bundle);
            let _ = manager.store_auth(bundle).await;
            let payload = serde_json::to_value(&session_info).unwrap_or(serde_json::Value::Null);
            enqueue_auth_event(&hub, session_info.preferred_username.clone(), AuthStateKind::SessionReady, payload);

            // Lanzar el daemon de renovación en background
            tauri::async_runtime::spawn(token_refresh_daemon(app.clone(), config));
        }
        Err(e) => {
            enqueue_auth_event(&hub, "unknown".to_string(), AuthStateKind::Error, serde_json::Value::String(e.to_string()));
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
    // El Arc no cambia durante la vida de la app: se extrae una sola vez.
    let manager = app.state::<Arc<dyn SessionManager>>().inner().clone();
    let hub = app.state::<IpcHub>().inner().clone();

    loop {
        let (_refresh_token, access_expires_at) = match manager.get_refresh_info().await {
            Ok(Some(info)) => info,
            Ok(None) | Err(_) => {
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
        let current_refresh_token = match manager.get_refresh_token().await {
            Ok(Some(rt)) => rt,
            Ok(None) | Err(_) => {
                break;
            }
        };

        match client.refresh_access_token(&current_refresh_token).await {
            Ok(bundle) => {
                let session_info = bundle_to_session_info(&bundle);
                let _ = manager.store_auth(bundle).await;
                let payload = serde_json::to_value(&session_info).unwrap_or(serde_json::Value::Null);
                enqueue_auth_event(&hub, session_info.preferred_username.clone(), AuthStateKind::SessionReady, payload);
            }
            Err(_e) => {
                let _ = manager.clear_auth().await;
                enqueue_auth_event(&hub, "local".to_string(), AuthStateKind::LoggedOut, serde_json::Value::Null);
                break;
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin REST API Commands
// ─────────────────────────────────────────────────────────────────────────────

async fn check_admin_lab(manager: &Arc<dyn SessionManager>) -> Result<String, String> {
    let session = manager.session_info().await.map_err(|e| e.to_string())?
        .ok_or("No hay sesión activa")?;
    if !session.roles.contains(&"admin_lab".to_string()) {
        return Err("Permisos insuficientes: se requiere rol admin_lab".to_string());
    }
    manager.get_access_token().await.map_err(|e| e.to_string())?
        .ok_or("Token de acceso expirado o inválido".to_string())
}

#[tauri::command]
pub async fn admin_search_users(
    query: String,
    manager: tauri::State<'_, Arc<dyn SessionManager>>,
) -> Result<Vec<KeycloakUser>, String> {
    let manager = manager.inner().clone();
    let query = query.trim().to_string();
    if query.len() < 2 {
        return Err("La búsqueda debe tener al menos 2 caracteres".to_string());
    }

    let token = check_admin_lab(&manager).await?;
    let config = KeycloakConfig::from_env();
    let client = KeycloakClient::new(config);
    client.admin_search_users(&token, &query).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn admin_get_user_roles(
    user_id: String,
    manager: tauri::State<'_, Arc<dyn SessionManager>>,
) -> Result<Vec<KeycloakRole>, String> {
    let manager = manager.inner().clone();
    let token = check_admin_lab(&manager).await?;
    let config = KeycloakConfig::from_env();
    let client = KeycloakClient::new(config);
    client.admin_get_user_roles(&token, &user_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn admin_toggle_user_role(
    user_id: String,
    role_name: String,
    assign: bool,
    manager: tauri::State<'_, Arc<dyn SessionManager>>,
) -> Result<(), String> {
    let manager = manager.inner().clone();
    let token = check_admin_lab(&manager).await?;
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
