//! cmd/practices/linux_tunnel — Túnel SSH en memoria hacia el servicio de
//! prácticas de Linux (`practicas-linux-api`) en la Raspberry Pi.
//!
//! Hoy el único puerto de la Pi expuesto a internet es el de SSH (ver
//! `.env`, `PRACTICE_LINUX_TUNNEL_*`) — el puerto interno del
//! servicio HTTP (8770) solo escucha en la LAN. En vez de abrir un puerto
//! nuevo, este módulo abre una sesión SSH con una cuenta de servicio
//! restringida (sin shell, forwarding local limitado únicamente a
//! 127.0.0.1:8770 vía `PermitOpen` en sshd_config — ver setup de la Pi) y
//! reenvía un puerto local efímero a ese destino. `linux_api.rs` le habla a
//! ese puerto local como si fuera la API directamente.
//!
//! El túnel se establece una sola vez (primer uso) y se mantiene vivo el
//! resto de la sesión de la app; si falla, el siguiente intento reintenta
//! (no se cachea el error).

use std::net::SocketAddr;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use russh::{client, ChannelMsg};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{Mutex, OnceCell};

use crate::ssh_core::client::RusshClient;

static LOCAL_PORT: OnceCell<u16> = OnceCell::const_new();

#[derive(Debug, Clone)]
pub struct TunnelConfig {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub remote_host: String,
    pub remote_port: u16,
}

/// Devuelve el puerto local (127.0.0.1) que reenvía al servicio de
/// prácticas en la Pi, estableciendo el túnel la primera vez que se
/// necesita. Llamadas concurrentes esperan la misma inicialización.
pub async fn ensure_tunnel(config: TunnelConfig) -> Result<u16> {
    LOCAL_PORT
        .get_or_try_init(|| start_tunnel(config))
        .await
        .copied()
}

async fn start_tunnel(config: TunnelConfig) -> Result<u16> {
    use std::net::ToSocketAddrs;

    let mut addrs = (config.host.as_str(), config.port)
        .to_socket_addrs()
        .map_err(|e| anyhow!("no se pudo resolver {}:{}: {e}", config.host, config.port))?;
    let addr = addrs
        .next()
        .ok_or_else(|| anyhow!("sin direcciones para {}:{}", config.host, config.port))?;

    let russh_config = Arc::new(client::Config::default());
    let mut handle = client::connect(russh_config, addr, RusshClient::default())
        .await
        .map_err(|e| anyhow!("no se pudo conectar por SSH a {}:{}: {e}", config.host, config.port))?;

    match handle
        .authenticate_password(config.user.clone(), config.password.clone())
        .await?
    {
        client::AuthResult::Success => {}
        client::AuthResult::Failure { .. } => {
            return Err(anyhow!(
                "autenticación SSH fallida para la cuenta de túnel ({})",
                config.user
            ));
        }
    }

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| anyhow!("no se pudo abrir el listener local del túnel: {e}"))?;
    let local_port = listener.local_addr()?.port();

    let handle = Arc::new(Mutex::new(handle));
    let remote_host = config.remote_host;
    let remote_port = config.remote_port;

    tokio::spawn(async move {
        loop {
            let (stream, peer) = match listener.accept().await {
                Ok(v) => v,
                Err(e) => {
                    eprintln!("[linux_tunnel] error aceptando conexión local: {e}");
                    continue;
                }
            };
            let handle = handle.clone();
            let remote_host = remote_host.clone();
            tokio::spawn(async move {
                if let Err(e) = bridge(handle, stream, peer, remote_host, remote_port).await {
                    eprintln!("[linux_tunnel] error en el túnel: {e}");
                }
            });
        }
    });

    Ok(local_port)
}

/// Copia bidireccional entre la conexión TCP local (el cliente HTTP) y un
/// canal `direct-tcpip` nuevo hacia el servicio en la Pi.
async fn bridge(
    handle: Arc<Mutex<client::Handle<RusshClient>>>,
    mut stream: TcpStream,
    peer: SocketAddr,
    remote_host: String,
    remote_port: u16,
) -> Result<()> {
    let mut channel = {
        let handle = handle.lock().await;
        handle
            .channel_open_direct_tcpip(remote_host, remote_port as u32, peer.ip().to_string(), peer.port() as u32)
            .await?
    };

    let mut buf = vec![0u8; 65536];
    let mut stream_closed = false;
    loop {
        tokio::select! {
            r = stream.read(&mut buf), if !stream_closed => {
                match r {
                    Ok(0) => {
                        stream_closed = true;
                        channel.eof().await?;
                    }
                    Ok(n) => channel.data(&buf[..n]).await?,
                    Err(e) => return Err(e.into()),
                }
            }
            msg = channel.wait() => {
                match msg {
                    Some(ChannelMsg::Data { data }) => stream.write_all(&data).await?,
                    Some(ChannelMsg::Eof) | None => break,
                    _ => {}
                }
            }
        }
    }
    Ok(())
}
