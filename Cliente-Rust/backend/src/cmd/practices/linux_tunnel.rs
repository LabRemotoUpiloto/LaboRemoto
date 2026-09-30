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
use tokio::sync::Mutex;

use crate::ssh_core::client::RusshClient;

/// Túnel vigente: puerto local, conexión SSH y la tarea que acepta
/// conexiones locales sobre ella.
struct Tunel {
    local_port: u16,
    handle: Arc<Mutex<client::Handle<RusshClient>>>,
    accept_task: tokio::task::JoinHandle<()>,
}

static TUNEL: Mutex<Option<Tunel>> = Mutex::const_new(None);

// Sin keepalive, una conexión que muere en silencio (cambio de IP en red
// móvil, la Pi se reinicia) nunca se marca como cerrada y el túnel queda
// inservible hasta reiniciar la app. Con esto russh la cierra en ~45 s.
const KEEPALIVE_INTERVAL: std::time::Duration = std::time::Duration::from_secs(15);
const KEEPALIVE_MAX: usize = 3;

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
/// prácticas en la Pi. Abre el túnel la primera vez y lo vuelve a abrir si la
/// conexión SSH se cerró. Llamadas concurrentes esperan al mismo intento.
pub async fn ensure_tunnel(config: TunnelConfig) -> Result<u16> {
    let mut actual = TUNEL.lock().await;
    if let Some(t) = actual.as_ref() {
        if !t.handle.lock().await.is_closed() {
            return Ok(t.local_port);
        }
        eprintln!("[linux_tunnel] la conexión SSH del túnel se cerró; reconectando");
        t.accept_task.abort();
        *actual = None;
    }
    let nuevo = start_tunnel(config).await?;
    let local_port = nuevo.local_port;
    *actual = Some(nuevo);
    Ok(local_port)
}

// Timeout PROPIO de cada paso de red de start_tunnel -- crítico que sea acá
// adentro y no un timeout externo envolviendo a ensure_tunnel(): si una
// future de más arriba cancela ensure_tunnel() mientras espera la red, el
// intento se pierde a medias. Con el timeout acá adentro esta función SIEMPRE
// termina por sí sola con Ok o Err, y la próxima llamada vuelve a intentar.
const TUNNEL_STEP_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(6);

async fn start_tunnel(config: TunnelConfig) -> Result<Tunel> {
    use std::net::ToSocketAddrs;

    let mut addrs = (config.host.as_str(), config.port)
        .to_socket_addrs()
        .map_err(|e| anyhow!("no se pudo resolver {}:{}: {e}", config.host, config.port))?;
    let addr = addrs
        .next()
        .ok_or_else(|| anyhow!("sin direcciones para {}:{}", config.host, config.port))?;

    let russh_config = Arc::new(client::Config {
        keepalive_interval: Some(KEEPALIVE_INTERVAL),
        keepalive_max: KEEPALIVE_MAX,
        ..Default::default()
    });
    let mut handle = tokio::time::timeout(
        TUNNEL_STEP_TIMEOUT,
        client::connect(russh_config, addr, RusshClient::default()),
    )
    .await
    .map_err(|_| anyhow!("timeout ({}s) conectando por SSH a {}:{}", TUNNEL_STEP_TIMEOUT.as_secs(), config.host, config.port))?
    .map_err(|e| anyhow!("no se pudo conectar por SSH a {}:{}: {e}", config.host, config.port))?;

    let auth_result = tokio::time::timeout(
        TUNNEL_STEP_TIMEOUT,
        handle.authenticate_password(config.user.clone(), config.password.clone()),
    )
    .await
    .map_err(|_| anyhow!("timeout ({}s) autenticando por SSH ({})", TUNNEL_STEP_TIMEOUT.as_secs(), config.user))??;

    match auth_result {
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

    let handle_tarea = handle.clone();
    let accept_task = tokio::spawn(async move {
        let handle = handle_tarea;
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

    Ok(Tunel { local_port, handle, accept_task })
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
