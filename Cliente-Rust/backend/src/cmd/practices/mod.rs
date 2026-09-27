//! cmd/practices — Sistema de prácticas de laboratorio
//!
//! Este módulo contiene:
//! - practicas.rs: Configuración y setup de prácticas (Eve3, legacy — variables PRACTICE_EVE3_* del .env único)
//! - practice_validator.rs: Validación automática basada en historial de comandos
//! - linux_api.rs: Cliente hacia el servicio de prácticas de Linux en la Pi
//! - lab_connection.rs: Binding entre el catálogo externo y un entorno real

pub mod practicas;
pub mod practice_validator;
pub mod lab_connection;
pub mod linux_api;
pub mod linux_tunnel;

pub use practicas::{practicas_list_categories, practicas_get_config, practicas_run_setup};
pub use practice_validator::{validate_practice_progress, calculate_practice_grade};
pub use lab_connection::{lab_practices_list_runnable, lab_practices_get_runnable, lab_practices_run_setup};
pub use linux_api::{
    practicas_linux_list, practicas_linux_get_module, practicas_linux_validate,
    practicas_linux_connection_target, practicas_linux_get_media,
};
