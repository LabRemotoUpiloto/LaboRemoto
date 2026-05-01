// src/lib.rs

// Módulos públicos expuestos al resto de la app.
pub mod error;   // Tipos de error compartidos
pub mod ssh;     // Cliente SSH basado en russh (para terminal) + ssh2_sftp
pub mod cmd;     // Comandos invocables desde el frontend (Tauri commands)
pub mod storage; // Utilidades de almacenamiento cifrado de hosts
pub mod state;   // Memoria efímera por sesión (AppState)
pub mod security; // Validaciones de seguridad y backups

// Para móviles, Tauri usa esta anotación; en desktop no afecta.
fn load_dotenv() {
  // 1. Intento estándar: caminar desde el CWD hacia arriba
  if dotenvy::dotenv().is_ok() { /* ok */ }
  // 2. Fallback: usar la ruta del manifest (conocida en tiempo de compilación)
  //    y subir hasta encontrar un .env. Garantiza encontrar apps/.env en dev y release.
  let mut dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
  loop {
    let _ = dotenvy::from_path(dir.join(".env"));
    // También cargar .env.practicas si existe
    let _ = dotenvy::from_path(dir.join(".env.practicas"));
    if dir.join(".env").exists() { break; }
    match dir.parent() {
      Some(parent) => dir = parent,
      None => break,
    }
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Cargar variables de entorno desde .env
  load_dotenv();
  
  // Construir la aplicación Tauri y registrar los comandos accesibles desde JS (invoke()).
  tauri::Builder::default()
    .manage(crate::state::AppState::new())
    .manage(crate::state::AiCancelRegistry::new())
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
      cmd::local::save_text_file,
      cmd::local::chat_history_load,
      cmd::local::chat_history_save,
      cmd::local::chat_history_delete_entry,
      // Chat IA
      cmd::ai::ai_chat,
      cmd::ai::cancel_ai_chat,
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
      cmd::stream::stream_get_host,
      cmd::stream::whep_exchange,
      // Agente AI con tools (tool_use loop + contexto terminal)
      cmd::tools::get_terminal_context,
      cmd::tools::agent_chat,
      cmd::tools::plan_chat,
      // MCP (Model Context Protocol) – servidores externos de tools
      cmd::mcp_client::mcp_register_server,
      cmd::mcp_client::mcp_list_servers,
      cmd::mcp_client::mcp_remove_server,
      cmd::mcp_client::mcp_refresh_tools,
      // Prácticas de laboratorio remoto
      cmd::practicas::practicas_list_categories,
      cmd::practicas::practicas_get_config,
      cmd::practicas::practicas_run_setup,
      // Integración con Moodle
      cmd::moodle::moodle_sync_assignment,
      cmd::moodle::moodle_prepare_grade,
      cmd::moodle::moodle_submit_grade_direct,
      // Validador de prácticas
      cmd::practice_validator::validate_practice_progress,
      cmd::practice_validator::calculate_practice_grade,
      cmd::vnc::vnc_cleanup_all,
      // Arduino domótica (bridge HTTP en la Pi)
      cmd::arduino::arduino_bridge_status,
      cmd::arduino::arduino_send_cmd,
      cmd::arduino::arduino_read_buffer,
    ])
    .on_window_event(|_win, event| {
      if matches!(event, tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed) {
        cleanup_all_vnc_sessions();
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

fn cleanup_all_vnc_sessions() {
  use crate::cmd::state::SESSIONS;
  let sessions_info: Vec<(u32, u16, String, u16, String, String, bool)> = {
    let mut map = match SESSIONS.lock() {
      Ok(m) => m,
      Err(_) => return,
    };
    map.values_mut()
      .filter_map(|s| s.vnc_session.as_mut().map(|v| {
        let info = (v.display_num, v.vnc_port_remote, v.host.clone(), v.port, v.user.clone(), v.password.clone(), v.is_virtual);
        v.stop_flag.store(true, std::sync::atomic::Ordering::Relaxed);
        if let Some(mut child) = v.ssh_fwd_child.take() { let _ = child.kill(); }
        v.host = "".to_string();
        info
      }))
      .collect()
  };

  // Matar procesos remotos en un hilo OS (no bloquear el hilo principal)
  if !sessions_info.is_empty() {
    std::thread::spawn(move || {
      for (display, vnc_port, host, port, user, password, is_virtual) in sessions_info {
        if host.is_empty() { continue; }
        if let Ok((_tcp, sess)) = crate::ssh::ssh2_sftp::connect_password(&host, port, &user, &password) {
          if is_virtual {
            // Matar con SIGKILL directo — no hay tiempo para stop_vnc_server completo
            let _ = crate::cmd::vnc::run_remote_pub(
              &sess,
              &format!("pkill -9 -f 'Xvfb :{display} ' 2>/dev/null; pkill -9 -f 'x11vnc.*rfbport {vnc_port}' 2>/dev/null; rm -f /tmp/.X{display}-lock /tmp/.X11-unix/X{display} 2>/dev/null; true")
            );
          }
        }
      }
    });
  }
}
