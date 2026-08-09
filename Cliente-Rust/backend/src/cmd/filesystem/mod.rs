//! cmd/filesystem — Operaciones de filesystem local
//!
//! Este módulo contiene:
//! - local.rs: Operaciones de archivos locales
//! - pdf_reports.rs: Generación de reportes PDF

pub mod local;
pub mod pdf_reports;

pub use local::{local_home_dir, local_list_dir, local_list_drives, local_open_path, local_reveal_in_explorer, local_temp_dir, save_text_file, chat_history_load, chat_history_save, chat_history_delete_entry};
pub use pdf_reports::save_pdf_base64;
