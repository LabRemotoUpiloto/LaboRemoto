use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use crate::cmd::state::{SESSIONS, CameraInfo};

#[tauri::command]
pub async fn stream_start(
    session_id: String,
    remote_port: u16,
    local_port: u16,
) -> Result<u16, String> {
    // Clonar el Arc<Mutex<Handle>> de la sesión existente (Arc::clone es O(1)).
    // Cada nueva conexión TCP lockea brevemente el handle para abrir un canal
    // direct-tcpip sobre la sesión SSH ya establecida — sin nuevo handshake.
    let handle = {
        let map = SESSIONS.lock().map_err(|e| e.to_string())?;
        let sess = map.get(&session_id).ok_or("Sesión no encontrada")?;
        sess.term.handle.clone()  // Arc clone
    };

    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{local_port}"))
        .await
        .map_err(|e| format!("No se pudo abrir puerto local {local_port}: {e}"))?;
    let actual_port = listener.local_addr().map_err(|e| e.to_string())?.port();

    let stop_flag = Arc::new(AtomicBool::new(false));

    {
        let mut map = SESSIONS.lock().map_err(|e| e.to_string())?;
        if let Some(sess) = map.get_mut(&session_id) {
            if let Some(old_flag) = sess.stream_stop_flag.take() {
                old_flag.store(true, Ordering::Relaxed);
            }
            sess.stream_stop_flag = Some(stop_flag.clone());
            sess.stream_local_port = Some(actual_port);
        }
    }

    let stop = stop_flag.clone();
    tokio::spawn(async move {
        loop {
            tokio::select! {
                result = listener.accept() => {
                    let (conn, _) = match result { Ok(x) => x, Err(_) => break };
                    conn.set_nodelay(true).ok();

                    let handle2 = handle.clone();
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
                _ = tokio::time::sleep(std::time::Duration::from_millis(200)) => {
                    if stop.load(Ordering::Relaxed) { break; }
                }
            }
        }
    });

    Ok(actual_port)
}

#[tauri::command]
pub async fn stream_stop(session_id: String) -> Result<(), String> {
    let mut map = SESSIONS.lock().map_err(|e| e.to_string())?;
    if let Some(sess) = map.get_mut(&session_id) {
        if let Some(flag) = sess.stream_stop_flag.take() {
            flag.store(true, Ordering::Relaxed);
        }
        sess.stream_local_port = None;
    }
    Ok(())
}

#[tauri::command]
pub async fn stream_list_cameras(session_id: String) -> Result<Vec<CameraInfo>, String> {
    // Reutiliza el handle russh ya autenticado para abrir un canal exec.
    // Antes se abría una nueva conexión TCP (ssh2) cada poll → timeout 10060.
    let handle = {
        let map = SESSIONS.lock().map_err(|e| e.to_string())?;
        let s = map.get(&session_id).ok_or("Sesión no encontrada")?;
        s.term.handle.clone()
    };

    // Abre un canal de sesión sobre la conexión SSH existente y ejecuta curl
    let mut channel = handle.lock().await
        .channel_open_session()
        .await
        .map_err(|e| format!("Canal SSH: {e}"))?;

    channel.exec(true, "curl -s --max-time 5 http://127.0.0.1:8877/cameras 2>/dev/null || curl -s --max-time 5 http://127.0.0.1:8888/cameras 2>/dev/null")
        .await
        .map_err(|e| format!("exec curl: {e}"))?;

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
        return Err("El servidor de cámaras no respondió (¿está multicam.service corriendo?)".to_string());
    }

    serde_json::from_str::<Vec<CameraInfo>>(body)
        .map_err(|e| format!("JSON inválido: {e} — body: {:?}", &body[..body.len().min(120)]))
}

/// Devuelve la IP del host remoto para que el frontend pueda construir URLs WHEP directas.
/// WebRTC requiere conexión directa (LAN) — no se puede tunelizar RTP/SRTP por SSH.
#[derive(serde::Serialize)]
pub struct StreamHostInfo {
    pub host: String,
    pub whep_port: u16,
}

#[tauri::command]
pub fn stream_get_host(session_id: String) -> Result<StreamHostInfo, String> {
    let map = SESSIONS.lock().map_err(|e| e.to_string())?;
    let s = map.get(&session_id).ok_or("Sesión no encontrada")?;
    Ok(StreamHostInfo { host: s.host.clone(), whep_port: 8889 })
}

/// Realiza el POST WHEP desde Rust para evitar bloqueos CORS en el WebView.
/// Recibe la URL WHEP y el SDP offer, devuelve el SDP answer de MediaMTX.
#[tauri::command]
pub async fn whep_exchange(url: String, sdp_offer: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .post(&url)
        .header("Content-Type", "application/sdp")
        .body(sdp_offer)
        .send()
        .await
        .map_err(|e| format!("WHEP POST falló: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("WHEP {}", resp.status()));
    }

    resp.text().await.map_err(|e| e.to_string())
}
