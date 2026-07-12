//! # `session_manager` — Store único de Sesión + Autenticación
//!
//! Consolida en un solo trait (`SessionManager`) los dos custodios de estado
//! efímero que antes vivían por separado en `state_core`:
//!
//! - **Sesión** (`SessionMem`/`SessionMemPatch`): contexto de trabajo por
//!   `session_id` (último archivo, comando, cwd, etc.), usado por el chat IA
//!   y el terminal SSH.
//! - **Auth** (`TokenBundle`/`AuthSessionInfo`): custodio del JWT en memoria
//!   (OAuth 2.1), antes en `state_core::auth_state::AuthState`.
//!
//! ## Por qué un solo trait
//! Ambos custodios comparten el mismo ciclo de vida (memoria de proceso,
//! TTL, GC) y el mismo patrón de acceso (`tauri::State`). Consolidarlos
//! detrás de una interfaz común permite:
//! 1. Sustituir el backend (`InMemorySessionManager` → `RedisSessionManager`)
//!    sin tocar los ~60 handlers que lo consumen.
//! 2. Un único punto de inyección en `lib.rs` (`.manage(Arc<dyn SessionManager>)`).
//! 3. Tests de contrato compartidos entre implementaciones.
//!
//! ## Compatibilidad
//! La lógica interna de `InMemorySessionManager` reutiliza tal cual las
//! implementaciones ya probadas de `state_core::session::AppState` y
//! `state_core::auth_state::AuthState` (composición, no reescritura), para
//! no alterar el comportamiento observable de los handlers migrados.

pub mod in_memory;
pub mod redis;

use std::time::Instant;

use crate::state_core::auth_state::{AuthSessionInfo, TokenBundle};
use crate::state_core::session::{SessionMem, SessionMemPatch};

pub use in_memory::InMemorySessionManager;
pub use redis::RedisSessionManager;

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de soporte
// ─────────────────────────────────────────────────────────────────────────────

/// Error uniforme para todas las operaciones del `SessionManager`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionError {
    /// No existe la entrada solicitada (sesión o auth).
    NotFound(String),
    /// La entrada existía pero expiró por TTL.
    Expired(String),
    /// Error interno del backend (I/O, conexión, backend no implementado, etc.).
    Internal(String),
}

impl std::fmt::Display for SessionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SessionError::NotFound(s) => write!(f, "No encontrado: {s}"),
            SessionError::Expired(s) => write!(f, "Expirado: {s}"),
            SessionError::Internal(s) => write!(f, "Error interno: {s}"),
        }
    }
}

impl std::error::Error for SessionError {}

/// Resultado de una pasada de recolección de basura (`gc`).
#[derive(Debug, Clone, Copy, Default)]
pub struct GcResult {
    pub sessions_removed: usize,
    pub bytes_freed: usize,
}

/// Backend actualmente en uso por una implementación de `SessionManager`.
/// Útil para diagnósticos (`/health`, logs) sin necesidad de downcasting.
#[derive(Debug, Clone)]
pub enum SessionBackendType {
    InMemory,
    Redis { url: String },
}

// ─────────────────────────────────────────────────────────────────────────────
// Trait principal
// ─────────────────────────────────────────────────────────────────────────────

/// Store único de sesión + autenticación. Implementado por
/// [`InMemorySessionManager`] (HashMap + TTL, backend actual) y
/// [`RedisSessionManager`] (stub, backend futuro para despliegues
/// multi-instancia).
#[async_trait::async_trait]
pub trait SessionManager: Send + Sync {
    // ── Sesión (SessionMem) ─────────────────────────────────────────────────

    /// Aplica un patch (merge) sobre la sesión `session_id`, creándola si no existe.
    /// Refresca el TTL de la entrada.
    async fn put_session_patch(&self, session_id: &str, patch: SessionMemPatch) -> Result<(), SessionError>;

    /// Retorna la sesión si existe y no ha expirado.
    async fn get_session(&self, session_id: &str) -> Result<Option<SessionMem>, SessionError>;

    /// Elimina la sesión (si existe). No es un error si no existía.
    async fn delete_session(&self, session_id: &str) -> Result<(), SessionError>;

    /// IDs de todas las sesiones actualmente almacenadas (incluye posibles
    /// entradas pendientes de `gc`).
    async fn list_active_sessions(&self) -> Result<Vec<String>, SessionError>;

    // ── Auth (custodio único del JWT) ───────────────────────────────────────

    /// Almacena un nuevo paquete de tokens, reemplazando cualquier sesión anterior.
    async fn store_auth(&self, bundle: TokenBundle) -> Result<(), SessionError>;

    /// Limpia la sesión de autenticación actual (logout local).
    async fn clear_auth(&self) -> Result<(), SessionError>;

    /// Access token vigente, o `None` si no hay sesión o ya expiró.
    async fn get_access_token(&self) -> Result<Option<String>, SessionError>;

    /// Refresh token vigente, o `None` si no hay sesión o ya expiró.
    async fn get_refresh_token(&self) -> Result<Option<String>, SessionError>;

    /// Refresh token + instante de expiración del access token (para el daemon
    /// de renovación en background).
    async fn get_refresh_info(&self) -> Result<Option<(String, Instant)>, SessionError>;

    /// `true` si hay un access_token válido y no expirado.
    async fn is_authenticated(&self) -> Result<bool, SessionError>;

    /// Información de sesión apta para el frontend (sin tokens).
    async fn session_info(&self) -> Result<Option<AuthSessionInfo>, SessionError>;

    /// `true` si el access_token está próximo a vencer pero el refresh aún es válido.
    async fn needs_refresh(&self) -> Result<bool, SessionError>;

    /// Guarda el `code_verifier` PKCE pendiente (un solo uso).
    async fn set_pending_verifier(&self, verifier: String) -> Result<(), SessionError>;

    /// Consume y retorna el `code_verifier` PKCE pendiente.
    async fn take_pending_verifier(&self) -> Result<Option<String>, SessionError>;

    // ── Ciclo de vida ────────────────────────────────────────────────────────

    /// Ejecuta una pasada de recolección de basura sobre sesiones expiradas.
    async fn gc(&self) -> Result<GcResult, SessionError>;

    /// Backend actualmente en uso (diagnóstico).
    fn backend_type(&self) -> SessionBackendType;
}
