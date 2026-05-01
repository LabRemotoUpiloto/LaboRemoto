//! cmd/ssh — Comandos de terminal SSH y GPIO Raspberry Pi
//!
//! Este módulo contiene:
//! - terminal: Conexión SSH, terminal interactiva, stdin/stdout
//! - gpio: Control de pines GPIO de Raspberry Pi

pub mod terminal;
pub mod gpio;

pub use terminal::{
  ssh_connect,
  ssh_ui_ready,
  ssh_stdin,
  ssh_resize,
  ssh_disconnect,
  ssh_session_info,
  ssh_connect_stored,
  SessionInfo,
};

pub use gpio::{
  rpi_pins_status,
  rpi_pin_set_mode,
  rpi_pin_set_pull,
  rpi_pin_write_level,
  rpi_pin_read,
  RpiGpioLine,
};