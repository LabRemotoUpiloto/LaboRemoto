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
//! El listener local (el puerto que ve `linux_api.rs`) se abre UNA sola vez
//! y vive el resto de la sesión de la app. La sesión SSH de ABAJO es otra
//! historia: se puede caer sola (idle timeout del lado de la Pi, reinicio
//! del servicio, blip de red) sin que nada del lado de la app se entere --
//! antes eso dejaba el túnel entero muerto para siempre (el puerto local
//! quedaba cacheado, pero cada intento de abrir un canal nuevo fallaba con
//! "Failed to open channel" indefinidamente, y la única forma de
//! recuperarlo era reiniciar la app). Ahora cada conexión local que llega
//! revisa si la sesión SSH sigue viva y, si no, la reconecta sola antes de
//! reintentar -- ver `bridge`/`reconnect`.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Result};
use russh::{client, ChannelMsg};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{Mutex, OnceCell};

use crate::ssh_core::client::RusshClient;

#[derive(Debug, Clone)]
pub struct TunnelConfig {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub remote_host: String,
    pub remote_port: u16,
}

/// Sesión SSH compartida por todas las conexiones locales del túnel, más lo
/// que hace falta para reconectarla si se cae.
struct TunnelState {
    config: TunnelConfig,
    handle: Option<Arc<Mutex<client::Handle<RusshClient>>>>,
    /// Último reconnect exitoso -- ver `reconnect`: colapsa ráfagas de
    /// fallos concurrentes (varias conexiones locales tropezando con la
    /// misma sesión caída a la vez) en una sola reconexión real.
    last_reconnect: Option<Instant>,
}

struct Tunnel {
    local_port: u16,
    state: Mutex<TunnelState>,
}

static TUNNEL: OnceCell<Tunnel> = OnceCell::const_new();

const RECONNECT_DEBOUNCE: Duration = Duration::from_secs(2);

/// Devuelve el puerto local (127.0.0.1) que reenvía al servicio de
/// prácticas en la Pi, estableciendo el túnel (listener local + primera
/// sesión SSH) la primera vez que se necesita. Llamadas concurrentes
/// esperan la misma inicialización.
pub async fn ensure_tunnel(config: TunnelConfig) -> Result<u16> {
    let tunnel = TUNNEL
        .get_or_try_init(|| async {
            // Conectar de entrada (no perezoso): si la config está mal (host
            // o credenciales inválidas), `ensure_tunnel` tiene que fallar acá
            // mismo con un error claro, no silenciosamente más tarde en el
            // primer request real.
            let handle = connect_and_auth(&config).await?;
            let local_port = spawn_listener().await?;
            Ok::<_, anyhow::Error>(Tunnel {
                local_port,
                state: Mutex::new(TunnelState {
                    config,
                    handle: Some(Arc::new(Mutex::new(handle))),
                    last_reconnect: Some(Instant::now()),
                }),
            })
        })
        .await?;
    Ok(tunnel.local_port)
}

// Timeout PROPIO de cada paso de red de connect_and_auth -- crítico que sea
// acá adentro y no un timeout externo envolviéndolo: un timeout externo
// cancela la future desde afuera mientras está corriendo *dentro* de
// TUNNEL.get_or_try_init() (en la primera conexión) o del lock de `state`
// (en una reconexión), y aunque tokio libera el permit al cancelarse (en
// teoría permite reintentar), en la práctica se vio quedar sin volver a
// buscar nunca más una vez la Pi no respondía (bug reportado). Con el
// timeout acá adentro, esta función SIEMPRE termina por sí sola con Ok o
// Err.
const TUNNEL_STEP_TIMEOUT: Duration = Duration::from_secs(6);

async fn connect_and_auth(config: &TunnelConfig) -> Result<client::Handle<RusshClient>> {
    use std::net::ToSocketAddrs;

    let mut addrs = (config.host.as_str(), config.port)
        .to_socket_addrs()
        .map_err(|e| anyhow!("no se pudo resolver {}:{}: {e}", config.host, config.port))?;
    let addr = addrs
        .next()
        .ok_or_else(|| anyhow!("sin direcciones para {}:{}", config.host, config.port))?;

    let russh_config = Arc::new(client::Config::default());
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

    Ok(handle)
}

async fn spawn_listener() -> Result<u16> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| anyhow!("no se pudo abrir el listener local del túnel: {e}"))?;
    let local_port = listener.local_addr()?.port();

    tokio::spawn(async move {
        loop {
            let (stream, peer) = match listener.accept().await {
                Ok(v) => v,
                Err(e) => {
                    eprintln!("[linux_tunnel] error aceptando conexión local: {e}");
                    continue;
                }
            };
            tokio::spawn(async move {
                if let Err(e) = bridge(stream, peer).await {
                    eprintln!("[linux_tunnel] error en el túnel: {e}");
                }
            });
        }
    });

    Ok(local_port)
}

/// Reconecta la sesión SSH del túnel. Si otra conexión local ya reconectó
/// hace menos de `RECONNECT_DEBOUNCE`, reusa ESE handle en vez de abrir una
/// sesión SSH nueva en paralelo -- sin esto, una ráfaga de requests
/// llegando justo cuando la sesión se cae dispararía una reconexión por
/// cada una.
async fn reconnect(tunnel: &Tunnel) -> Result<Arc<Mutex<client::Handle<RusshClient>>>> {
    let mut state = tunnel.state.lock().await;

    if let Some(handle) = state.handle.clone() {
        let fresh = state
            .last_reconnect
            .map(|t| t.elapsed() < RECONNECT_DEBOUNCE)
            .unwrap_or(false);
        if fresh {
            return Ok(handle);
        }
    }

    eprintln!("[linux_tunnel] reconectando sesión SSH del túnel...");
    let config = state.config.clone();
    let new_handle = connect_and_auth(&config).await?;
    let new_handle = Arc::new(Mutex::new(new_handle));
    state.handle = Some(new_handle.clone());
    state.last_reconnect = Some(Instant::now());
    Ok(new_handle)
}

/// Copia bidireccional entre la conexión TCP local (el cliente HTTP) y un
/// canal `direct-tcpip` hacia el servicio en la Pi. Si la sesión SSH
/// compartida ya no sirve (se cayó desde el último uso), reconecta una vez
/// y reintenta antes de dar el error por bueno.
async fn bridge(mut stream: TcpStream, peer: SocketAddr) -> Result<()> {
    let tunnel = TUNNEL
        .get()
        .ok_or_else(|| anyhow!("túnel no inicializado"))?;

    let handle = {
        let state = tunnel.state.lock().await;
        state.handle.clone()
    };

    let (remote_host, remote_port) = {
        let state = tunnel.state.lock().await;
        (state.config.remote_host.clone(), state.config.remote_port)
    };

    // `None` (no debería pasar -- ensure_tunnel siempre deja un handle
    // puesto -- pero por las dudas) cae directo a reconectar, igual que un
    // intento fallido sobre un handle viejo.
    let first_attempt = match handle {
        Some(handle) => {
            let h = handle.lock().await;
            Some(
                h.channel_open_direct_tcpip(remote_host.clone(), remote_port as u32, peer.ip().to_string(), peer.port() as u32)
                    .await,
            )
        }
        None => None,
    };

    let mut channel = match first_attempt {
        Some(Ok(channel)) => channel,
        _ => {
            let handle = reconnect(tunnel).await?;
            let h = handle.lock().await;
            h.channel_open_direct_tcpip(remote_host, remote_port as u32, peer.ip().to_string(), peer.port() as u32)
                .await?
        }
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
