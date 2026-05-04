//! cmd/vnc.rs — Sesiones de escritorio gráfico remoto
//!
//! Ciclo de vida:
//!   vnc_start → detecta display/puerto libre → arranca Xvfb+Openbox+x11vnc
//!             → abre bridge WS↔SSH(direct-tcpip) → devuelve ws_port al frontend
//!   vnc_stop  → señala al bridge que pare → mata procesos remotos
//!
//! El bridge corre en un hilo OS dedicado. Lo inicia vnc_start y se detiene
//! automáticamente cuando se descarta el VncSessionState (Drop).

pub mod bridge;
pub mod server;
pub mod utils;

use std::sync::Arc;
use std::sync::atomic::AtomicBool;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::cmd::state::SESSIONS;
use crate::error::AppError;

// ─────────────────────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct VncSessionInfo {
    pub ws_port: u16,
    pub display: u32,
    pub vnc_port: u16,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum VncStatusResponse {
    NotStarted,
    Running { ws_port: u16, display: u32 },
}

// ─────────────────────────────────────────────────────────────────────────────
// Comandos Tauri
// ─────────────────────────────────────────────────────────────────────────────

/// Inicia una sesión de escritorio gráfico sobre una conexión SSH activa.
#[tauri::command]
pub async fn vnc_start(
    app: AppHandle,
    session_id: String,
    resolution: Option<String>,
) -> Result<VncSessionInfo, String> {
    let res = resolution.unwrap_or_else(|| "1280x720".to_string());

    const VALID: &[&str] = &["1024x768", "1280x720", "1280x800", "1920x1080"];
    if !VALID.contains(&res.as_str()) {
        return Err(format!(
            "Resolución inválida '{res}'. Opciones: {}",
            VALID.join(", ")
        ));
    }

    let (host, port, user, password) = {
        let map = SESSIONS.lock().map_err(|e| e.to_string())?;
        let sess = map
            .get(&session_id)
            .ok_or_else(|| AppError::NotFoundSession.to_string())?;

        if let Some(vnc) = &sess.vnc_session {
            return Ok(VncSessionInfo {
                ws_port: vnc.ws_port_local,
                display: vnc.display_num,
                vnc_port: vnc.vnc_port_remote,
            });
        }

        (
            sess.host.clone(),
            sess.port,
            sess.user.clone(),
            sess.password.clone(),
        )
    };

    let h = host.clone();
    let u = user.clone();
    let p = password.clone();
    let r = res.clone();

    let (display, vnc_port, ws_listener, local_fwd_port, is_virtual, home_dir) =
        tokio::task::spawn_blocking(move || -> Result<(u32, u16, std::net::TcpListener, u16, bool, String), String> {
            let (_tcp_setup, setup_sess) =
                crate::ssh_core::ssh2_sftp::connect_password(&h, port, &u, &p)
                    .map_err(|e| format!("Conexión SSH para setup VNC falló: {e}"))?;

            let home_dir = utils::get_remote_home(&setup_sess);
            utils::check_dependencies(&setup_sess, true)?;
            crate::cmd::state::run_pending_vnc_cleanups(&setup_sess);
            let display  = utils::find_free_display(&setup_sess)?;
            let vnc_port = utils::find_free_vnc_port(&setup_sess)?;
            server::start_vnc_server(&setup_sess, display, vnc_port, &r, &home_dir)?;

            let ws_listener = std::net::TcpListener::bind("127.0.0.1:0")
                .map_err(|e| format!("No se pudo abrir el listener WS local: {e}"))?;

            let fwd_listener = std::net::TcpListener::bind("127.0.0.1:0")
                .map_err(|e| format!("No se pudo reservar puerto local para ssh -L: {e}"))?;
            let local_fwd_port = fwd_listener
                .local_addr()
                .map_err(|e| e.to_string())?
                .port();
            drop(fwd_listener);

            Ok((display, vnc_port, ws_listener, local_fwd_port, true, home_dir))
        })
        .await
        .map_err(|e| format!("Error interno (spawn_blocking): {e}"))??;

    let ws_port = ws_listener
        .local_addr()
        .map_err(|e| e.to_string())?
        .port();

    let stop_flag  = Arc::new(AtomicBool::new(false));
    let stop_clone = stop_flag.clone();
    let (h, u, p)  = (host.clone(), user.clone(), password.clone());

    let fwd_h = host.clone();
    let fwd_u = user.clone();
    let fwd_p = password.clone();
    let fwd_stop = stop_flag.clone();

    let fwd_listener = std::net::TcpListener::bind(format!("127.0.0.1:{local_fwd_port}"))
        .map_err(|e| format!("No se pudo abrir port-forward listener en {local_fwd_port}: {e}"))?;
    fwd_listener.set_nonblocking(true).ok();

    std::thread::Builder::new()
        .name(format!("vnc-fwd-{session_id}"))
        .spawn(move || {
            bridge::run_port_forward(fwd_listener, fwd_h, port, fwd_u, fwd_p, vnc_port, fwd_stop);
        })
        .map_err(|e| format!("No se pudo lanzar el hilo port-forward: {e}"))?;

    std::thread::sleep(std::time::Duration::from_millis(100));

    let ssh_fwd_child: Option<std::process::Child> = None;

    let app_bridge = app.clone();
    let sid_bridge = session_id.clone();
    let bridge = std::thread::Builder::new()
        .name(format!("vnc-bridge-{session_id}"))
        .spawn(move || {
            bridge::run_bridge_thread(
                ws_listener, h, port, u, p, vnc_port, display, stop_clone,
                app_bridge, sid_bridge, local_fwd_port,
            );
        })
        .map_err(|e| format!("No se pudo lanzar el hilo bridge VNC: {e}"))?;

    {
        let mut map = SESSIONS.lock().map_err(|e| e.to_string())?;
        let sess = map
            .get_mut(&session_id)
            .ok_or_else(|| AppError::NotFoundSession.to_string())?;
        sess.vnc_session = Some(crate::cmd::state::VncSessionState {
            display_num: display,
            vnc_port_remote: vnc_port,
            ws_port_local: ws_port,
            stop_flag,
            bridge_thread: Some(bridge),
            ssh_fwd_child,
            host,
            port,
            user,
            password,
            is_virtual,
            home_dir,
        });
    }

    let _ = app.emit(
        &format!("vnc_ready_{session_id}"),
        serde_json::json!({ "ws_port": ws_port, "display": display }),
    );

    Ok(VncSessionInfo {
        ws_port,
        display,
        vnc_port,
    })
}

