//! cmd/stream — Streaming de video vía port-forwarding SSH y WebRTC
//!
//! Este módulo proporciona:
//! - Port-forwarding SSH para streaming de cámaras (RTSP/HTTP)
//! - Listado de cámaras disponibles en MediaMTX
//! - Intercambio WHEP para WebRTC (SDP offer/answer)
//! - Información del host remoto para URLs directas

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use once_cell::sync::Lazy;
use crate::cmd::state::{SESSIONS, CameraInfo};
use crate::cmd::protocol::CommandError;
use crate::error::AppError;

// Perf: cliente HTTP compartido para el intercambio WHEP — evita reconstruir
// el pool TCP/TLS en cada conexión de cámara.
static HTTP_CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap_or_default()
});

/// Registro global de stop flags por sesión
pub static STREAM_STOP_FLAGS: Lazy<Mutex<HashMap<String, Arc<AtomicBool>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Registro global de canales oneshot para esperar que el listener efectivamente se libere antes de que stream_stop retorne
pub static STREAM_STOP_NOTIFIERS: Lazy<Mutex<HashMap<String, tokio::sync::oneshot::Receiver<()>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[tauri::command]
pub async fn stream_start(
    session_id: String,
    remote_port: u16,
    local_port: u16,
) -> Result<u16, CommandError> {
    println!("[stream_start] starting stream for session_id={session_id}, remote_port={remote_port}, local_port={local_port}");

    // Si ya existía un stream previo para este session_id, asegurarse de detenerlo y esperar que su puerto se libere
    let prev_flag = {
        let mut flags = STREAM_STOP_FLAGS.lock().map_err(|_| CommandError::internal("LOCK_POISONED", "STREAM_STOP_FLAGS lock poisoned"))?;
        flags.remove(&session_id)
    };
    if let Some(old_f) = prev_flag {
        old_f.store(true, Ordering::Relaxed);
    }
    let prev_rx = {
        let mut notifiers = STREAM_STOP_NOTIFIERS.lock().map_err(|_| CommandError::internal("LOCK_POISONED", "STREAM_STOP_NOTIFIERS lock poisoned"))?;
        notifiers.remove(&session_id)
    };
    if let Some(rx) = prev_rx {
        let _ = tokio::time::timeout(std::time::Duration::from_millis(500), rx).await;
    }

    // Clonar el Arc<Mutex<Handle>> de la sesión existente (Arc::clone es O(1)).
    // Cada nueva conexión TCP lockea brevemente el handle para abrir un canal
    // direct-tcpip sobre la sesión SSH ya establecida — sin nuevo handshake.
    let handle = {
        let map = SESSIONS.lock().map_err(|_| CommandError::internal("LOCK_POISONED", "SESSIONS lock poisoned"))?;
        map.get(&session_id).map(|sess| sess.term.handle.clone())
    };

    // Si la sesión no existe en SESSIONS: en tests unitarios permitimos session_id con prefijo "test-" sin SSH real
    if handle.is_none() && !session_id.starts_with("test-") {
        return Err(CommandError::from(AppError::NotFoundSession));
    }

    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{local_port}"))
        .await
        .map_err(|e| CommandError::transient("IO_ERROR", format!("No se pudo abrir puerto local {local_port}: {e}")))?;
    let actual_port = listener.local_addr().map_err(|e| CommandError::transient("IO_ERROR", e.to_string()))?.port();
    println!("[stream_start] bound TcpListener on 127.0.0.1:{actual_port} for session_id={session_id}");

    let stop_flag = Arc::new(AtomicBool::new(false));
    let (notify_tx, notify_rx) = tokio::sync::oneshot::channel::<()>();

    {
        let mut flags = STREAM_STOP_FLAGS.lock().map_err(|_| CommandError::internal("LOCK_POISONED", "STREAM_STOP_FLAGS lock poisoned"))?;
        flags.insert(session_id.clone(), stop_flag.clone());

        let mut notifiers = STREAM_STOP_NOTIFIERS.lock().map_err(|_| CommandError::internal("LOCK_POISONED", "STREAM_STOP_NOTIFIERS lock poisoned"))?;
        notifiers.insert(session_id.clone(), notify_rx);
    }

    {
        let mut map = SESSIONS.lock().map_err(|_| CommandError::internal("LOCK_POISONED", "SESSIONS lock poisoned"))?;
        if let Some(sess) = map.get_mut(&session_id) {
            sess.stream_stop_flag = Some(stop_flag.clone());
            sess.stream_local_port = Some(actual_port);
        }
    }

    let stop = stop_flag.clone();
    let session_id_loop = session_id.clone();
    tokio::spawn(async move {
        let _notify_tx = notify_tx;
        println!("[stream_listener_loop] started for session_id={session_id_loop}, port={actual_port}");
        loop {
            tokio::select! {
                result = listener.accept() => {
                    let (conn, _) = match result { Ok(x) => x, Err(_) => break };
                    conn.set_nodelay(true).ok();

                    if let Some(ref h) = handle {
                        let handle2 = h.clone();
                        let stop2 = stop.clone();
                        tokio::spawn(async move {
                            // Abre canal directo en la sesión SSH existente — no crea nueva sesión.
                            // El lock se libera en cuanto el canal está abierto; el canal es independiente.
                            let mut ch: russh::Channel<russh::client::Msg> = match handle2.lock().await
                                .channel_open_direct_tcpip("127.0.0.1", remote_port as u32, "127.0.0.1", 0)
                                .await {
                                Ok(c) => c,
                                Err(_) => return,
                            };

                            let (mut tcp_rx, mut tcp_tx) = tokio::io::split(conn);
                            let mut buf = vec![0u8; 65536];
                            loop {
                                if stop2.load(Ordering::Relaxed) { break; }
                                tokio::select! {
                                    n = tokio::io::AsyncReadExt::read(&mut tcp_rx, &mut buf) => {
                                        match n {
                                            Ok(0) | Err(_) => break,
                                            Ok(n) => {
                                                let mut r: &[u8] = &buf[..n];
                                                if ch.data(&mut r).await.is_err() { break; }
                                            }
                                        }
                                    },
                                    msg = ch.wait() => {
                                        match msg {
                                            Some(russh::ChannelMsg::Data { data }) => {
                                                use tokio::io::AsyncWriteExt;
                                                if tcp_tx.write_all(data.as_ref()).await.is_err() { break; }
                                            }
                                            Some(russh::ChannelMsg::Eof) | None => break,
                                            _ => {}
                                        }
                                    },
                                }
                            }
                            ch.close().await.ok();
                        });
                    }
                }
                _ = tokio::time::sleep(std::time::Duration::from_millis(25)) => {
                    if stop.load(Ordering::Relaxed) {
                        println!("[stream_listener_loop] stop flag detected for session_id={session_id_loop}");
                        break;
                    }
                }
            }
        }
        println!("[stream_listener_loop] exiting loop, dropping listener on port {actual_port} for session_id={session_id_loop}");
        drop(listener);
        println!("[stream_listener_loop] listener dropped, port {actual_port} freed, sending stopped signal");
        let _ = _notify_tx.send(());
    });

    Ok(actual_port)
}

