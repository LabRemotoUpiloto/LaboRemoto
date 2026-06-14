#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Punto de entrada de la app Tauri en Windows/macOS/Linux.
// Nota: en release en Windows ocultamos la consola con el atributo anterior.
fn main() {
  // El nombre del crate (package) en Cargo.toml es "app"; aquí invocamos su inicialización.
  app::run();
}
