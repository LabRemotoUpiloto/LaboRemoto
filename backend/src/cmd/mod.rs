// Modularización de comandos Tauri.
// Cada submódulo expone sus propios comandos/funciones públicas;
// lib.rs las consume explícitamente como cmd::<mod>::<item> para evitar
// re-exports muertos y mantener el namespace limpio.

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
