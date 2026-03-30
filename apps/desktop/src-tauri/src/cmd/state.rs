use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::net::TcpStream;
use std::sync::atomic::{AtomicBool, Ordering};
// Ordering is used in ssh.rs; not needed here

use serde::{Deserialize, Serialize};
use ts_rs::TS;

// Información de una cámara remota (devuelta por multi_cam_server.py)
#[derive(Serialize, Deserialize, Clone, TS)]
#[ts(export)]
pub struct CameraInfo {
    pub id: String,
    pub name: String,
    pub ip: String,
    pub status: String,  // "active" | "connecting" | "offline"
}

use crate::ssh::client::Session;
use ssh2::Session as Ssh2Session;

// Sesiones SSH activas en memoria, indexadas por un ID (UUID)
pub static SESSIONS: Lazy<Mutex<HashMap<String, SessionExt>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

// Registro de cancelación de transferencias
pub static TRANSFERS: Lazy<Mutex<HashMap<String, Arc<AtomicBool>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

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
    /// Proceso `ssh -L` que mantiene el port-forward local → x11vnc
    pub ssh_fwd_child: Option<std::process::Child>,
    // Credenciales guardadas para el cleanup remoto al descartar el estado
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    /// true = display virtual (Xvfb + openbox, típico Pi headless)
    /// false = display real preexistente (Jetson, Ubuntu desktop)
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

        // 3. Matar procesos remotos en background (sin bloquear al caller)
        let (host, port, user, password) = (
            self.host.clone(),
            self.port,
            self.user.clone(),
            self.password.clone(),
        );
        let (display, vnc_port, is_virtual) = (self.display_num, self.vnc_port_remote, self.is_virtual);
        let home_dir = self.home_dir.clone();

        std::thread::spawn(move || {
            if let Ok((_tcp, sess)) =
                crate::ssh::ssh2_sftp::connect_password(&host, port, &user, &password)
            {
                if is_virtual {
                    let _ = crate::cmd::vnc::stop_vnc_server(&sess, display, vnc_port, &home_dir);
                } else {
                    let _ = crate::cmd::vnc::stop_vnc_server_real(&sess, vnc_port);
                }
            }
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Envoltorio de sesión SSH activa
// ─────────────────────────────────────────────────────────────────────────────

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
}

// Conexión ssh2 reutilizable por sesión
pub struct CachedSsh2 {
  pub tcp: TcpStream,
  pub sess: Ssh2Session,
}

// ====== SFTP (tipos de datos) ======
#[derive(Serialize, Deserialize, Clone, TS)]
#[ts(export)]
pub struct SftpEntry {
  pub name: String,
  pub path: String,
  pub kind: String, // "file" | "dir" | "sym"
  #[ts(optional)]
  pub size: Option<u64>,
  #[ts(optional)]
  pub perms: Option<String>,
  #[ts(optional)]
  pub mtime: Option<u64>,
}

// ====== Local FS (panel izquierdo)
#[derive(Serialize, Deserialize, Clone, TS)]
#[ts(export)]
pub struct LocalEntry {
  pub name: String,
  pub path: String,
  pub kind: String,
  #[ts(optional)]
  pub size: Option<u64>,
  #[ts(optional)]
  pub mtime: Option<i64>,
}
