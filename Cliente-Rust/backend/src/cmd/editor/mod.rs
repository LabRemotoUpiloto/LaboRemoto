//! cmd/editor — Edición de archivos remotos con AI
//!
//! Este módulo contiene:
//! - file_edit.rs: Análisis, planificación y edición de archivos

pub mod file_edit;

pub use file_edit::{analyze_file, analyze_any_file, plan_file_edit, apply_file_edit, list_file_backups, revert_file, ai_remote_edit_file};
