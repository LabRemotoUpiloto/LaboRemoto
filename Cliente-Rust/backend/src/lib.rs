// src/lib.rs

// Módulos públicos expuestos al resto de la app.
pub mod error;      // Tipos de error compartidos
pub mod ssh_core;   // Cliente SSH basado en russh (para terminal) + ssh2_sftp
pub mod cmd;        // Comandos invocables desde el frontend (Tauri commands)
pub mod storage;    // Utilidades de almacenamiento cifrado de hosts
pub mod state_core; // Memoria efímera por sesión (AppState) + AuthState JWT
pub mod session_manager; // Store único de sesión + auth (trait SessionManager)
pub mod security;   // Validaciones de seguridad y backups
pub mod api;        // REST API
pub mod auth;       // Autenticación OAuth 2.1 con Keycloak (PKCE + JWT)
pub mod ipc;        // Contrato de mensajería interna Message+ACK+backpressure (REFACTOR #5: Fase A completa + Fase B piloto auth wireado)

use tauri::Manager;

// Para móviles, Tauri usa esta anotación; en desktop no afecta.
fn load_dotenv() {
  // 1. Intento estándar: caminar desde el CWD hacia arriba
  dotenvy::dotenv().ok();
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

  // Arrancar servidor REST API si está habilitado
  let api_config = crate::api::config::ApiConfig::from_env();
  if api_config.enabled {
    if api_config.token.is_empty() {
      eprintln!("[API] ADVERTENCIA: REST_API_TOKEN no configurado. La API se iniciará sin autenticación.");
    }
    let cfg = api_config.clone();
    tauri::async_runtime::spawn(async move {
      crate::api::server::start(cfg).await;
    });
    println!("[API] REST API habilitada en {}:{}", api_config.host, api_config.port);
  } else {
    println!("[API] REST API deshabilitada (REST_API_ENABLED=false o ausente)");
  }
  
  // Construir la aplicación Tauri y registrar los comandos accesibles desde JS (invoke()).
  tauri::Builder::default()
    // Store único de sesión (SessionMem) + autenticación (JWT OAuth 2.1).
    // Ver `session_manager` para el trait y `InMemorySessionManager` para el backend.
    .manage(std::sync::Arc::new(crate::session_manager::InMemorySessionManager::new())
      as std::sync::Arc<dyn crate::session_manager::SessionManager>)
    .manage(crate::state_core::AiCancelRegistry::new())
    // IpcHub (REFACTOR #5 Fase B): cola con backpressure + registro de ACK
    // compartida por los emisores wireados a `ipc`. El dispatcher que la
    // consume se arranca en `.setup()` porque necesita un `AppHandle`
    // (no disponible aún en este punto de construcción del builder).
    .manage(crate::ipc::IpcHub::new())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .setup(|app| {
      let hub = app.state::<crate::ipc::IpcHub>().inner().clone();
      hub.spawn_dispatcher(app.handle().clone());
      // Intenta retomar una sesión persistida de un arranque anterior (si hay
      // un refresh_token guardado y aún vigente) sin bloquear el arranque de
      // la ventana. Ver `auth::token_store` y `auth::commands::try_restore_session`.
      tauri::async_runtime::spawn(crate::auth::commands::try_restore_session(app.handle().clone()));
      // Hook nativo de teclado para Alt+Tab en el escritorio remoto (VNC).
      // Se queda instalado (inerte) toda la vida de la app — ver alttab_hook.rs.
      crate::cmd::vnc::alttab_hook_init(app.handle().clone());
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      // SSH
      cmd::ssh::terminal::ssh_connect,
      cmd::ssh::terminal::pi4_ssh_connect,
      cmd::ssh::terminal::ssh_stdin,
      cmd::ssh::terminal::ssh_resize,
      cmd::ssh::terminal::ssh_disconnect,
      cmd::ssh::terminal::ssh_ui_ready,
      cmd::ssh::terminal::ssh_session_info,
      cmd::ssh::terminal::ssh_connect_stored,
      cmd::ssh::gpio::rpi_pins_status,
      cmd::ssh::gpio::rpi_pin_set_mode,
      cmd::ssh::gpio::rpi_pin_set_pull,
      cmd::ssh::gpio::rpi_pin_write_level,
      cmd::ssh::gpio::rpi_pin_read,
      cmd::ssh::gpio::rpi_pins_monitor_start,
      cmd::ssh::gpio::rpi_pins_monitor_stop,
      // Terminal local (PTY embebido)
      cmd::terminal_local::local_term_spawn,
      cmd::terminal_local::local_term_ui_ready,
      cmd::terminal_local::local_term_stdin,
      cmd::terminal_local::local_term_resize,
      cmd::terminal_local::local_term_close,
      cmd::terminal_local::local_term_save_paste_image,
      cmd::terminal_local::local_term_read_clipboard,
      cmd::terminal_local::local_term_write_clipboard,
      // SFTP
      cmd::sftp::operations::sftp_open,
      cmd::sftp::operations::sftp_home,
      cmd::sftp::operations::sftp_list,
      cmd::sftp::operations::sftp_mkdir,
      cmd::sftp::operations::sftp_rename,
      cmd::sftp::operations::sftp_remove,
      cmd::sftp::transfers::sftp_download_start,
      cmd::sftp::transfers::sftp_upload_start,
      cmd::sftp::operations::sftp_cancel,
      cmd::sftp::transfers::sftp_upload_dir_start,
      cmd::sftp::transfers::sftp_download_dir_start,
      cmd::sftp::operations::sftp_read_text,
      // Local FS (pane izquierdo)
      cmd::filesystem::local::local_home_dir,
      cmd::filesystem::local::local_list_dir,
      cmd::filesystem::local::local_list_drives,
      cmd::filesystem::local::local_open_path,
      cmd::filesystem::local::local_reveal_in_explorer,
      cmd::filesystem::local::local_temp_dir,
      cmd::filesystem::local::local_mkdir,
      cmd::filesystem::local::local_rename,
      cmd::filesystem::local::local_delete,
      cmd::filesystem::local::save_text_file,
      cmd::filesystem::local::chat_history_load,
      cmd::filesystem::local::chat_history_save,
      cmd::filesystem::local::chat_history_delete_entry,
      // Chat IA
      cmd::ai::ai::ai_chat,
      cmd::ai::ai::cancel_ai_chat,
      cmd::ai::agent::agent_plan,
      cmd::ai::ai_utils::ai_env_status,
      cmd::ai::ai_utils::ai_test_key,
      // File analysis & edit
      cmd::editor::file_edit::analyze_file,
      cmd::editor::file_edit::analyze_any_file,
      cmd::editor::file_edit::plan_file_edit,
      cmd::editor::file_edit::apply_file_edit,
      cmd::editor::file_edit::list_file_backups,
      cmd::editor::file_edit::revert_file,
      cmd::editor::file_edit::ai_remote_edit_file,
      // Storage (hosts)
      cmd::state::hosts::save_host_encrypted,
      cmd::state::hosts::load_host_encrypted,
      cmd::state::hosts::save_host_master,
      cmd::state::hosts::load_host_master,
      cmd::state::hosts::list_hosts_entries,
      cmd::state::hosts::list_hosts_files,
      cmd::state::hosts::delete_host_file,
      // Session ephemeral memory
      crate::state_core::mem_put,
      crate::state_core::mem_get,
      crate::state_core::mem_clear,
      crate::state_core::mem_push_terminal_result,
      // Session logs (captura de buffers SSH)
      cmd::logs::logs::save_session_log,
      cmd::logs::logs::save_session_log_fragment,
      cmd::logs::logs::list_session_logs,
      cmd::logs::logs::get_session_log_content,
      cmd::logs::logs::get_session_log,
      cmd::logs::logs::delete_session_log,
      cmd::logs::logs::cleanup_old_session_logs,
      cmd::logs::logs::extract_session_commands,
      // PDF reports locales
      cmd::filesystem::pdf_reports::save_pdf_base64,
      // Escritorio gráfico remoto (VNC sobre SSH)
      cmd::vnc::vnc_start,
      cmd::vnc::vnc_stop,
      cmd::vnc::vnc_status,
      cmd::vnc::vnc_cleanup_all,
      cmd::vnc::vnc_alttab_capture,
      // Port-forwarding genérico (streaming) — legacy, ver cmd::nvr abajo
      cmd::streaming::stream::stream_start,
      cmd::streaming::stream::stream_stop,
      cmd::streaming::stream::stream_list_cameras,
      cmd::streaming::stream::stream_get_host,
      cmd::streaming::stream::whep_exchange,
      // NVR Shinobi — consumo de cámaras vía API HTTP (reemplaza stream_list_cameras)
      cmd::nvr::shinobi::nvr_list_cameras,
      cmd::nvr::shinobi::nvr_disconnect,
      // Agente AI con tools (tool_use loop + contexto terminal)
      cmd::tools::tools::get_terminal_context,
      cmd::tools::pi4_config::pi4_agent_ready,
      cmd::tools::tools::agent_chat,
      cmd::tools::tools::plan_chat,
      // MCP (Model Context Protocol) – servidores externos de tools
      cmd::integration::mcp_client::mcp_register_server,
      cmd::integration::mcp_client::mcp_list_servers,
      cmd::integration::mcp_client::mcp_remove_server,
      cmd::integration::mcp_client::mcp_refresh_tools,
      // Prácticas de laboratorio remoto
      cmd::practices::practicas::practicas_list_categories,
      cmd::practices::practicas::practicas_get_config,
      cmd::practices::practicas::practicas_run_setup,
      // Integración con Moodle
      cmd::integration::moodle::moodle_sync_assignment,
      cmd::integration::moodle::moodle_prepare_grade,
      cmd::integration::moodle::moodle_submit_grade_direct,
      // Validador de prácticas
      cmd::practices::practice_validator::validate_practice_progress,
      cmd::practices::practice_validator::calculate_practice_grade,
      // Arduino domótica (bridge HTTP en la Pi)
      cmd::hardware::arduino::arduino_bridge_status,
      cmd::hardware::arduino::arduino_send_cmd,
      cmd::hardware::arduino::arduino_read_buffer,
      // Autenticación OAuth 2.1 con Keycloak
      crate::auth::commands::auth_login_url,
      crate::auth::commands::auth_status,
      crate::auth::commands::auth_logout,
      // Admin REST API (User Management)
      crate::auth::commands::admin_search_users,
      crate::auth::commands::admin_list_all_users,
      crate::auth::commands::admin_list_users_by_role,
      crate::auth::commands::admin_get_user_roles,
      crate::auth::commands::admin_toggle_user_role,
    ])
    .on_window_event(|_win, event| {
      if matches!(event, tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed) {
        crate::cmd::vnc::cleanup_all_vnc_sessions();
        // En Windows los procesos hijos no mueren con el padre: matar las
        // shells PTY locales para no dejar procesos huérfanos.
        crate::cmd::terminal_local::cleanup_all_local_term_sessions();
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

