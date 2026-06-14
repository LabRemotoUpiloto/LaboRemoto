//! cmd/logs — Gestión de logs de sesión
//!
//! Este módulo contiene:
//! - logs.rs: Almacenamiento y recuperación de logs

pub mod logs;

pub use logs::{save_session_log, save_session_log_fragment, list_session_logs, get_session_log_content, get_session_log, delete_session_log, cleanup_old_session_logs};
