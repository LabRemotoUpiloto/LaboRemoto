use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::net::TcpStream;
use std::sync::atomic::{AtomicBool, Ordering};
use ssh2::{Session as Ssh2Session, Sftp as Ssh2Sftp};

use crate::ssh_core::client::Session;

// Envoltorio de sesión: terminal (russh) + credenciales para SFTP (ssh2)
pub struct SessionExt {
  pub term: Session,
  pub host: String,
  pub port: u16,
  pub user: String,
  pub password: String,
  // Sesión ssh2 en caché para SFTP (compartida y protegida por Mutex)
  pub sftp_cached: Option<Arc<Mutex<CachedSsh2>>>,
  // Buffer efímero de arranque para la salida del terminal
  pub out_buffer: Arc<Mutex<Option<String>>>,
  // Flag: ¿UI lista para recibir streaming?
  pub ui_ready: Arc<AtomicBool>,
  // Directorio de trabajo lógico rastreado a partir de comandos 'cd'. Si None, se asumirá el home remoto cuando se necesite.
  pub current_dir: Option<String>,
  // Sesión gráfica VNC activa (None si no hay escritorio remoto iniciado)
  pub vnc_session: Option<VncSessionState>,
  // Señal de parada para el hilo de stream (port-forward genérico)
  pub stream_stop_flag: Option<Arc<AtomicBool>>,
  // Puerto local del tunnel SSH para el stream de cámaras
  pub stream_local_port: Option<u16>,
  // Buffer rodante de las últimas 300 salidas del terminal (para contexto AI)
  pub terminal_buf: Arc<Mutex<VecDeque<String>>>,
}

// Conexión ssh2 reutilizable por sesión
pub struct CachedSsh2 {
  pub tcp: TcpStream,
  pub sess: Ssh2Session,
  // Canal SFTP cacheado de forma perezosa (Perf: abrir el subsistema SFTP
  // cuesta un round-trip de red; sin este cache, cada operación --list,
  // mkdir, rename, stat, etc.-- pagaba ese costo de nuevo aunque la sesión
  // SSH ya estuviera abierta. Se abre una vez y se reutiliza mientras la
  // conexión siga viva.
  sftp: Option<Ssh2Sftp>,
}

impl CachedSsh2 {
  pub fn new(tcp: TcpStream, sess: Ssh2Session) -> Self {
    Self { tcp, sess, sftp: None }
  }

  /// Devuelve el canal SFTP cacheado, abriéndolo la primera vez que se pide.
  pub fn get_or_open_sftp(&mut self) -> anyhow::Result<&Ssh2Sftp> {
    if self.sftp.is_none() {
      self.sftp = Some(crate::ssh_core::ssh2_sftp::open_sftp(&self.sess)?);
    }
    Ok(self.sftp.as_ref().unwrap())
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Estado de una sesión gráfica VNC activa
// ─────────────────────────────────────────────────────────────────────────────

/// Mantiene el estado del escritorio gráfico remoto asociado a una sesión SSH.
/// Al hacer drop (por ssh_disconnect o vnc_stop) limpia automáticamente el
/// bridge local y los procesos remotos.
pub struct VncSessionState {
    pub display_num: u32,
    pub vnc_port_remote: u16,
    pub ws_port_local: u16,
    /// Señal de parada para el hilo bridge WS↔SSH
    pub stop_flag: Arc<AtomicBool>,
    /// Handle del hilo bridge (Some mientras corre, None tras detach)
    pub bridge_thread: Option<std::thread::JoinHandle<()>>,
    /// Proceso `ssh -L` que mantiene el port-forward local → Xvnc
    pub ssh_fwd_child: Option<std::process::Child>,
    // Credenciales guardadas para el cleanup remoto al descartar el estado
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    /// true = display virtual (Xvnc + openbox, típico Pi headless)
    /// false = display real preexistente (Jetson, Ubuntu desktop) — usa x11vnc
    pub is_virtual: bool,
    /// Directorio home del usuario remoto (e.g. /home/pi, /home/labiot)
    pub home_dir: String,
}

impl Drop for VncSessionState {
    fn drop(&mut self) {
        // 1. Señalar al hilo bridge que se detenga
        self.stop_flag.store(true, Ordering::Relaxed);

        // 2. Matar el tunnel ssh -L
        if let Some(mut child) = self.ssh_fwd_child.take() {
            let _ = child.kill();
        }

        if self.host.is_empty() { return; } // ya limpiado por vnc_stop

        let (host, port, user, password) = (
            self.host.clone(),
            self.port,
            self.user.clone(),
            self.password.clone(),
        );
        let (display, vnc_port, is_virtual) = (self.display_num, self.vnc_port_remote, self.is_virtual);
        let home_dir = self.home_dir.clone();

        // 3. Guardar tarea pendiente en disco por si el proceso muere antes de limpiar
        if is_virtual {
            let pending = format!(
                "{{\"host\":\"{host}\",\"port\":{port},\"user\":\"{user}\",\"password\":\"{password}\",\"display\":{display},\"vnc_port\":{vnc_port}}}"
            );
            let path = std::env::temp_dir().join(format!("vnc_pending_cleanup_{display}.json"));
            let _ = std::fs::write(&path, &pending);
        }

        // 4. Intentar limpiar en background (puede no completarse si el proceso muere)
        std::thread::spawn(move || {
            if let Ok((_tcp, sess)) =
                crate::ssh_core::ssh2_sftp::connect_password(&host, port, &user, &password)
            {
                if is_virtual {
                    let _ = crate::cmd::vnc::server::stop_vnc_server(&sess, display, &home_dir);
                } else {
                    let _ = crate::cmd::vnc::utils::stop_vnc_server_real(&sess, vnc_port);
                }
                // Limpiar archivo pendiente si se completó
                let path = std::env::temp_dir().join(format!("vnc_pending_cleanup_{display}.json"));
                let _ = std::fs::remove_file(&path);
            }
        });
    }
}

/// Lee y ejecuta cualquier cleanup VNC pendiente del arranque anterior.
/// Llamar al inicio de vnc_start para evitar que displays huérfanos acumulen.
pub fn run_pending_vnc_cleanups(sess: &Ssh2Session) {
    let tmp = std::env::temp_dir();
    let entries = match std::fs::read_dir(&tmp) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if !name.starts_with("vnc_pending_cleanup_") || !name.ends_with(".json") { continue; }
        let path = entry.path();
        // El display se obtiene del nombre del archivo — ya no hace falta
        // leer el JSON (solo guardaba vnc_port, que dejó de ser necesario
        // para matar el proceso ahora que es un único Xvnc por display).
        let display = name
            .strip_prefix("vnc_pending_cleanup_").unwrap_or("")
            .strip_suffix(".json").unwrap_or("")
            .parse::<u32>().unwrap_or(0);
        if display < 20 { let _ = std::fs::remove_file(&path); continue; }
        let cmd = format!(
            "pkill -9 -f 'Xvnc :{display} ' 2>/dev/null; \
             pkill -9 -f 'Xtigervnc :{display} ' 2>/dev/null; \
             rm -f /tmp/.X{display}-lock /tmp/.X11-unix/X{display} 2>/dev/null; true"
        );
        let _ = crate::ssh_core::exec::ssh_exec_session(sess, &cmd);
        let _ = std::fs::remove_file(&path);
    }
}