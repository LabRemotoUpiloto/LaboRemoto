//! cmd/nvr — Consumo del NVR Shinobi (reemplazo de cmd::streaming)
//!
//! Este módulo contiene:
//! - shinobi.rs: Cliente HTTP contra el broker desplegado en la Pi
//!   (infra/nvr-broker) — valida sesión Keycloak, nunca expone la
//!   SHINOBI_API_KEY real ni requiere una clave SSH en el cliente.

pub mod shinobi;

pub use shinobi::{nvr_list_cameras, nvr_disconnect, nvr_ptz_control};
