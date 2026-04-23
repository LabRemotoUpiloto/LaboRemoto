// Modularización de comandos Tauri.
// Este módulo re-exporta todos los comandos para mantener la API pública estable
// (cmd::nombre_funcion) mientras separa la implementación por dominios.

pub mod state;   // Estado compartido entre comandos (sesiones SSH activas)
pub mod ai;      // Chat con IA
pub mod ai_utils; // Utilidades compartidas para AI (normalizaciones, etc.)
pub mod file_edit; // Análisis y edición de archivos
pub mod ssh;     // Conexión SSH interactiva
pub mod sftp;    // Operaciones SFTP y transferencias
pub mod local;   // Acceso a FS local
pub mod hosts;   // Comandos de almacenamiento de hosts (envolturas de crate::storage)
pub mod agent;   // Modo agente (planificación y tools internas) - puede depreciarse
pub mod search_shared; // Búsqueda remota compartida
pub mod logs;    // Sistema de logs de sesión (captura de buffers SSH)
pub mod pdf_reports; // Reportes PDF locales en savedLogs
pub mod vnc;     // Sesiones de escritorio gráfico remoto (Xvfb + x11vnc + noVNC)
pub mod stream;  // Port-forwarding genérico para streaming de video/otros
pub mod tools;   // Herramientas del agente AI (tool_use loop, contexto terminal)
pub mod mcp_client; // Cliente MCP (Model Context Protocol) vía stdio
pub mod practicas;   // Sistema de prácticas de laboratorio remoto
pub mod moodle;      // Integración con Moodle LMS
pub mod practice_validator; // Validador automático de prácticas
pub mod arduino;     // Bridge HTTP → Serial para Arduino de domótica

// Re-exportar comandos para no cambiar rutas usadas en lib.rs
pub use ai::{ai_chat, AiChatRequest, AiChatResponse};
pub use ssh::{ssh_connect, ssh_stdin, ssh_resize, ssh_disconnect, ssh_connect_stored};
pub use sftp::*;
pub use local::*;
pub use hosts::*;
pub use agent::{agent_plan, AgentPlanRequest, AgentPlanResponse, ToolActionResult, FsSearchMatch};
pub use file_edit::{analyze_file, analyze_any_file, plan_file_edit, apply_file_edit, list_file_backups, revert_file, AnalyzeFileResponse, PlanFileEditRequest, PlanFileEditResponse, ApplyFileEditRequest, ApplyFileEditResponse, ListBackupsResponse, RevertFileRequest, RevertFileResponse, AiRemoteEditRequest, AiRemoteEditResponse, ai_remote_edit_file};
pub use logs::{save_session_log, list_session_logs, get_session_log_content, get_session_log, delete_session_log, cleanup_old_session_logs};
pub use logs::save_session_log_fragment;
pub use pdf_reports::{save_pdf_base64};
pub use stream::{stream_start, stream_stop, stream_list_cameras};
pub use tools::{get_terminal_context, agent_chat, AgentChatResponse, plan_chat, PlanChatRequest};
