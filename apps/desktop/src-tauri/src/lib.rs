// src/lib.rs

// Módulos públicos expuestos al resto de la app.
pub mod error;   // Tipos de error compartidos
pub mod ssh;     // Cliente SSH basado en russh (para terminal) + ssh2_sftp
pub mod cmd;     // Comandos invocables desde el frontend (Tauri commands)
pub mod storage; // Utilidades de almacenamiento cifrado de hosts
pub mod state;   // Memoria efímera por sesión (AppState)
pub mod security; // Validaciones de seguridad y backups

// Para móviles, Tauri usa esta anotación; en desktop no afecta.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Cargar variables de entorno desde .env
  dotenvy::dotenv().ok();
  
  // Construir la aplicación Tauri y registrar los comandos accesibles desde JS (invoke()).
  tauri::Builder::default()
    .manage(crate::state::AppState::new())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .invoke_handler(tauri::generate_handler![
      // SSH
      cmd::ssh::ssh_connect,
      cmd::ssh::ssh_stdin,
      cmd::ssh::ssh_resize,
      cmd::ssh::ssh_disconnect,
  cmd::ssh::ssh_ui_ready,
    cmd::ssh::ssh_session_info,
    cmd::ssh::rpi_pins_status,
    cmd::ssh::rpi_pin_set_mode,
  cmd::ssh::rpi_pin_set_pull,
  cmd::ssh::rpi_pin_write_level,
  cmd::ssh::rpi_pin_read,
      // SFTP (stubs)
      cmd::sftp::sftp_open,
  cmd::sftp::sftp_home,
      cmd::sftp::sftp_list,
      cmd::sftp::sftp_mkdir,
      cmd::sftp::sftp_remove,
      cmd::sftp::sftp_download_start,
      cmd::sftp::sftp_upload_start,
      cmd::sftp::sftp_cancel,
      cmd::sftp::sftp_upload_dir_start,
      cmd::sftp::sftp_download_dir_start,
      // Local FS (pane izquierdo)
      cmd::local::local_home_dir,
      cmd::local::local_list_dir,
      cmd::local::local_list_drives,
      // Chat IA
      cmd::ai::ai_chat,
  cmd::agent::agent_plan,
    cmd::ai_utils::ai_env_status,
  cmd::ai_utils::ai_test_key,
    // File analysis & edit
  cmd::file_edit::analyze_file,
  cmd::file_edit::analyze_any_file,
    cmd::file_edit::plan_file_edit,
    cmd::file_edit::apply_file_edit,
    cmd::file_edit::list_file_backups,
    cmd::file_edit::revert_file,
  cmd::file_edit::ai_remote_edit_file,
      // Storage (hosts)
      cmd::hosts::save_host_encrypted,
      cmd::hosts::load_host_encrypted,
      cmd::hosts::save_host_master,
      cmd::hosts::load_host_master,
      cmd::hosts::list_hosts_entries,
      cmd::ssh::ssh_connect_stored,
      cmd::hosts::list_hosts_files,
      cmd::hosts::delete_host_file,
      // Session ephemeral memory
      crate::state::mem_put,
      crate::state::mem_get,
      crate::state::mem_clear,
      crate::state::mem_push_terminal_result,
      // Session logs (captura de buffers SSH)
      cmd::logs::save_session_log,
      cmd::logs::save_session_log_fragment,
      cmd::logs::list_session_logs,
      cmd::logs::get_session_log_content,
      cmd::logs::get_session_log,
      cmd::logs::delete_session_log,
      cmd::logs::cleanup_old_session_logs,
      // PDF reports locales
      cmd::pdf_reports::save_pdf_base64,
      // Escritorio gráfico remoto (VNC sobre SSH)
      cmd::vnc::vnc_start,
      cmd::vnc::vnc_stop,
      cmd::vnc::vnc_status,
      // Port-forwarding genérico (streaming)
      cmd::stream::stream_start,
      cmd::stream::stream_stop,
      cmd::stream::stream_list_cameras,
      // Agente AI con tools (tool_use loop + contexto terminal)
      cmd::tools::get_terminal_context,
      cmd::tools::agent_chat,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