/// Detiene la sesión gráfica activa.
#[tauri::command]
pub async fn vnc_stop(session_id: String) -> Result<(), String> {
    let (vnc_opt, term_tx) = {
        let mut map = crate::cmd::state::SESSIONS.lock().map_err(|e| e.to_string())?;
        let sess = map.get_mut(&session_id).ok_or("NotFoundSession")?;
        (sess.vnc_session.take(), sess.term.tx.clone())
    };

    if let Some(mut vnc) = vnc_opt {
        vnc.stop_flag.store(true, std::sync::atomic::Ordering::Relaxed);
        if let Some(mut child) = vnc.ssh_fwd_child.take() { let _ = child.kill(); }

        let display  = vnc.display_num;
        let vnc_port = vnc.vnc_port_remote;
        vnc.host     = "".to_string();

        let kill_cmd = format!(
            "pkill -9 -f 'Xvfb :{display} ' 2>/dev/null; \
             pkill -9 -f 'x11vnc.*rfbport {vnc_port}' 2>/dev/null; \
             rm -f /tmp/.X{display}-lock /tmp/.X11-unix/X{display} 2>/dev/null; true\n"
        );
        let _ = term_tx.send(crate::ssh_core::client::ChanCmd::Send(kill_cmd.into_bytes()));

        tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;
    }

    Ok(())
}

/// Limpia todos los displays VNC virtuales desde :20 en el servidor activo.
#[tauri::command]
pub async fn vnc_cleanup_all(session_id: String) -> Result<String, String> {
    let (host, port, user, password) = {
        let map = crate::cmd::state::SESSIONS.lock().map_err(|e| e.to_string())?;
        let sess = map.get(&session_id).ok_or("NotFoundSession")?;
        (sess.host.clone(), sess.port, sess.user.clone(), sess.password.clone())
    };

    let result = tokio::task::spawn_blocking(move || -> Result<String, String> {
        let (_tcp, sess) = crate::ssh_core::ssh2_sftp::connect_password(&host, port, &user, &password)
            .map_err(|e| format!("SSH error: {e}"))?;
        let (_, out) = crate::ssh_core::exec::ssh_exec_session(
            &sess,
            "for d in $(seq 20 99); do \
               pgrep -f \"Xvfb :$d \" >/dev/null 2>&1 && { \
                 pkill -9 -f \"Xvfb :$d \" 2>/dev/null; \
                 pkill -9 -f \"x11vnc.*:$d\" 2>/dev/null; \
                 rm -f /tmp/.X$d-lock /tmp/.X11-unix/X$d 2>/dev/null; \
                 echo \"killed :$d\"; \
               }; \
             done; true"
        ).map_err(|e| e)?;
        Ok(out.trim().to_string())
    }).await.map_err(|e| e.to_string())??;

    Ok(if result.is_empty() { "No había displays activos".to_string() } else { result })
}

/// Consulta el estado de la sesión gráfica para un session_id dado.
#[tauri::command]
pub async fn vnc_status(session_id: String) -> Result<VncStatusResponse, String> {
    let map = SESSIONS.lock().map_err(|e| e.to_string())?;
    let sess = map
        .get(&session_id)
        .ok_or_else(|| AppError::NotFoundSession.to_string())?;
    Ok(match &sess.vnc_session {
        None => VncStatusResponse::NotStarted,
        Some(v) => VncStatusResponse::Running {
            ws_port: v.ws_port_local,
            display: v.display_num,
        },
    })
}

/// Limpia todas las sesiones VNC activas al cerrar la aplicación.
/// Se invoca desde `lib.rs` en el evento `on_window_event`.
pub fn cleanup_all_vnc_sessions() {
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

    if !sessions_info.is_empty() {
        std::thread::spawn(move || {
            for (display, vnc_port, host, port, user, password, is_virtual) in sessions_info {
                if host.is_empty() { continue; }
                if let Ok((_tcp, sess)) = crate::ssh_core::ssh2_sftp::connect_password(&host, port, &user, &password) {
                    if is_virtual {
                        let _ = crate::ssh_core::exec::ssh_exec_session(
                            &sess,
                            &format!("pkill -9 -f 'Xvfb :{display} ' 2>/dev/null; pkill -9 -f 'x11vnc.*rfbport {vnc_port}' 2>/dev/null; rm -f /tmp/.X{display}-lock /tmp/.X11-unix/X{display} 2>/dev/null; true")
                        );
                    }
                }
            }
        });
    }
}
