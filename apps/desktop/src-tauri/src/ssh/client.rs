use anyhow::Result;
use russh::client::{self, Handle};
use russh::{Channel, ChannelMsg};
use std::{future::ready, net::ToSocketAddrs, sync::Arc};
use tokio::sync::{mpsc, Mutex};

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
    /// Handle compartible: Arc<Mutex<...>> permite clonar y pasar a tasks para
    /// abrir canales adicionales (direct-tcpip para port-forward) sin nuevo handshake.
    pub handle: Arc<Mutex<Handle<RusshClient>>>,
    pub tx: mpsc::UnboundedSender<ChanCmd>,
    pub resolved_addr: std::net::SocketAddr,
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

        // Enviar un marcador para saber cuándo la shell está lista y descartar el banner/MOTD inicial
        // Ej.: echo __TERM_READY__ (cualquier salida previa se silencia hasta ver este token)
        {
            let init_cmd: &[u8] = b"echo __TERM_READY__\r"; // simple y compatible
            let mut reader: &[u8] = init_cmd;
            // Ignorar error aquí (algunos shells muy antiguos podrían fallar); no es crítico
            let _ = ch.data(&mut reader).await;
        }

        // mpsc: comandos -> channel ; salida -> UI
        let (tx_cmd, mut rx_cmd) = mpsc::unbounded_channel::<ChanCmd>();
        let (tx_out, rx_out) = mpsc::unbounded_channel::<Vec<u8>>();

        // Tarea propietaria del Channel: multiplexa lectura (wait) y comandos (mpsc)
        tokio::spawn(async move {
            // Silenciar salida inicial hasta ver el marcador en una línea completa
            let marker: &[u8] = b"__TERM_READY__";
            let mut squelch = true;
            let mut pending: Vec<u8> = Vec::with_capacity(1024);

            // Busca una línea que contenga exactamente el marcador y devuelve el índice después del fin de línea
            let find_marker_line_end = |buf: &[u8]| -> Option<usize> {
                if buf.len() < marker.len() { return None; }
                let mut i = 0usize;
                while i + marker.len() <= buf.len() {
                    if &buf[i..i + marker.len()] == marker {
                        // Verificar borde izquierdo (inicio de línea)
                        let left_ok = if i == 0 { true } else { buf[i-1] == b'\n' || buf[i-1] == b'\r' };
                        if !left_ok { i += 1; continue; }
                        // Verificar borde derecho (fin de línea con \r?\n)
                        let j = i + marker.len();
                        if j < buf.len() {
                            if buf[j] == b'\r' && j + 1 < buf.len() && buf[j+1] == b'\n' { return Some(j + 2); }
                            if buf[j] == b'\n' { return Some(j + 1); }
                            // si no hay salto de línea aún, esperar más datos
                        }
                    }
                    i += 1;
                }
                None
            };
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
                                let bytes = data.as_ref();
                                if squelch {
                                    pending.extend_from_slice(bytes);
                                    if let Some(end_idx) = find_marker_line_end(&pending) {
                                        // Descarta todo lo acumulado hasta el final de la línea del marcador
                                        let remainder = if end_idx < pending.len() {
                                            Some(pending[end_idx..].to_vec())
                                        } else { None };
                                        pending.clear();
                                        squelch = false;
                                        if let Some(rest) = &remainder { let _ = tx_out.send(rest.clone()); }
                                    }
                                } else {
                                    let _ = tx_out.send(bytes.to_vec());
                                }
                            }
                            Some(ChannelMsg::ExtendedData { data, .. }) => {
                                let bytes = data.as_ref();
                                if squelch {
                                    pending.extend_from_slice(bytes);
                                    if let Some(end_idx) = find_marker_line_end(&pending) {
                                        let remainder = if end_idx < pending.len() {
                                            Some(pending[end_idx..].to_vec())
                                        } else { None };
                                        pending.clear();
                                        squelch = false;
                                        if let Some(rest) = &remainder { let _ = tx_out.send(rest.clone()); }
                                    }
                                } else {
                                    let _ = tx_out.send(bytes.to_vec());
                                }
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

        Ok((Session { handle: Arc::new(Mutex::new(handle)), tx: tx_cmd, resolved_addr: addr }, rx_out))
    }
}
