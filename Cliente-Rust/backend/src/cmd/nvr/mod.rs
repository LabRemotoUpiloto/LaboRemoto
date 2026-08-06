//! cmd/nvr — Consumo del NVR Shinobi (reemplazo de cmd::streaming)
//!
//! Este módulo contiene:
//! - shinobi.rs: Cliente de la API HTTP de Shinobi
//! - ssh_tunnel.rs: Túnel SSH dedicado (transporte; el NVR no tiene el
//!   puerto abierto al público en el despliegue piloto — ver su doc)

pub mod shinobi;
pub mod ssh_tunnel;

pub use shinobi::{nvr_list_cameras, nvr_disconnect};