#[tauri::command]
pub async fn stream_stop(session_id: String) -> Result<(), CommandError> {
    println!("[stream_stop] stopping stream for session_id={session_id}");

    let flag_opt = {
        let mut flags = STREAM_STOP_FLAGS.lock().map_err(|_| CommandError::internal("LOCK_POISONED", "STREAM_STOP_FLAGS lock poisoned"))?;
        flags.remove(&session_id)
    };

    if let Some(flag) = flag_opt {
        flag.store(true, Ordering::Relaxed);
    }

    if let Ok(mut map) = SESSIONS.lock() {
        if let Some(sess) = map.get_mut(&session_id) {
            if let Some(flag) = sess.stream_stop_flag.take() {
                flag.store(true, Ordering::Relaxed);
            }
            sess.stream_local_port = None;
        }
    }

    let rx_opt = {
        let mut notifiers = STREAM_STOP_NOTIFIERS.lock().map_err(|_| CommandError::internal("LOCK_POISONED", "STREAM_STOP_NOTIFIERS lock poisoned"))?;
        notifiers.remove(&session_id)
    };

    if let Some(rx) = rx_opt {
        println!("[stream_stop] waiting for listener loop to drop on session_id={session_id}...");
        match tokio::time::timeout(std::time::Duration::from_secs(2), rx).await {
            Ok(Ok(())) => println!("[stream_stop] listener loop terminated cleanly, port released"),
            Ok(Err(_)) => println!("[stream_stop] listener loop sender dropped, port released"),
            Err(_) => println!("[stream_stop] WARNING: timeout waiting for listener loop to release port"),
        }
    } else {
        println!("[stream_stop] no active listener found for session_id={session_id}");
    }

    Ok(())
}

