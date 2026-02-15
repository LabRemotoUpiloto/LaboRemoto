use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::net::TcpStream;
use std::sync::atomic::AtomicBool;
// Ordering is used in ssh.rs; not needed here

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::ssh::client::Session;
use ssh2::Session as Ssh2Session;

// Sesiones SSH activas en memoria, indexadas por un ID (UUID)
pub static SESSIONS: Lazy<Mutex<HashMap<String, SessionExt>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

// Registro de cancelación de transferencias
pub static TRANSFERS: Lazy<Mutex<HashMap<String, Arc<AtomicBool>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

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
