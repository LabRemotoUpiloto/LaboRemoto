//! cmd/nvr/ssh_tunnel — Túnel SSH dedicado hacia el NVR Shinobi
//!
//! El NVR no es alcanzable por red pública en el despliegue piloto (el
//! router no tiene abierto el puerto de Shinobi). Como alternativa se
//! reutiliza el mismo mecanismo de port-forwarding que ya usa
//! `cmd::streaming::stream::stream_start` (russh `channel_open_direct_tcpip`),
//! pero en una conexión SSH propia — independiente de `SESSIONS` y de
//! cualquier sesión de práctica — autenticada por clave pública en vez de
//! password.
//!
//! El resto del módulo (`shinobi.rs`) sigue hablando HTTP normal contra
//! `127.0.0.1:<puerto local>`; el túnel es solo transporte, no cambia la
//! forma en que se consume la API de Shinobi.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use once_cell::sync::Lazy;
use russh::client::{self, Handle};
use russh::keys::{load_secret_key, PrivateKeyWithHashAlg};
use tokio::sync::Mutex as TokioMutex;

use crate::cmd::protocol::CommandError;
use crate::ssh_core::client::RusshClient;

pub struct SshTunnelConfig {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub key_path: String,
    /// Puerto de Shinobi en el lado remoto (127.0.0.1:<remote_port> desde la Pi).
    pub remote_port: u16,
}

struct TunnelState {
    local_port: u16,
    stop_flag: Arc<AtomicBool>,
}

static NVR_TUNNEL: Lazy<TokioMutex<Option<TunnelState>>> = Lazy::new(|| TokioMutex::new(None));

/// Devuelve el puerto local ya forwardeado hacia Shinobi, reutilizando el
/// túnel si ya está activo. Si no hay ninguno, abre uno nuevo.
pub async fn ensure_tunnel(cfg: &SshTunnelConfig) -> Result<u16, CommandError> {
    {
        let guard = NVR_TUNNEL.lock().await;
        if let Some(state) = guard.as_ref() {
            return Ok(state.local_port);
        }
    }

    let addr_str = format!("{}:{}", cfg.host, cfg.port);
    let socket_addr = tokio::net::lookup_host(&addr_str)
        .await
        .map_err(|e| CommandError::transient("SSH_ERROR", format!("No se pudo resolver {addr_str}: {e}")))?
        .next()
        .ok_or_else(|| CommandError::transient("SSH_ERROR", format!("Sin direcciones para {addr_str}")))?;

    let config = Arc::new(client::Config {
        keepalive_interval: Some(std::time::Duration::from_secs(30)),
        keepalive_max: 120,
        inactivity_timeout: None,
        ..client::Config::default()
    });
    let sh = RusshClient::default();
    let mut handle: Handle<RusshClient> = client::connect(config, socket_addr, sh)
        .await
        .map_err(|e| {
            CommandError::transient("SSH_ERROR", format!("Conexión SSH al NVR falló: {e}")).with_retry_after(3000)
        })?;

    let key = load_secret_key(&cfg.key_path, None).map_err(|e| {
        CommandError::permanent("CONFIG_INVALID", format!("No se pudo cargar la clave SSH del NVR ({}): {e}", cfg.key_path))
    })?;
    let key_with_hash = PrivateKeyWithHashAlg::new(Arc::new(key), None);

    match handle
        .authenticate_publickey(cfg.user.clone(), key_with_hash)
        .await
        .map_err(|e| CommandError::permanent("AUTH_FAILED", format!("Autenticación SSH al NVR falló: {e}")))?
    {
        client::AuthResult::Success => {}
        client::AuthResult::Failure { remaining_methods } => {
            return Err(CommandError::permanent(
                "AUTH_FAILED",
                format!("El NVR rechazó la clave SSH. Métodos disponibles: {remaining_methods:?}"),
            ));
        }
    }

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| CommandError::transient("IO_ERROR", format!("No se pudo abrir puerto local para el túnel del NVR: {e}")))?;
    let local_port = listener
        .local_addr()
        .map_err(|e| CommandError::transient("IO_ERROR", e.to_string()))?
        .port();

    let stop_flag = Arc::new(AtomicBool::new(false));
    let handle_arc = Arc::new(TokioMutex::new(handle));
    let remote_port = cfg.remote_port;
    let stop2 = stop_flag.clone();

    // Mismo patrón de forwarding que cmd::streaming::stream::stream_start,
    // pero con su propia conexión SSH (no la de SESSIONS).
    tokio::spawn(async move {
        loop {
            tokio::select! {
                result = listener.accept() => {
                    let (conn, _) = match result { Ok(x) => x, Err(_) => break };
                    conn.set_nodelay(true).ok();

                    let handle3 = handle_arc.clone();
                    tokio::spawn(async move {
                        let mut ch: russh::Channel<russh::client::Msg> = match handle3.lock().await
                            .channel_open_direct_tcpip("127.0.0.1", remote_port as u32, "127.0.0.1", 0)
                            .await {
                            Ok(c) => c,
                            Err(_) => return,
                        };

                        let (mut tcp_rx, mut tcp_tx) = tokio::io::split(conn);
                        let mut buf = vec![0u8; 65536];
                        loop {
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
                    if stop2.load(Ordering::Relaxed) { break; }
                }
            }
        }
    });

    let mut guard = NVR_TUNNEL.lock().await;
    *guard = Some(TunnelState { local_port, stop_flag });
    Ok(local_port)
}

/// Cierra el túnel activo, si lo hay (equivalente a `stream_stop`).
pub async fn disconnect() {
    let mut guard = NVR_TUNNEL.lock().await;
    if let Some(state) = guard.take() {
        state.stop_flag.store(true, Ordering::Relaxed);
    }
}
