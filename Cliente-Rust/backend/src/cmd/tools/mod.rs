//! cmd/tools — Herramientas y utilidades
//!
//! Este módulo contiene:
//! - tools.rs: Tools de AI con contexto de terminal
//! - search_shared.rs: Búsqueda compartida

pub mod tools;
pub mod search_shared;

pub use tools::{get_terminal_context, agent_chat, plan_chat};
