//! Comandos Tauri organizados por funcionalidad.
//!
//! Cada submódulo expone sus propios comandos/funciones públicas;
//! lib.rs las consume explícitamente como `cmd::<mod>::<item>` para evitar
//! re-exports muertos y mantener el namespace limpio.

pub mod state;       // Estado compartido entre comandos (sesiones SSH activas)
pub mod ssh;         // Conexión SSH interactiva
pub mod sftp;        // Operaciones SFTP y transferencias
pub mod vnc;         // Escritorio gráfico remoto (Xvfb + x11vnc + noVNC)
pub mod ai;          // Chat con IA, agente y utilidades
pub mod practices;   // Sistema de prácticas de laboratorio remoto
pub mod integration; // Integraciones externas (Moodle, MCP)
pub mod streaming;   // Port-forwarding para streaming de video
pub mod logs;        // Sistema de logs de sesión
pub mod editor;      // Análisis y edición de archivos
pub mod tools;       // Herramientas del agente AI
pub mod filesystem;  // Operaciones de filesystem local
pub mod hardware;    // Control de hardware (Arduino)
