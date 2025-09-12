use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::sync::atomic::AtomicBool;

use serde::{Deserialize, Serialize};

use crate::ssh::client::Session;

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
}

// ====== SFTP (tipos de datos) ======
#[derive(Serialize, Deserialize, Clone)]
pub struct SftpEntry {
  pub name: String,
  pub path: String,
  pub kind: String, // "file" | "dir" | "sym"
  pub size: Option<u64>,
  pub perms: Option<String>,
  pub mtime: Option<u64>,
}

// ====== Local FS (panel izquierdo)
#[derive(Serialize, Deserialize, Clone)]
pub struct LocalEntry {
  pub name: String,
  pub path: String,
  pub kind: String,
  pub size: Option<u64>,
  pub mtime: Option<i64>,
}
