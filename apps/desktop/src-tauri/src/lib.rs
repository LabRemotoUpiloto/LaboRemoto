// src/lib.rs

pub mod error;
pub mod ssh;
pub mod cmd;
pub mod storage;

// Para móviles, Tauri usa esta anotación; en desktop no afecta.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      cmd::ssh_connect,
      cmd::ssh_stdin,
      cmd::ssh_resize,
      cmd::ssh_disconnect,
  cmd::ai_chat,
  cmd::save_host_encrypted,
  cmd::load_host_encrypted,
  cmd::save_host_master,
  cmd::load_host_master,
  cmd::list_hosts_entries,
  cmd::ssh_connect_stored,
  cmd::list_hosts_files,
  cmd::delete_host_file,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}