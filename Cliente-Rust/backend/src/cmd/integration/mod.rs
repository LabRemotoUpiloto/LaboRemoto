//! cmd/integration — Integraciones con servicios externos
//!
//! Este módulo contiene:
//! - moodle.rs: Cliente de API de Moodle

pub mod moodle;

pub use moodle::{moodle_sync_assignment, moodle_prepare_grade, moodle_submit_grade_direct};
