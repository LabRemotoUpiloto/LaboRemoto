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
    // Ejecutar curl directamente en el host remoto vía SSH exec.
    // NO se usa el túnel (run_port_forward) porque cada conexión al túnel
    // crea una nueva sesión SSH (~1-2 s) + lectura diagnóstica (1 s),
    // lo que supera el timeout de 3 s en conexiones lentas (ngrok, WAN).
    let (host, port, user, password) = {
        let map = SESSIONS.lock().map_err(|e| e.to_string())?;
        let s = map.get(&session_id).ok_or("Sesión no encontrada")?;
        (s.host.clone(), s.port, s.user.clone(), s.password.clone())
    };

    tokio::task::spawn_blocking(move || {
        use std::io::Read;
        let (_tcp, sess) = crate::ssh::ssh2_sftp::connect_password(&host, port, &user, &password)
            .map_err(|e| format!("SSH: {e}"))?;

        // Modo bloqueante explícito — evita WouldBlock en read_to_string
        sess.set_blocking(true);
        sess.set_timeout(8000);

        let mut channel = sess.channel_session()
            .map_err(|e| format!("Canal SSH: {e}"))?;
        channel.exec("curl -s --max-time 5 http://127.0.0.1:8888/cameras 2>/dev/null")
            .map_err(|e| format!("exec curl: {e}"))?;

        let mut body = String::new();
        channel.read_to_string(&mut body)
            .map_err(|e| format!("Lectura SSH: {e}"))?;
        channel.wait_close().ok();

        let body = body.trim();
        if body.is_empty() {
            return Err("El servidor de cámaras no respondió (¿está multicam.service corriendo?)".to_string());
        }

        serde_json::from_str::<Vec<CameraInfo>>(body)
            .map_err(|e| format!("JSON inválido: {e} — body: {:?}", &body[..body.len().min(120)]))
    })
    .await
    .map_err(|e| format!("Task: {e}"))?
}
