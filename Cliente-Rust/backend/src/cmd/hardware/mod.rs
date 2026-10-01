//! cmd/hardware — Control de hardware remoto
//!
//! Este módulo contiene:
//! - arduino.rs: Bridge HTTP para domótica Arduino
//! - ev3.rs: Bridge HTTP para el robot EV3 (práctica Eve3 vía API)
//! - ev3_console.rs: consola de Python del panel EV3 (subir y correr un programa en el robot)

pub mod arduino;
pub mod ev3;
pub mod ev3_console;

pub use arduino::{arduino_bridge_status, arduino_send_cmd, arduino_read_buffer};
pub use ev3::{ev3_status, ev3_set_motor, ev3_stop_all};
pub use ev3_console::{ev3_run_start, ev3_run_output, ev3_run_stop};
