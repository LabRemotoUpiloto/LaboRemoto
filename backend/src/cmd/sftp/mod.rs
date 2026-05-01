//! cmd/sftp — Operaciones SFTP y transferencias de archivos
//!
//! Este módulo contiene:
//! - operations: Comandos básicos (open, home, list, mkdir, remove)
//! - transfers: Transferencias de archivos (download/upload, directorios)

pub mod operations;
pub mod transfers;

pub use operations::{
  sftp_open,
  sftp_home,
  sftp_list,
  sftp_mkdir,
  sftp_remove,
  sftp_cancel,
};

pub use transfers::{
  sftp_download_start,
  sftp_upload_start,
  sftp_upload_dir_start,
  sftp_download_dir_start,
};