//! cmd/state — Estado compartido entre comandos
//!
//! Este módulo contiene:
//! - SESSIONS: HashMap global de sesiones SSH activas
//! - TRANSFERS: Registro de transferencias SFTP en progreso
//! - Tipos de datos para sesiones, VNC, SFTP, local filesystem
//! - Lógica de cleanup de sesiones VNC huérfanas

pub mod types;
pub mod session;

use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::sync::atomic::AtomicBool;

// Re-export de tipos públicos para compatibilidad
pub use types::{CameraInfo, SftpEntry, LocalEntry};
pub use session::{SessionExt, CachedSsh2, VncSessionState, run_pending_vnc_cleanups};

// Alias para el tipo de sesión para uso en otros módulos
pub type SessionType = session::SessionExt;

// Sesiones SSH activas en memoria, indexadas por un ID (UUID)
pub static SESSIONS: Lazy<Mutex<HashMap<String, session::SessionExt>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

// Registro de cancelación de transferencias
pub static TRANSFERS: Lazy<Mutex<HashMap<String, Arc<AtomicBool>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));