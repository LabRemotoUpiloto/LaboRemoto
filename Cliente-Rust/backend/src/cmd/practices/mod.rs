//! cmd/practices — Sistema de prácticas de laboratorio
//!
//! Este módulo contiene:
//! - practicas.rs: Configuración y setup de prácticas
//! - practice_validator.rs: Validación automática de prácticas

pub mod practicas;
pub mod practice_validator;
pub mod lab_connection;

pub use practicas::{practicas_list_categories, practicas_get_config, practicas_run_setup};
pub use practice_validator::{validate_practice_progress, calculate_practice_grade};
pub use lab_connection::{lab_practices_list_runnable, lab_practices_get_runnable, lab_practices_run_setup};
