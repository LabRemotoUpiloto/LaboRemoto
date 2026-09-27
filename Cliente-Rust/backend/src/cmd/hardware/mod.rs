//! cmd/hardware — Control de hardware remoto
//!
//! Este módulo contiene:
//! - arduino.rs: Bridge HTTP para domótica Arduino
//! - ev3.rs: Bridge HTTP para el robot EV3 (práctica Eve3 vía API)

pub mod arduino;
pub mod ev3;

pub use arduino::{arduino_bridge_status, arduino_send_cmd, arduino_read_buffer};
pub use ev3::{ev3_status, ev3_set_motor, ev3_stop_all};