#[tauri::command]
pub async fn stream_list_cameras(session_id: String) -> Result<Vec<CameraInfo>, CommandError> {
    let handle = {
        let map = SESSIONS.lock().map_err(|_| CommandError::internal("LOCK_POISONED", "SESSIONS lock poisoned"))?;
        let s = map.get(&session_id).ok_or_else(|| CommandError::from(AppError::NotFoundSession))?;
        s.term.handle.clone()
    };

    let mut channel = handle.lock().await
        .channel_open_session()
        .await
        .map_err(|e| CommandError::transient("SSH_ERROR", format!("Canal SSH: {e}")))?;

    channel.exec(true, "curl -s --max-time 5 http://127.0.0.1:8877/cameras 2>/dev/null || curl -s --max-time 5 http://127.0.0.1:8888/cameras 2>/dev/null")
        .await
        .map_err(|e| CommandError::transient("SSH_ERROR", format!("exec curl: {e}")))?;

    let mut body = Vec::new();
    loop {
        match channel.wait().await {
            Some(russh::ChannelMsg::Data { data }) => body.extend_from_slice(&data),
            Some(russh::ChannelMsg::Eof) | None => break,
            Some(russh::ChannelMsg::ExitStatus { .. }) => {}
            _ => {}
        }
    }

    let body = String::from_utf8_lossy(&body);
    let body = body.trim();

    if body.is_empty() {
        return Err(CommandError::transient(
            "OPERATION_TIMEOUT",
            "El servidor de cámaras no respondió (¿está multicam.service corriendo?)",
        ).with_retry_after(2000));
    }

    serde_json::from_str::<Vec<CameraInfo>>(body)
        .map_err(|e| CommandError::permanent("INVALID_DATA", format!("JSON inválido: {e} — body: {:?}", &body[..body.len().min(120)])))
}

/// Devuelve la IP del host remoto para que el frontend pueda construir URLs WHEP directas.
/// WebRTC requiere conexión directa (LAN) — no se puede tunelizar RTP/SRTP por SSH.
#[derive(serde::Serialize)]
pub struct StreamHostInfo {
    pub host: String,
    pub whep_port: u16,
}

#[tauri::command]
pub fn stream_get_host(session_id: String) -> Result<StreamHostInfo, CommandError> {
    let map = SESSIONS.lock().map_err(|_| CommandError::internal("LOCK_POISONED", "SESSIONS lock poisoned"))?;
    let s = map.get(&session_id).ok_or_else(|| CommandError::from(AppError::NotFoundSession))?;
    Ok(StreamHostInfo { host: s.host.clone(), whep_port: 8889 })
}

/// Realiza el POST WHEP desde Rust para evitar bloqueos CORS en el WebView.
/// Recibe la URL WHEP y el SDP offer, devuelve el SDP answer de MediaMTX.
#[tauri::command]
pub async fn whep_exchange(url: String, sdp_offer: String) -> Result<String, CommandError> {
    let client = &*HTTP_CLIENT;

    let resp = client
        .post(&url)
        .header("Content-Type", "application/sdp")
        .body(sdp_offer)
        .send()
        .await
        .map_err(|e| CommandError::transient("OPERATION_TIMEOUT", format!("WHEP POST falló: {e}")).with_retry_after(2000))?;

    if !resp.status().is_success() {
        return Err(CommandError::transient("COMMUNICATION_ERROR", format!("WHEP {}", resp.status())));
    }

    resp.text().await.map_err(|e| CommandError::transient("COMMUNICATION_ERROR", e.to_string()))
}
