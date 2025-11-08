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
pub mod logs_cloud; // Sistema de logs en Supabase Storage (multi-usuario)
pub mod ldap_sync; // Sincronización LDAP y funciones helper de Supabase
pub mod ldap_auth; // Autenticación LDAP
pub mod mock_auth; // Autenticación con usuarios mock (desarrollo)
pub mod jwt;     // Generación y validación de JWT tokens
pub mod auth;    // Comandos de autenticación (integra LDAP + Mock + Supabase + JWT)
pub mod users;   // Gestión de usuarios (admin)
pub mod groups;  // Gestión de grupos (profesores)
pub mod dashboards; // Estadísticas y dashboards por rol
pub mod pdf_reports; // Generación de reportes PDF con WeasyPrint

// Re-exportar comandos para no cambiar rutas usadas en lib.rs
pub use ai::{ai_chat, AiChatRequest, AiChatResponse};
pub use ssh::{ssh_connect, ssh_stdin, ssh_resize, ssh_disconnect, ssh_connect_stored};
pub use sftp::*;
pub use local::*;
pub use hosts::*;
pub use agent::{agent_plan, AgentPlanRequest, AgentPlanResponse, ToolActionResult, FsSearchMatch};
pub use file_edit::{analyze_file, analyze_any_file, plan_file_edit, apply_file_edit, list_file_backups, revert_file, AnalyzeFileResponse, PlanFileEditRequest, PlanFileEditResponse, ApplyFileEditRequest, ApplyFileEditResponse, ListBackupsResponse, RevertFileRequest, RevertFileResponse, AiRemoteEditRequest, AiRemoteEditResponse, ai_remote_edit_file};
pub use logs::{save_session_log, list_session_logs, get_session_log_content, get_session_log, delete_session_log, cleanup_old_session_logs};
pub use logs_cloud::{save_session_log_cloud, get_user_session_logs, get_log_html_content, get_session_logs_by_role};
pub use auth::{login, validate_token, get_user_from_token, LoginResponse};
pub use mock_auth::{register_mock_user};
pub use users::{list_all_users, update_user, get_user_statistics, User, UpdateUserRequest};
pub use groups::{create_group, list_professor_groups, add_student_to_group, remove_student_from_group, list_group_members, delete_group, Group, GroupMember, CreateGroupRequest, AddStudentRequest};
pub use dashboards::{get_student_dashboard_stats, get_professor_dashboard_stats, get_admin_dashboard_stats, StudentDashboardStats, ProfessorDashboardStats, AdminDashboardStats};
pub use pdf_reports::{generate_session_report_pdf, copy_file, save_pdf_dialog};
