#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // El nombre del crate (package) en Cargo.toml es "app"
  app::run();
}
