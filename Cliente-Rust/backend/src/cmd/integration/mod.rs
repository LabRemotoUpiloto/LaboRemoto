//! cmd/integration — Integraciones con servicios externos
//!
//! Este módulo contiene:
//! - moodle.rs: Cliente de API de Moodle
//! - mcp_client.rs: Cliente MCP (Model Context Protocol)

pub mod moodle;
pub mod mcp_client;

pub use moodle::{moodle_sync_assignment, moodle_prepare_grade, moodle_submit_grade_direct};
pub use mcp_client::{mcp_register_server, mcp_list_servers, mcp_remove_server, mcp_refresh_tools};
