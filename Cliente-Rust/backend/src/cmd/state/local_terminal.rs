use std::io::Write;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use portable_pty::{Child, MasterPty};

/// Sesión de una terminal local (PTY nativa): una por panel, independiente
/// de cualquier otra (el multiplexado/splits es un concern de UI, no de
/// backend — ver `cmd/terminal_local`).
pub struct LocalTermSession {
  pub master: Box<dyn MasterPty + Send>,
  // `Write::write_all` pide `&mut self`; el writer debe ser alcanzable desde
  // llamadas repetidas a `local_term_stdin` sin moverlo fuera del mapa.
  pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
  pub child: Box<dyn Child + Send + Sync>,
  // Flag: ¿UI lista para recibir streaming? (mismo patrón que SessionExt)
  pub ui_ready: Arc<AtomicBool>,
  // Buffer efímero de arranque para la salida emitida antes de que la UI esté lista
  pub out_buffer: Arc<Mutex<Option<String>>>,
  // Shell resuelta para este panel (ej. "pwsh", "powershell.exe", "/bin/bash") — debugging/UI
  pub shell_label: String,
}
