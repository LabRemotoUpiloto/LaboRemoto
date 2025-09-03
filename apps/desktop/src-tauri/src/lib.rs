// src/lib.rs

pub mod error;
pub mod ssh;
pub mod cmd;

// Para móviles, Tauri usa esta anotación; en desktop no afecta.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      cmd::ssh_connect,
      cmd::ssh_stdin,
      cmd::ssh_resize,
      cmd::ssh_disconnect,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
