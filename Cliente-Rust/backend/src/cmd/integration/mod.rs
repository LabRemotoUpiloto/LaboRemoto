//! cmd/integration — Integraciones con servicios externos
//!
//! Este módulo contiene:
//! - moodle.rs: Cliente de API de Moodle
//! - mcp_client.rs: Cliente MCP (Model Context Protocol)
//! - lab_practices.rs: Catálogo externo de prácticas (solo lectura, contenido no confiable)

pub mod moodle;
pub mod mcp_client;
pub mod lab_practices;

pub use moodle::{moodle_sync_assignment, moodle_prepare_grade, moodle_submit_grade_direct};
pub use mcp_client::{mcp_register_server, mcp_list_servers, mcp_remove_server, mcp_refresh_tools};
pub use lab_practices::{lab_practices_list, lab_practices_get};
