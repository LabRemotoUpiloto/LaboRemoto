// src/lib.rs

// Módulos públicos expuestos al resto de la app.
pub mod error;   // Tipos de error compartidos
pub mod ssh;     // Cliente SSH basado en russh (para terminal) + ssh2_sftp
pub mod cmd;     // Comandos invocables desde el frontend (Tauri commands)
pub mod storage; // Utilidades de almacenamiento cifrado de hosts

// Para móviles, Tauri usa esta anotación; en desktop no afecta.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Construye la aplicación Tauri y registra los comandos accesibles desde JS (invoke()).
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      // SSH
      cmd::ssh_connect,
      cmd::ssh_stdin,
      cmd::ssh_resize,
      cmd::ssh_disconnect,
  // SFTP (stubs)
  cmd::sftp_open,
  cmd::sftp_list,
  cmd::sftp_mkdir,
  cmd::sftp_rename,
  cmd::sftp_remove,
  cmd::sftp_download_start,
  cmd::sftp_upload_start,
  cmd::sftp_cancel,
  cmd::sftp_upload_dir_start,
  cmd::sftp_download_dir_start,
  // Local FS (pane izquierdo)
  cmd::local_home_dir,
  cmd::local_list_dir,
  cmd::local_list_drives,
      // Chat IA
      cmd::ai_chat,
      // Storage (hosts)
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