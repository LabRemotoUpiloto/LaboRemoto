use std::io::{Read, Write};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::AppHandle;
use tungstenite::handshake::server::{Request, Response};
use tungstenite::http::HeaderValue;

// ─────────────────────────────────────────────────────────────────────────────
// WS framing manual (post-handshake)
// ─────────────────────────────────────────────────────────────────────────────

/// Envía un frame WS binary (server→client, sin máscara)
fn ws_send_binary(stream: &mut std::net::TcpStream, data: &[u8]) -> std::io::Result<()> {
    let len = data.len();
    let mut hdr: Vec<u8> = Vec::with_capacity(10);
    hdr.push(0x82u8); // FIN=1, opcode=2 (binary)
    if len < 126 {
        hdr.push(len as u8);
    } else if len < 65536 {
        hdr.push(0x7E);
        hdr.extend_from_slice(&(len as u16).to_be_bytes());
    } else {
        hdr.push(0x7F);
        hdr.extend_from_slice(&(len as u64).to_be_bytes());
    }
    stream.write_all(&hdr)?;
    stream.write_all(data)
}

/// Envía un WS close frame (código 1000 Normal Closure)
fn ws_send_close(stream: &mut std::net::TcpStream) {
    let _ = stream.write_all(&[0x88, 0x02, 0x03, 0xE8]);
}

/// Buffer acumulador para recibir frames WS del cliente.
struct WsFrameParser {
    buf: Vec<u8>,
}

enum WsFrame {
    Binary(Vec<u8>),
    Close,
    Skip, // ping / pong / text / vacío
}

impl WsFrameParser {
    fn new() -> Self {
        Self { buf: Vec::with_capacity(131_072) }
    }

    fn read_frame(&mut self, stream: &mut std::net::TcpStream) -> std::io::Result<Option<WsFrame>> {
        let mut tmp = [0u8; 65536];
        match stream.read(&mut tmp) {
            Ok(0) => return Err(std::io::Error::from(std::io::ErrorKind::UnexpectedEof)),
            Ok(n) => self.buf.extend_from_slice(&tmp[..n]),
            Err(ref e) if matches!(
                e.kind(),
                std::io::ErrorKind::WouldBlock
                    | std::io::ErrorKind::TimedOut
                    | std::io::ErrorKind::Other
            ) => {}
            Err(e) => return Err(e),
        }
        self.try_parse()
    }

