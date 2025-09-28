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

// Re-exportar comandos para no cambiar rutas usadas en lib.rs
pub use ai::{ai_chat, AiChatRequest, AiChatResponse};
pub use ssh::{ssh_connect, ssh_stdin, ssh_resize, ssh_disconnect, ssh_connect_stored};
pub use sftp::*;
pub use local::*;
pub use hosts::*;
pub use agent::{agent_plan, AgentPlanRequest, AgentPlanResponse, ToolActionResult, FsSearchMatch};
pub use file_edit::{analyze_file, analyze_any_file, plan_file_edit, apply_file_edit, list_file_backups, revert_file, AnalyzeFileResponse, PlanFileEditRequest, PlanFileEditResponse, ApplyFileEditRequest, ApplyFileEditResponse, ListBackupsResponse, RevertFileRequest, RevertFileResponse, AiRemoteEditRequest, AiRemoteEditResponse, ai_remote_edit_file};
