use anyhow::Result;
use russh::client::{self, Handle};
use russh::{Channel, ChannelMsg};
use std::{future::ready, net::ToSocketAddrs, sync::Arc};
use tokio::sync::mpsc;

/// Handler básico de russh.
#[derive(Clone, Default)]
pub struct RusshClient;

impl client::Handler for RusshClient {
    type Error = anyhow::Error;

    /// ⚠️ MVP: aceptar SIEMPRE la host key del servidor (sin known_hosts).
    /// En russh 0.50.x este método NO es async: devuelve un Future.
    fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::PublicKey,
    ) -> impl core::future::Future<Output = Result<bool, Self::Error>> + Send {
        ready(Ok(true))
    }
}

/// Comandos que enviaremos a la tarea que posee el Channel.
pub enum ChanCmd {
    Send(Vec<u8>),
    Resize { cols: u32, rows: u32 },
    Close,
}

/// Sesión de alto nivel (no guarda el Channel; expone un TX para comandos).
pub struct Session {
    pub handle: Handle<RusshClient>,
    pub tx: mpsc::UnboundedSender<ChanCmd>,
}

impl Session {
    /// Conecta, autentica, abre PTY+shell y lanza la tarea propietaria del canal.
    /// Devuelve: (Session, rx_out) por donde llegan bytes de salida.
    pub async fn connect_password(
        host: &str,
        port: u16,
        user: &str,
        pass: &str,
        cols: u32,
        rows: u32,
    ) -> Result<(Self, mpsc::UnboundedReceiver<Vec<u8>>)> {
        // Resolver destino
        let mut addrs = (host, port).to_socket_addrs()?;
        let addr = addrs
            .next()
            .ok_or_else(|| anyhow::anyhow!("no address"))?;

        // Conexión y auth
        let config = Arc::new(client::Config::default());
        let sh = RusshClient::default();
        let mut handle = client::connect(config, addr, sh).await?;

        match handle
            .authenticate_password(user.to_string(), pass.to_string())
            .await?
        {
            client::AuthResult::Success => {}
            other => return Err(anyhow::anyhow!("auth failed: {:?}", other)),
        }

        // Sesión + PTY + shell
        let mut ch: Channel<_> = handle.channel_open_session().await?;
        ch.request_pty(true, "xterm-256color", cols, rows, 0, 0, &[])
            .await?;
        ch.request_shell(true).await?;

        // mpsc: comandos -> channel ; salida -> UI
        let (tx_cmd, mut rx_cmd) = mpsc::unbounded_channel::<ChanCmd>();
        let (tx_out, rx_out) = mpsc::unbounded_channel::<Vec<u8>>();

        // Tarea propietaria del Channel: multiplexa lectura (wait) y comandos (mpsc)
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    // 1) Comandos desde UI
                    Some(cmd) = rx_cmd.recv() => {
                        match cmd {
                            ChanCmd::Send(buf) => {
                                // russh 0.50.x: Channel::data espera AsyncRead + Unpin
                                let mut reader: &[u8] = &buf; // &mut &[u8] implementa AsyncRead
                                if let Err(e) = ch.data(&mut reader).await {
                                    let _ = tx_out.send(format!("[write error] {e}\r\n").into_bytes());
                                    break;
                                }
                            }
                            ChanCmd::Resize { cols, rows } => {
                                if let Err(e) = ch.window_change(cols, rows, 0, 0).await {
                                    let _ = tx_out.send(format!("[resize error] {e}\r\n").into_bytes());
                                }
                            }
                            ChanCmd::Close => {
                                let _ = ch.close().await;
                                break;
                            }
                        }
                    }

                    // 2) Lectura por eventos
                    msg = ch.wait() => {
                        match msg {
                            Some(ChannelMsg::Data { data }) => {
                                let _ = tx_out.send(data.to_vec());
                            }
                            Some(ChannelMsg::ExtendedData { data, .. }) => {
                                let _ = tx_out.send(data.to_vec());
                            }
                            Some(_) => { /* otros eventos: ignorados */ }
                            None => {
                                let _ = tx_out.send("\r\n[conexión cerrada]\r\n".as_bytes().to_vec());
                                break;
                            }
                        }
                    }
                }
            }
        });

        Ok((Session { handle, tx: tx_cmd }, rx_out))
    }
}