    fn try_parse(&mut self) -> std::io::Result<Option<WsFrame>> {
        if self.buf.len() < 2 {
            return Ok(None);
        }
        let b0 = self.buf[0];
        let b1 = self.buf[1];
        let opcode    = b0 & 0x0F;
        let masked    = (b1 & 0x80) != 0;
        let len_byte  = (b1 & 0x7F) as usize;

        let (hdr_ext, payload_len): (usize, usize) = if len_byte < 126 {
            (0, len_byte)
        } else if len_byte == 126 {
            if self.buf.len() < 4 { return Ok(None); }
            (2, u16::from_be_bytes([self.buf[2], self.buf[3]]) as usize)
        } else {
            if self.buf.len() < 10 { return Ok(None); }
            let mut b = [0u8; 8];
            b.copy_from_slice(&self.buf[2..10]);
            (8, u64::from_be_bytes(b) as usize)
        };

        let hdr_len  = 2 + hdr_ext;
        let mask_len = if masked { 4 } else { 0 };
        let total    = hdr_len + mask_len + payload_len;

        if self.buf.len() < total {
            return Ok(None);
        }

        let data_start = hdr_len + mask_len;
        let mut data = self.buf[data_start..total].to_vec();
        if masked {
            let key = [
                self.buf[hdr_len],
                self.buf[hdr_len + 1],
                self.buf[hdr_len + 2],
                self.buf[hdr_len + 3],
            ];
            for (i, b) in data.iter_mut().enumerate() {
                *b ^= key[i % 4];
            }
        }
        self.buf.drain(..total);

        Ok(Some(match opcode {
            0x0 | 0x2 => WsFrame::Binary(data),
            0x8       => WsFrame::Close,
            _         => WsFrame::Skip,
        }))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Port-forward local usando ssh2 (equivalente a ssh -L)
// ─────────────────────────────────────────────────────────────────────────────

pub fn run_port_forward(
    listener: std::net::TcpListener,
    host: String,
    port: u16,
    user: String,
    password: String,
    remote_port: u16,
    stop_flag: Arc<AtomicBool>,
) {
    loop {
        if stop_flag.load(Ordering::Relaxed) { return; }
        let mut local_conn = match listener.accept() {
            Ok((s, _)) => s,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(std::time::Duration::from_millis(10));
                continue;
            }
            Err(_) => break,
        };
        local_conn.set_nodelay(true).ok();

        let (h, u, p) = (host.clone(), user.clone(), password.clone());

        std::thread::spawn(move || {
            let Ok((_tcp, sess)) = crate::ssh::ssh2_sftp::connect_password(&h, port, &u, &p)
            else {
                return;
            };
            sess.set_blocking(true);
            sess.set_timeout(0);
            let Ok(mut channel) = sess.channel_direct_tcpip("127.0.0.1", remote_port, None)
            else {
                return;
            };

            if remote_port == 5900 {
                let mut diag_buf = [0u8; 64];
                sess.set_timeout(1000);
                match channel.read(&mut diag_buf) {
                    Ok(0) => {
                        let _ = local_conn.shutdown(std::net::Shutdown::Both);
                        let _ = channel.send_eof();
                        let _ = channel.close();
                        return;
                    }
                    Ok(n) => {
                        if local_conn.write_all(&diag_buf[..n]).is_err() {
                            let _ = local_conn.shutdown(std::net::Shutdown::Both);
                            let _ = channel.send_eof();
                            let _ = channel.close();
                            return;
                        }
                    }
                    Err(_) => {}
                }
            }

            sess.set_blocking(false);
            local_conn.set_read_timeout(Some(std::time::Duration::from_millis(1))).ok();
            local_conn.set_nodelay(true).ok();

            let mut buf = vec![0u8; 65536];
            loop {
                let mut progress = false;

                match channel.read(&mut buf) {
                    Ok(0) => { break; }
                    Ok(n) => {
                        progress = true;
                        if local_conn.write_all(&buf[..n]).is_err() { break; }
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
                    Err(_e) => { break; }
                }

                match local_conn.read(&mut buf) {
                    Ok(0) => { break; }
                    Ok(n) => {
                        progress = true;
                        sess.set_blocking(true);
                        let write_ok = channel.write_all(&buf[..n]).is_ok();
                        sess.set_blocking(false);
                        if !write_ok { break; }
                    }
                    Err(ref e) if matches!(e.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => {}
                    Err(_e) => { break; }
                }

                if !progress {
                    std::thread::sleep(std::time::Duration::from_millis(1));
                }
            }

            let _ = local_conn.shutdown(std::net::Shutdown::Both);
            let _ = channel.send_eof();
            let _ = channel.close();
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bridge WS ↔ VNC con ssh -L port-forward
// ─────────────────────────────────────────────────────────────────────────────

fn vnc_to_ws(mut vnc: std::net::TcpStream, mut ws: std::net::TcpStream) {
    let mut buf = vec![0u8; 65536];
    loop {
        match vnc.read(&mut buf) {
            Ok(0) => { break; }
            Ok(n) => {
                if ws_send_binary(&mut ws, &buf[..n]).is_err() { break; }
            }
            Err(_e) => { break; }
        }
    }
    ws_send_close(&mut ws);
    let _ = ws.shutdown(std::net::Shutdown::Both);
}

fn ws_to_vnc(mut ws: std::net::TcpStream, mut vnc: std::net::TcpStream) {
    ws.set_read_timeout(None).ok();
    let mut parser = WsFrameParser::new();
    loop {
        match parser.read_frame(&mut ws) {
            Ok(Some(WsFrame::Binary(data))) if !data.is_empty() => {
                if let Err(_e) = vnc.write_all(&data) { break; }
            }
            Ok(Some(WsFrame::Close)) => { break; }
            Err(ref e) if e.kind() == std::io::ErrorKind::UnexpectedEof => { break; }
            Err(_e) => { break; }
            _ => {}
        }
    }
    let _ = vnc.shutdown(std::net::Shutdown::Both);
}

pub fn handle_vnc_client(
    tcp_stream: std::net::TcpStream,
    _host: String,
    _port: u16,
    _user: String,
    _password: String,
    _vnc_port: u16,
    _display: u32,
    stop_flag: Arc<AtomicBool>,
    _app: AppHandle,
    _session_id: String,
    local_fwd_port: u16,
) {
    tcp_stream.set_nodelay(true).ok();

    let mut ws = match tungstenite::accept_hdr(
        tcp_stream,
        |req: &Request, mut resp: Response| {
            if let Some(proto) = req.headers().get("Sec-WebSocket-Protocol") {
                if proto.to_str().unwrap_or("").contains("binary") {
                    resp.headers_mut().insert(
                        "Sec-WebSocket-Protocol",
                        HeaderValue::from_static("binary"),
                    );
                }
            }
            Ok(resp)
        },
    ) {
        Ok(ws) => ws,
        Err(_e) => { return; }
    };

    let ws_stream = match ws.get_mut().try_clone() {
        Ok(s) => s,
        Err(_e) => {
            let _ = ws.close(None);
            return;
        }
    };
    drop(ws);
    ws_stream.set_nodelay(true).ok();

    let vnc_stream = match std::net::TcpStream::connect(format!("127.0.0.1:{local_fwd_port}")) {
        Ok(s) => {
            s.set_nodelay(true).ok();
            s
        }
        Err(_e) => {
            let mut ws_stream_err = ws_stream;
            ws_send_close(&mut ws_stream_err);
            return;
        }
    };

    let ws_for_vnc = match ws_stream.try_clone() {
        Ok(s) => s,
        Err(_e) => { return; }
    };
    let vnc_for_ws = match vnc_stream.try_clone() {
        Ok(s) => s,
        Err(_e) => { return; }
    };

    let stop = Arc::clone(&stop_flag);

    let h_vnc = std::thread::spawn(move || vnc_to_ws(vnc_for_ws, ws_for_vnc));

    let ws_stream2 = ws_stream;
    let h_ws  = std::thread::spawn(move || ws_to_vnc(ws_stream2, vnc_stream));

    loop {
        if stop.load(Ordering::Relaxed) { break; }
        if h_vnc.is_finished() || h_ws.is_finished() { break; }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }

    let _ = h_vnc.join();
    let _ = h_ws.join();
}

pub fn run_bridge_thread(
    ws_listener: std::net::TcpListener,
    host: String,
    port: u16,
    user: String,
    password: String,
    vnc_port: u16,
    display: u32,
    stop_flag: Arc<AtomicBool>,
    app: AppHandle,
    session_id: String,
    local_fwd_port: u16,
) {
    ws_listener.set_nonblocking(true).ok();
    loop {
        if stop_flag.load(Ordering::Relaxed) {
            return;
        }
        let tcp_stream = match ws_listener.accept() {
            Ok((s, _)) => s,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(std::time::Duration::from_millis(10));
                continue;
            }
            Err(_) => break,
        };
        let (h, u, p) = (host.clone(), user.clone(), password.clone());
        let stop    = Arc::clone(&stop_flag);
        let app_c   = app.clone();
        let sid     = session_id.clone();
        std::thread::spawn(move || {
            handle_vnc_client(
                tcp_stream, h, port, u, p, vnc_port, display,
                stop, app_c, sid, local_fwd_port,
            );
        });
    }
}
