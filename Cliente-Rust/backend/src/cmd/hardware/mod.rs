//! cmd/hardware — Control de hardware remoto
//!
//! Este módulo contiene:
//! - arduino.rs: Bridge HTTP para domótica Arduino

pub mod arduino;

pub use arduino::{arduino_bridge_status, arduino_send_cmd, arduino_read_buffer};
