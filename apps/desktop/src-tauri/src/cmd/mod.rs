// Modularización de comandos Tauri.
// Este módulo re-exporta todos los comandos para mantener la API pública estable
// (cmd::nombre_funcion) mientras separa la implementación por dominios.

pub mod state;   // Estado compartido entre comandos (sesiones SSH activas)
pub mod ai;      // Chat con IA
pub mod ssh;     // Conexión SSH interactiva
pub mod sftp;    // Operaciones SFTP y transferencias
pub mod local;   // Acceso a FS local
pub mod hosts;   // Comandos de almacenamiento de hosts (envolturas de crate::storage)

// Re-exportar comandos para no cambiar rutas usadas en lib.rs
pub use ai::{ai_chat, AiChatRequest, AiChatResponse};
pub use ssh::{ssh_connect, ssh_stdin, ssh_resize, ssh_disconnect, ssh_connect_stored};
pub use sftp::*;
pub use local::*;
pub use hosts::*;
