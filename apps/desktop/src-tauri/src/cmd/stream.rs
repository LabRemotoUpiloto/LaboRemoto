use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use crate::cmd::state::SESSIONS;

#[tauri::command]
pub async fn stream_start(
    session_id: String,
    remote_port: u16,
    local_port: u16,
) -> Result<u16, String> {
    let (host, port, user, password) = {
        let map = SESSIONS.lock().map_err(|e| e.to_string())?;
        let sess = map
            .get(&session_id)
            .ok_or("Sesión no encontrada")?;
        (sess.host.clone(), sess.port, sess.user.clone(), sess.password.clone())
    };

    // Listener local
    let listener = std::net::TcpListener::bind(format!("127.0.0.1:{local_port}"))
        .map_err(|e| format!("No se pudo abrir puerto local {local_port}: {e}"))?;
    let actual_port = listener.local_addr().map_err(|e| e.to_string())?.port();
    listener.set_nonblocking(true).ok();

    let stop_flag = Arc::new(AtomicBool::new(false));

    // Guarda el stop_flag en el estado de la sesión para poder pararlo
    {
        let mut map = SESSIONS.lock().map_err(|e| e.to_string())?;
        if let Some(sess) = map.get_mut(&session_id) {
            // Detener stream anterior si existe
            if let Some(old_flag) = sess.stream_stop_flag.take() {
                old_flag.store(true, Ordering::Relaxed);
            }
            sess.stream_stop_flag = Some(stop_flag.clone());
        }
    }

    std::thread::Builder::new()
        .name(format!("stream-fwd-{session_id}"))
        .spawn(move || {
            crate::cmd::vnc::run_port_forward(
                listener,
                host,
                port,
                user,
                password,
                remote_port,
                stop_flag,
            );
        })
        .map_err(|e| format!("No se pudo lanzar hilo de stream: {e}"))?;

    Ok(actual_port)
}

#[tauri::command]
pub async fn stream_stop(session_id: String) -> Result<(), String> {
    let mut map = SESSIONS.lock().map_err(|e| e.to_string())?;
    if let Some(sess) = map.get_mut(&session_id) {
        if let Some(flag) = sess.stream_stop_flag.take() {
            flag.store(true, Ordering::Relaxed);
        }
    }
    Ok(())
}
