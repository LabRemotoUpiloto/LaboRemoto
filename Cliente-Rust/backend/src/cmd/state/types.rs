use serde::{Deserialize, Serialize};
use ts_rs::TS;

// Información de una cámara remota (devuelta por multi_cam_server.py)
#[derive(Serialize, Deserialize, Clone, TS)]
#[ts(export)]
pub struct CameraInfo {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub ip: String,
    #[serde(default = "default_status")]
    pub status: String,  // "active" | "connecting" | "offline"
}

fn default_status() -> String { "active".to_string() }

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