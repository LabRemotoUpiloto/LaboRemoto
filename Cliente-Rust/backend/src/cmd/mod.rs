//! Comandos Tauri organizados por funcionalidad.
//!
//! Cada submódulo expone sus propios comandos/funciones públicas;
//! lib.rs las consume explícitamente como `cmd::<mod>::<item>` para evitar
//! re-exports muertos y mantener el namespace limpio.

pub mod state;       // Estado compartido entre comandos (sesiones SSH activas)
pub mod ssh;         // Conexión SSH interactiva
pub mod terminal_local; // Terminal local embebida (PTY nativo: powershell/pwsh en Windows, $SHELL en Unix)
pub mod sftp;        // Operaciones SFTP y transferencias
pub mod vnc;         // Escritorio gráfico remoto (Xvnc/TigerVNC + noVNC)
pub mod ai;          // Chat con IA, agente y utilidades
pub mod practices;   // Sistema de prácticas de laboratorio remoto
pub mod integration; // Integraciones externas (Moodle, MCP)
pub mod broker_client; // Boilerplate común para hablar con los brokers de la Pi (token, GET autenticado, errores de red)
pub mod nvr;         // Consumo del NVR Shinobi vía API HTTP directa
pub mod sesiones;    // Registro central de sesiones de práctica (vía broker)
pub mod moodle_cursos; // Cursos y prácticas desde Moodle (vía broker)
pub mod camaras_admin; // Administración de cámaras (crear/editar/eliminar/probar, vía broker)
pub mod encuestas; // Encuesta al terminar una práctica (vía broker de sesiones)
pub mod registros; // Registro de la terminal de cada intento de práctica, guardado en la Pi (vía broker de sesiones)
pub mod dispositivos; // Conexiones SSH a los dispositivos (pestaña Dispositivos de Actividad, vía broker)
pub mod comandos;    // Comandos guardados (antes snippets), en un JSON local
pub mod logs;        // Sistema de logs de sesión
pub mod tools;       // Herramientas del agente AI
pub mod filesystem;  // Operaciones de filesystem local
pub mod hardware;    // Control de hardware (Arduino)
pub mod protocol;    // Envelope de comandos versionado (CommandRequest/CommandResponse)
