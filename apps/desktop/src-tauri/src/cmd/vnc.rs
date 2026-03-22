//! cmd/vnc.rs — Sesiones de escritorio gráfico remoto
//!
//! Ciclo de vida:
//!   vnc_start → detecta display/puerto libre → arranca Xvfb+Openbox+x11vnc
//!             → abre bridge WS↔SSH(direct-tcpip) → devuelve ws_port al frontend
//!   vnc_stop  → señala al bridge que pare → mata procesos remotos
//!
//! El bridge corre en un hilo OS dedicado. Lo inicia vnc_start y se detiene
//! automáticamente cuando se descarta el VncSessionState (Drop).

use std::io::{Read, Write};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tungstenite::handshake::server::{Request, Response};
use tungstenite::http::HeaderValue;

use crate::cmd::state::SESSIONS;
use crate::error::AppError;

// ─────────────────────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct VncSessionInfo {
    pub ws_port: u16,
    pub display: u32,
    pub vnc_port: u16,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum VncStatusResponse {
    NotStarted,
    Running { ws_port: u16, display: u32 },
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers SSH2 (bloqueantes, usados antes de que el bridge entre en el loop)
// ─────────────────────────────────────────────────────────────────────────────

fn run_remote(sess: &ssh2::Session, cmd: &str) -> Result<(i32, String), String> {
    let mut ch = sess.channel_session().map_err(|e| e.to_string())?;
    ch.exec(cmd).map_err(|e| e.to_string())?;
    let mut out = String::new();
    ch.read_to_string(&mut out).map_err(|e| e.to_string())?;
    let _ = ch.wait_close();
    let code = ch.exit_status().unwrap_or(-1);
    Ok((code, out))
}

// ─────────────────────────────────────────────────────────────────────────────
// Detección de recursos libres en el servidor remoto
// ─────────────────────────────────────────────────────────────────────────────

fn check_dependencies(sess: &ssh2::Session) -> Result<(), String> {
    let cmd = "MISS=''; \
        for B in Xvfb x11vnc openbox lxpanel pcmanfm dbus-launch; do \
            command -v \"$B\" >/dev/null 2>&1 || MISS=\"$MISS $B\"; \
        done; \
        [ -z \"$MISS\" ] && echo ok || echo \"MISSING:$MISS\"";
    let (_, out) = run_remote(sess, cmd)?;
    if out.trim().starts_with("MISSING:") {
        let pkgs = out.trim().trim_start_matches("MISSING:").trim();
        return Err(format!(
            "El servidor no tiene los paquetes requeridos:{pkgs}. \
             Instala con:\n  sudo apt install xvfb x11vnc openbox lxpanel pcmanfm dbus-x11"
        ));
    }
    Ok(())
}

fn find_free_display(sess: &ssh2::Session) -> Result<u32, String> {
    let (_, out) = run_remote(sess, "ls /tmp/.X*-lock 2>/dev/null || true")?;
    let used: Vec<u32> = out
        .lines()
        .filter_map(|l| {
            let name = l.trim().rsplit('/').next()?;
            let n = name.strip_prefix(".X")?.strip_suffix("-lock")?;
            n.parse().ok()
        })
        .collect();
    // Empezar desde :20 para evitar colisión con displays del sistema
    for n in 20u32..100 {
        if !used.contains(&n) {
            return Ok(n);
        }
    }
    Err("No hay display virtual libre (:20–:99 todos en uso)".to_string())
}

fn find_free_vnc_port(sess: &ssh2::Session) -> Result<u16, String> {
    let (_, out) = run_remote(
        sess,
        "ss -tlnp 2>/dev/null | awk '{print $4}' \
         | grep -oE ':[0-9]+$' | tr -d ':' || true",
    )?;
    let used: Vec<u16> = out.lines().filter_map(|l| l.trim().parse().ok()).collect();
    for p in 5900u16..5999 {
        if !used.contains(&p) {
            return Ok(p);
        }
    }
    Err("No hay puerto VNC libre (5900–5998 todos en uso)".to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// Ciclo de vida del servidor VNC en el host remoto
// ─────────────────────────────────────────────────────────────────────────────

fn start_vnc_server(
    sess: &ssh2::Session,
    display: u32,
    vnc_port: u16,
    resolution: &str,
) -> Result<(), String> {
    // Limpiar artefactos de sesiones anteriores en este display
    let _ = run_remote(
        sess,
        &format!(
            "rm -f /tmp/.X{display}-lock /tmp/.X11-unix/X{display} 2>/dev/null; true"
        ),
    );

    // 1. Display virtual
    // IMPORTANTE: </dev/null desconecta stdin del canal SSH; sin esto,
    // read_to_string() en run_remote se bloquea indefinidamente esperando
    // que el proceso en background cierre el descriptor heredado.
    run_remote(
        sess,
        &format!(
            "nohup Xvfb :{display} -screen 0 {resolution}x24 -ac \
             >/tmp/xvfb{display}.log 2>&1 </dev/null & echo started"
        ),
    )?;

    // Dar tiempo al Xvfb para crear el socket
    std::thread::sleep(std::time::Duration::from_secs(2));

    // Verificar que Xvfb está corriendo y el socket existe
    let (_, out) = run_remote(
        sess,
        &format!(
            "pgrep -f 'Xvfb :{display} ' >/dev/null && [ -S /tmp/.X11-unix/X{display} ] && echo ok || echo fail"
        ),
    )?;
    if out.trim() != "ok" {
        return Err(format!(
            "Xvfb no arrancó correctamente en el display :{display}. Revisa /tmp/xvfb{display}.log"
        ));
    }

    // 2. Entorno gráfico completo: lanzamos los componentes DIRECTAMENTE
    //    sin lxsession (que tiene dependencias de logind/ConsoleKit en SSH).
    //    Patrón xstartup estándar de TigerVNC/TightVNC:
    //      openbox (WM) → lxpanel (barra de tareas) → pcmanfm --desktop (iconos)
    //    Un script temporal agrupa todo bajo dbus-launch para tener D-Bus básico.
    //
    // Aislamiento por sesión — cada display tiene sus propios:
    //   - chromium wrapper + user-data-dir: /tmp/chromium-vnc-{display}
    //   - xstartup:                         /tmp/vnc-xstartup-{display}.sh
    //   - browser .desktop:                 /tmp/browser-{display}.desktop
    //   - lxpanel/pcmanfm profile:          lxde-pi-{display}  (copia de LXDE-pi)
    //   - openbox pid file:                 /tmp/openbox-{display}.pid
    // Así stop_vnc_server puede matar exactamente los procesos de este display.
    let chromium_dir = format!("/tmp/chromium-vnc-{display}");
    let xstartup_path = format!("/tmp/vnc-xstartup-{display}.sh");
    let panel_profile = format!("lxde-pi-{display}");
    let browser_desktop = format!("/tmp/browser-{display}.desktop");
    let webserver_desktop = format!("/tmp/webserver-{display}.desktop");

    // 0. Crear XDG_RUNTIME_DIR y el directorio de datos de Chromium
    //    XDG_RUNTIME_DIR DEBE existir antes de que cualquier proceso lo use;
    //    sin él, Chromium y otros procesos pierden acceso a sockets de red.
    run_remote(
        sess,
        &format!(
            "mkdir -p /tmp/xdg{display} {chromium_dir}/Default /home/pi/.local/bin /home/pi/Desktop; true"
        ),
    )?;

    // 1. Wrapper de chromium único para este display
    //    Flags clave para acceso a red dentro de Xvfb:
    //      --no-sandbox           → evita sandbox de kernel (no disponible en SSH)
    //      --disable-gpu          → sin GPU en display virtual
    //      --no-first-run         → salta welcome page
    //      --disable-dev-shm-usage → usa /tmp en vez de /dev/shm (evita crashes)
    run_remote(
        sess,
        &format!(
            "printf '#!/bin/sh\\nrm -f {chromium_dir}/SingletonLock {chromium_dir}/SingletonCookie 2>/dev/null\\nexec /usr/bin/chromium-browser --no-sandbox --disable-gpu --no-first-run --disable-dev-shm-usage --user-data-dir={chromium_dir} \"$@\"\\n' \
             > /home/pi/.local/bin/chromium-browser-{display} && chmod +x /home/pi/.local/bin/chromium-browser-{display}; true"
        ),
    )?;

    // 1b. Pre-configurar Chromium: Preferences para que arranque limpio
    //     y no muestre diálogos de primera ejecución que bloqueen la interfaz.
    run_remote(
        sess,
        &format!(
            "cat > {chromium_dir}/Default/Preferences << 'PREFS_EOF'\n\
{{\n\
  \"browser\": {{\n\
    \"has_seen_welcome_page\": true,\n\
    \"check_default_browser\": false\n\
  }},\n\
  \"session\": {{\n\
    \"restore_on_startup\": 4,\n\
    \"startup_urls\": [\"http://localhost:10000\"]\n\
  }},\n\
  \"distribution\": {{\n\
    \"skip_first_run_ui\": true,\n\
    \"suppress_first_run_default_browser_prompt\": true\n\
  }}\n\
}}\n\
PREFS_EOF\ntrue"
        ),
    )?;

    // 2. .desktop temporal para este display — apunta al wrapper correcto
    run_remote(
        sess,
        &format!(
            "printf '[Desktop Entry]\\nVersion=1.0\\nName=Web Browser\\nExec=/home/pi/.local/bin/chromium-browser-{display}\\nIcon=chromium-browser\\nType=Application\\nCategories=Network;WebBrowser;\\n' \
             > {browser_desktop}; true"
        ),
    )?;

    // 2b. Acceso directo en el escritorio para ver páginas del Servidor Web (Apache)
    //     Apunta a http://localhost:10000 — cualquier página en /var/www/html será accesible
    //     desde aquí navegando normalmente dentro de Chromium.
    run_remote(
        sess,
        &format!(
            "printf '[Desktop Entry]\\nVersion=1.0\\nName=Servidor Web Local\\nComment=Ver páginas de Apache (localhost:10000)\\nExec=/home/pi/.local/bin/chromium-browser-{display} http://localhost:10000\\nIcon=text-html\\nType=Application\\nCategories=Network;WebBrowser;\\n' \
             > {webserver_desktop} && \
             cp {webserver_desktop} /home/pi/Desktop/servidor-web.desktop 2>/dev/null && \
             chmod +x /home/pi/Desktop/servidor-web.desktop 2>/dev/null; true"
        ),
    )?;

    // 3. Copiar perfil LXDE-pi para lxpanel y pcmanfm, sustituir botón del browser
    //    por el .desktop temporal de este display. Buscamos primero en el home
    //    y si no existe, en el sistema.
    run_remote(
        sess,
        &format!(
            "mkdir -p /home/pi/.config/lxpanel/{panel_profile}/panels && \
             if [ -f /home/pi/.config/lxpanel/LXDE-pi/panels/panel ]; then \
                cp /home/pi/.config/lxpanel/LXDE-pi/panels/panel /home/pi/.config/lxpanel/{panel_profile}/panels/panel; \
             elif [ -f /etc/xdg/lxpanel/LXDE-pi/panels/panel ]; then \
                cp /etc/xdg/lxpanel/LXDE-pi/panels/panel /home/pi/.config/lxpanel/{panel_profile}/panels/panel; \
             fi; \
             [ -f /home/pi/.config/lxpanel/{panel_profile}/panels/panel ] && \
             sed -i 's|id=lxde-x-www-browser.desktop|id={browser_desktop}|g' \
                /home/pi/.config/lxpanel/{panel_profile}/panels/panel; \
             \
             mkdir -p /home/pi/.config/pcmanfm/{panel_profile} && \
             if [ -d /home/pi/.config/pcmanfm/LXDE-pi ]; then \
                cp -r /home/pi/.config/pcmanfm/LXDE-pi/. /home/pi/.config/pcmanfm/{panel_profile}/; \
             elif [ -d /etc/xdg/pcmanfm/LXDE-pi ]; then \
                cp -r /etc/xdg/pcmanfm/LXDE-pi/. /home/pi/.config/pcmanfm/{panel_profile}/; \
             fi; \
             true"
        ),
    )?;

    // 4. xstartup único — exporta TODAS las variables de entorno necesarias
    //    para que los procesos hijos (especialmente Chromium desde lxpanel)
    //    hereden el entorno completo y puedan acceder a la red (localhost/Apache).
    //    Sin estas exports, Chromium no puede resolver localhost ni conectarse.
    run_remote(
        sess,
        &format!(
            "printf '#!/bin/sh\\n\
export DISPLAY=:{display}\\n\
export HOME=/home/pi\\n\
export XDG_RUNTIME_DIR=/tmp/xdg{display}\\n\
export XDG_DATA_HOME=/home/pi/.local/share\\n\
export XDG_DATA_DIRS=/home/pi/.local/share:/usr/local/share:/usr/share\\n\
export PATH=/home/pi/.local/bin:/usr/local/bin:/usr/bin:/bin\\n\
rm -f {chromium_dir}/SingletonLock {chromium_dir}/SingletonCookie 2>/dev/null\\n\
openbox >/tmp/openbox{display}.log 2>&1 & echo $! > /tmp/openbox-{display}.pid\\n\
sleep 2\\n\
lxpanel --profile {panel_profile} >/tmp/lxpanel{display}.log 2>&1 &\\n\
pcmanfm --desktop --profile {panel_profile} >/tmp/pcmanfm{display}.log 2>&1 &\\n\
wait\\n' \
             > {xstartup_path} && chmod +x {xstartup_path}; true"
        ),
    )?;
    run_remote(
        sess,
        &format!(
            "DISPLAY=:{display} HOME=/home/pi XDG_RUNTIME_DIR=/tmp/xdg{display} \
             XDG_DATA_HOME=/home/pi/.local/share \
             XDG_DATA_DIRS=/home/pi/.local/share:/usr/local/share:/usr/share \
             PATH=/home/pi/.local/bin:/usr/local/bin:/usr/bin:/bin \
             nohup dbus-launch --exit-with-session {xstartup_path} \
             >/tmp/lxsession{display}.log 2>&1 </dev/null & echo started"
        ),
    )?;

    // Dar tiempo al DE para que levante el compositor, panel y escritorio
    std::thread::sleep(std::time::Duration::from_secs(5));

    // 3. Servidor VNC: sin contraseña, persistente.
    // -localhost se omite porque la seguridad la provee el túnel SSH;
    // además, con algunas versiones de sshd/x11vnc el check falla si
    // la conexión llega como ::1 (IPv6 loopback) en lugar de 127.0.0.1.
    run_remote(
        sess,
        &format!(
            "nohup x11vnc -display :{display} -rfbport {vnc_port} \
             -nopw -shared -forever -noxdamage -xrandr resize \
             >/tmp/x11vnc{display}.log 2>&1 </dev/null & echo started"
        ),
    )?;

    // Dar tiempo a que x11vnc abra su puerto
    std::thread::sleep(std::time::Duration::from_secs(2));

    // 4. Verificar que x11vnc está escuchando
    let (_, out) = run_remote(
        sess,
        &format!(
            "ss -tlnp 2>/dev/null | grep -q ':{vnc_port}' && echo ok \
             || (echo fail; tail -8 /tmp/x11vnc{display}.log 2>/dev/null)"
        ),
    )?;

    if !out.trim().starts_with("ok") {
        let log_lines: String = out.lines().skip(1).collect::<Vec<_>>().join(" | ");
        let _ = stop_vnc_server(sess, display, vnc_port);
        return Err(format!(
            "x11vnc no arrancó en el puerto {vnc_port}. Log: {log_lines}"
        ));
    }

    Ok(())
}

pub fn stop_vnc_server(
    sess: &ssh2::Session,
    display: u32,
    vnc_port: u16,
) -> Result<(), String> {
    // Matar SOLO los procesos de este display usando los identificadores únicos:
    //   - x11vnc por puerto  (único por sesión)
    //   - openbox por pid file guardado en el xstartup
    //   - lxpanel/pcmanfm por nombre de perfil único
    //   - Xvfb por número de display
    // NO se usa 'pkill openbox' global porque mataría otras sesiones activas.
    let xstartup_path = format!("/tmp/vnc-xstartup-{display}.sh");
    let panel_profile = format!("lxde-pi-{display}");
    let browser_desktop = format!("/tmp/browser-{display}.desktop");
    let webserver_desktop = format!("/tmp/webserver-{display}.desktop");
    let _ = run_remote(
        sess,
        &format!(
            "pkill -f 'x11vnc.*rfbport {vnc_port}' 2>/dev/null; \
             pkill -f '{xstartup_path}' 2>/dev/null; \
             kill $(cat /tmp/openbox-{display}.pid 2>/dev/null) 2>/dev/null; \
             pkill -f 'lxpanel.*{panel_profile}' 2>/dev/null; \
             pkill -f 'pcmanfm.*{panel_profile}' 2>/dev/null; \
             pkill -f 'Xvfb :{display} ' 2>/dev/null; \
             rm -f /tmp/.X{display}-lock /tmp/.X11-unix/X{display} \
                   {xstartup_path} /tmp/openbox-{display}.pid \
                   {browser_desktop} {webserver_desktop} \
                   /home/pi/Desktop/servidor-web.desktop 2>/dev/null; \
             rm -rf /tmp/xdg{display} 2>/dev/null; \
             true"
        ),
    );
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Bridge bidireccional WS ↔ canal SSH direct-tcpip
//
// run_bridge_thread: loop de aceptación de conexiones WS.
// handle_vnc_client: maneja una sola conexión WS↔VNC en un hilo OS dedicado.
//
// Diseño de I/O:
//   - WS stream en NON-BLOCKING → ws.read() devuelve WouldBlock si no hay datos.
//   - ssh2 session con set_timeout(80ms) en modo BLOCKING → channel.read()
//     devuelve TimedOut/WouldBlock si no hay datos; las ESCRITURAS no sufren
//     EAGAIN porque ssh2 las bufferiza internamente.
//   - ws.close(None) siempre se llama al salir para evitar código 1006 en noVNC.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// WS framing manual (post-handshake)
//
// tungstenite usa BufReader internamente. Si set_read_timeout interrumpe a
// mitad de un frame, el BufReader queda en estado inconsistente y tungstenite
// cierra la conexión → código 1005 en noVNC.
//
// Solución: usamos tungstenite SOLO para el handshake HTTP/WS, luego
// recuperamos el TcpStream con ws.into_inner() y hacemos el framing manualmente.
//
// El WsFrameParser acumula bytes en un Vec propio → si el read_timeout
// interrumpe en mitad de un frame, los bytes NO se pierden y se completan
// en el siguiente ciclo del loop.
// ─────────────────────────────────────────────────────────────────────────────

/// Envía un frame WS binary (server→client, sin máscara — servers no enmascaran)
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

/// Envía un WS close frame (código 1000 Normal Closure) al cliente
fn ws_send_close(stream: &mut std::net::TcpStream) {
    let _ = stream.write_all(&[0x88, 0x02, 0x03, 0xE8]);
}

/// Buffer acumulador para recibir frames WS del cliente.
/// Los clientes WS SIEMPRE enmascaran sus frames (RFC 6455 §5.3).
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

    /// Lee bytes del TcpStream y devuelve el siguiente frame completo si hay
    /// suficientes bytes. Devuelve Ok(None) si el frame aún no está completo
    /// (timeout o datos parciales). Solo devuelve Err en EOF o error fatal.
    fn read_frame(&mut self, stream: &mut std::net::TcpStream) -> std::io::Result<Option<WsFrame>> {
        let mut tmp = [0u8; 65536];
        match stream.read(&mut tmp) {
            Ok(0) => return Err(std::io::Error::from(std::io::ErrorKind::UnexpectedEof)),
            Ok(n) => self.buf.extend_from_slice(&tmp[..n]),
            // TimedOut / WouldBlock / Other = timeout de 5ms sin datos → usar buf actual
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
            return Ok(None); // frame incompleto, esperar más bytes
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
            0x0 | 0x2 => WsFrame::Binary(data), // continuation o binary
            0x8       => WsFrame::Close,
            _         => WsFrame::Skip,          // ping/pong/text
        }))
    }
}

// ─────────────────────────────────────────────────────────────────────────────

// ── Diagnóstico + auto-reinicio de x11vnc cuando hay EOF prematuro ──────────
fn restart_x11vnc_log_and_notify(
    host: &str, port: u16, user: &str, password: &str,
    display: u32, vnc_port: u16,
    app: &AppHandle, session_id: &str,
) {
    eprintln!("[vnc-bridge] Diagnóstico post-EOF: conectando SSH...");
    let Ok((_tcp, sess)) = crate::ssh::ssh2_sftp::connect_password(host, port, user, password)
    else {
        eprintln!("[vnc-bridge] No se pudo SSH para diagnóstico");
        return;
    };

    // Leer log de x11vnc
    if let Ok((_, log)) = run_remote(
        &sess,
        &format!("tail -40 /tmp/x11vnc{display}.log 2>/dev/null"),
    ) {
        eprintln!("[vnc-bridge] === x11vnc log (últimas 40 líneas) ===\n{log}\n===");
    }

    // Verificar Xvfb
    if let Ok((_, xvfb)) = run_remote(&sess, "pgrep -fl Xvfb 2>/dev/null || echo sin-Xvfb") {
        eprintln!("[vnc-bridge] Xvfb: {}", xvfb.trim());
    }

    // Reiniciar x11vnc
    eprintln!("[vnc-bridge] Reiniciando x11vnc en display :{display} port {vnc_port}...");
    let restart = format!(
        "pkill -f 'x11vnc.*rfbport {vnc_port}' 2>/dev/null; sleep 1; \
         nohup x11vnc -display :{display} -rfbport {vnc_port} \
         -nopw -localhost -shared -forever -noxdamage -quiet \
         >/tmp/x11vnc{display}.log 2>&1 </dev/null & sleep 3 && \
         ss -tlnp 2>/dev/null | grep -q ':{vnc_port}' && echo ok || echo fail"
    );
    match run_remote(&sess, &restart) {
        Ok((_, out)) if out.trim() == "ok" => {
            eprintln!("[vnc-bridge] x11vnc reiniciado — puedes reconectar");
            let _ = app.emit(
                &format!("vnc_retry_ready_{session_id}"),
                serde_json::json!({ "reason": "x11vnc reiniciado automáticamente" }),
            );
        }
        Ok((_, out)) => eprintln!("[vnc-bridge] reinicio x11vnc falló: {out}"),
        Err(e)       => eprintln!("[vnc-bridge] reinicio x11vnc error: {e}"),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Port-forward local usando ssh2 (equivalente a ssh -L)
//
// Por cada conexión TCP local, abre un channel_direct_tcpip en una sesión
// ssh2 nueva y hace copy bidireccional en dos hilos.
// ─────────────────────────────────────────────────────────────────────────────
fn run_port_forward(
    listener: std::net::TcpListener,
    host: String,
    port: u16,
    user: String,
    password: String,
    vnc_port: u16,
    stop_flag: Arc<AtomicBool>,
) {
    // El listener ya viene en modo no-bloqueante desde vnc_start
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

        // Un único hilo por conexión: ssh2::Channel no es Send, así que todo
        // el forwarding ocurre en el mismo hilo con polling de 5 ms.
        std::thread::spawn(move || {
            let Ok((_tcp, sess)) = crate::ssh::ssh2_sftp::connect_password(&h, port, &u, &p)
            else {
                eprintln!("[vnc-fwd] SSH connect falló para el port-forward");
                return;
            };
            sess.set_blocking(true);
            // timeout=0 → infinito en libssh2; lo cambiaremos a 5 ms para el poll
            sess.set_timeout(0);
            let Ok(mut channel) = sess.channel_direct_tcpip("127.0.0.1", vnc_port, None)
            else {
                eprintln!("[vnc-fwd] channel_direct_tcpip({vnc_port}) falló");
                return;
            };
            eprintln!("[vnc-fwd] Canal abierto hacia x11vnc:{vnc_port}");

            // ── Lectura diagnóstica: 1 s de espera para el saludo RFB ────────
            // Si x11vnc manda el saludo ("RFB 003.xxx\n", 12 bytes) antes de
            // 1 segundo lo veremos aquí. Si no manda nada o manda EOF,
            // sabremos que x11vnc rechaza la conexión por algún motivo.
            let mut diag_buf = [0u8; 64];
            sess.set_timeout(1000);
            match channel.read(&mut diag_buf) {
                Ok(0) => {
                    eprintln!("[vnc-fwd] DIAGNÓSTICO: x11vnc cerró sin enviar datos (EOF inmediato)");
                    let _ = local_conn.shutdown(std::net::Shutdown::Both);
                    let _ = channel.send_eof();
                    let _ = channel.close();
                    return;
                }
                Ok(n) => {
                    eprintln!(
                        "[vnc-fwd] DIAGNÓSTICO: x11vnc envió {} bytes: {:?}",
                        n,
                        std::str::from_utf8(&diag_buf[..n]).unwrap_or("<binary>")
                    );
                    // Reenviar al bridge
                    if local_conn.write_all(&diag_buf[..n]).is_err() {
                        let _ = local_conn.shutdown(std::net::Shutdown::Both);
                        let _ = channel.send_eof();
                        let _ = channel.close();
                        return;
                    }
                }
                Err(e) => {
                    eprintln!("[vnc-fwd] DIAGNÓSTICO: timeout/error en primera lectura ({e})");
                    // Continuar de todas formas — puede ser alta latencia
                }
            }
            // ────────────────────────────────────────────────────────────────

            // Modo no-bloqueante para el poll: EAGAIN = sin datos, Ok(0) = EOF real.
            sess.set_blocking(false);
            local_conn.set_nonblocking(true).ok();
            local_conn.set_nodelay(true).ok();

            let mut buf = vec![0u8; 65536];
            loop {
                let mut progress = false;

                // ── SSH channel → local TCP ──────────────────────────────────
                match channel.read(&mut buf) {
                    Ok(0) => {
                        eprintln!("[vnc-fwd] SSH channel EOF");
                        break;
                    }
                    Ok(n) => {
                        progress = true;
                        if local_conn.write_all(&buf[..n]).is_err() {
                            eprintln!("[vnc-fwd] Error escribiendo en local_conn");
                            break;
                        }
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
                    Err(e) => {
                        eprintln!("[vnc-fwd] SSH read err: {e}");
                        break;
                    }
                }

                // ── local TCP → SSH channel ──────────────────────────────────
                match local_conn.read(&mut buf) {
                    Ok(0) => {
                        eprintln!("[vnc-fwd] local_conn EOF");
                        break;
                    }
                    Ok(n) => {
                        progress = true;
                        sess.set_blocking(true);
                        let write_ok = channel.write_all(&buf[..n]).is_ok();
                        sess.set_blocking(false);
                        if !write_ok {
                            eprintln!("[vnc-fwd] Error escribiendo en channel");
                            break;
                        }
                    }
                    Err(ref e)
                        if matches!(
                            e.kind(),
                            std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                        ) =>
                    {}
                    Err(e) => {
                        eprintln!("[vnc-fwd] Error leyendo local_conn: {e}");
                        break;
                    }
                }

                if !progress {
                    std::thread::sleep(std::time::Duration::from_millis(1));
                }
            }

            let _ = local_conn.shutdown(std::net::Shutdown::Both);
            let _ = channel.send_eof();
            let _ = channel.close();
            eprintln!("[vnc-fwd] Sesión port-forward terminada");
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bridge WS ↔ VNC con ssh -L port-forward
//
// Arquitectura:
//   1. Lanzamos `ssh -L local_fwd_port:127.0.0.1:vnc_port remote_host` como
//      proceso hijo. Esto crea un tunnel TCP local completamente transparente.
//   2. Aceptamos la conexión WS de noVNC (ws_stream).
//   3. Conectamos un TcpStream al puerto local del tunnel (vnc_stream).
//   4. Dos hilos OS hacen `std::io::copy` bidireccional enmarcando/desenmarcando
//      frames WS. Ambos streams son TcpStream puro — no hay problemas de
//      threading de ssh2.
//
// El framing WS es manual (igual que antes) para evitar el BufReader de
// tungstenite que corrompe el estado con read_timeout.
// ─────────────────────────────────────────────────────────────────────────────

/// Copia en loop: lee del canal VNC (TcpStream raw) y envía frames WS binary.
/// Termina cuando VNC cierra o hay error de escritura en WS.
fn vnc_to_ws(mut vnc: std::net::TcpStream, mut ws: std::net::TcpStream) {
    let mut buf = vec![0u8; 65536];
    loop {
        match vnc.read(&mut buf) {
            Ok(0) => { eprintln!("[vnc→ws] VNC EOF"); break; }
            Ok(n) => {
                if ws_send_binary(&mut ws, &buf[..n]).is_err() {
                    eprintln!("[vnc→ws] Error enviando frame WS");
                    break;
                }
            }
            Err(e) => { eprintln!("[vnc→ws] Error leyendo VNC: {e}"); break; }
        }
    }
    // Señalizar al otro hilo cerrando el socket WS
    ws_send_close(&mut ws);
    let _ = ws.shutdown(std::net::Shutdown::Both);
}

/// Copia en loop: lee frames WS del cliente noVNC y escribe al canal VNC.
/// Termina cuando WS cierra o hay error de escritura en VNC.
fn ws_to_vnc(mut ws: std::net::TcpStream, mut vnc: std::net::TcpStream) {
    ws.set_read_timeout(None).ok(); // bloqueante puro
    let mut parser = WsFrameParser::new();
    loop {
        match parser.read_frame(&mut ws) {
            Ok(Some(WsFrame::Binary(data))) if !data.is_empty() => {
                if let Err(e) = vnc.write_all(&data) {
                    eprintln!("[ws→vnc] Error escribiendo VNC: {e}");
                    break;
                }
            }
            Ok(Some(WsFrame::Close)) => {
                eprintln!("[ws→vnc] noVNC envió Close");
                break;
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::UnexpectedEof => {
                eprintln!("[ws→vnc] WS EOF");
                break;
            }
            Err(e) => { eprintln!("[ws→vnc] Error leyendo WS: {e}"); break; }
            _ => {}
        }
    }
    let _ = vnc.shutdown(std::net::Shutdown::Both);
}

fn handle_vnc_client(
    tcp_stream: std::net::TcpStream,
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
    tcp_stream.set_nodelay(true).ok();
    eprintln!("[vnc-bridge] Nueva conexión WS — tunnel en 127.0.0.1:{local_fwd_port}");

    // WS handshake con tungstenite (bloqueante)
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
        Err(e) => { eprintln!("[vnc-bridge] WS handshake failed: {e}"); return; }
    };

    // Obtener TcpStream raw del WS (BufReader interno vacío en este punto)
    let ws_stream = match ws.get_mut().try_clone() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[vnc-bridge] try_clone WS failed: {e}");
            let _ = ws.close(None);
            return;
        }
    };
    drop(ws);
    ws_stream.set_nodelay(true).ok();

    // Conectar al port-forward local (el tunnel ssh -L ya está activo)
    let vnc_stream = match std::net::TcpStream::connect(
        format!("127.0.0.1:{local_fwd_port}")
    ) {
        Ok(s) => {
            s.set_nodelay(true).ok();
            eprintln!("[vnc-bridge] Conectado al tunnel VNC local:{local_fwd_port}");
            s
        }
        Err(e) => {
            eprintln!("[vnc-bridge] No se pudo conectar al tunnel local:{local_fwd_port}: {e}");
            let mut ws_stream_err = ws_stream;
            ws_send_close(&mut ws_stream_err);
            return;
        }
    };

    // Dos hilos bidireccionales — ambos son TcpStream puro (Send + Clone)
    let ws_for_vnc = match ws_stream.try_clone() {
        Ok(s) => s,
        Err(e) => { eprintln!("[vnc-bridge] try_clone ws_for_vnc: {e}"); return; }
    };
    let vnc_for_ws = match vnc_stream.try_clone() {
        Ok(s) => s,
        Err(e) => { eprintln!("[vnc-bridge] try_clone vnc_for_ws: {e}"); return; }
    };

    let stop = Arc::clone(&stop_flag);

    // Hilo VNC → WS (bloqueante en vnc.read)
    let h_vnc = std::thread::spawn(move || vnc_to_ws(vnc_for_ws, ws_for_vnc));

    // Hilo WS → VNC (bloqueante en ws.read)
    let ws_stream2 = ws_stream;
    let h_ws  = std::thread::spawn(move || ws_to_vnc(ws_stream2, vnc_stream));

    // Esperar a que cualquiera de los dos hilos termine
    loop {
        if stop.load(Ordering::Relaxed) {
            break;
        }
        if h_vnc.is_finished() || h_ws.is_finished() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }

    eprintln!("[vnc-bridge] Conexión terminada (session_id={session_id})");
    // Los hilos terminarán solos al cerrarse sus sockets por el shutdown()
    // que cada uno llama en su propio loop de error.
    let _ = h_vnc.join();
    let _ = h_ws.join();
}

fn run_bridge_thread(
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



// ─────────────────────────────────────────────────────────────────────────────
// Comandos Tauri
// ─────────────────────────────────────────────────────────────────────────────

/// Inicia una sesión de escritorio gráfico sobre una conexión SSH activa.
///
/// - Verifica que el servidor tenga Xvfb, x11vnc y openbox instalados.
/// - Detecta un display virtual y puerto VNC libres.
/// - Arranca la cadena Xvfb → Openbox → x11vnc en el servidor remoto.
/// - Levanta un bridge WS↔SSH en un hilo local y devuelve el puerto local.
/// - Si ya existe una sesión gráfica activa para `session_id`, la devuelve.
#[tauri::command]
pub async fn vnc_start(
    app: AppHandle,
    session_id: String,
    resolution: Option<String>,
) -> Result<VncSessionInfo, String> {
    let res = resolution.unwrap_or_else(|| "1280x720".to_string());

    // Validar resolución para evitar inyección de parámetro shell
    const VALID: &[&str] = &["1024x768", "1280x720", "1280x800", "1920x1080"];
    if !VALID.contains(&res.as_str()) {
        return Err(format!(
            "Resolución inválida '{res}'. Opciones: {}",
            VALID.join(", ")
        ));
    }

    // Leer credenciales de la sesión SSH activa en memoria
    let (host, port, user, password) = {
        let map = SESSIONS.lock().map_err(|e| e.to_string())?;
        let sess = map
            .get(&session_id)
            .ok_or_else(|| AppError::NotFoundSession.to_string())?;

        // Si ya existe una sesión gráfica, devolver el estado actual
        if let Some(vnc) = &sess.vnc_session {
            return Ok(VncSessionInfo {
                ws_port: vnc.ws_port_local,
                display: vnc.display_num,
                vnc_port: vnc.vnc_port_remote,
            });
        }

        (
            sess.host.clone(),
            sess.port,
            sess.user.clone(),
            sess.password.clone(),
        )
    };

    // Todo el setup SSH (bloqueante) corre en un hilo dedicado para no
    // bloquear el executor async de Tokio.
    let h = host.clone();
    let u = user.clone();
    let p = password.clone();
    let r = res.clone();

    let (display, vnc_port, ws_listener, local_fwd_port) =
        tokio::task::spawn_blocking(move || -> Result<(u32, u16, std::net::TcpListener, u16), String> {
            let (_tcp_setup, setup_sess) =
                crate::ssh::ssh2_sftp::connect_password(&h, port, &u, &p)
                    .map_err(|e| format!("Conexión SSH para setup VNC falló: {e}"))?;

            check_dependencies(&setup_sess)?;

            let display  = find_free_display(&setup_sess)?;
            let vnc_port = find_free_vnc_port(&setup_sess)?;

            start_vnc_server(&setup_sess, display, vnc_port, &r)?;

            // Listener WS local en un puerto aleatorio asignado por el SO
            let ws_listener = std::net::TcpListener::bind("127.0.0.1:0")
                .map_err(|e| format!("No se pudo abrir el listener WS local: {e}"))?;

            // Puerto local para el ssh -L tunnel hacia x11vnc
            let fwd_listener = std::net::TcpListener::bind("127.0.0.1:0")
                .map_err(|e| format!("No se pudo reservar puerto local para ssh -L: {e}"))?;
            let local_fwd_port = fwd_listener
                .local_addr()
                .map_err(|e| e.to_string())?
                .port();
            // Cerramos el listener temporal — el puerto queda libre para ssh -L
            drop(fwd_listener);

            Ok((display, vnc_port, ws_listener, local_fwd_port))
        })
        .await
        .map_err(|e| format!("Error interno (spawn_blocking): {e}"))??
    ;

    let ws_port = ws_listener
        .local_addr()
        .map_err(|e| e.to_string())?
        .port();

    let stop_flag  = Arc::new(AtomicBool::new(false));
    let stop_clone = stop_flag.clone();
    let (h, u, p)  = (host.clone(), user.clone(), password.clone());

    // ── Port-forward local usando ssh2 (no el binario ssh) ──────────────────
    // Razón: el servidor autentica con contraseña; el binario `ssh` no puede
    // recibirla de forma no interactiva sin sshpass (que no está disponible en
    // Windows). En cambio, abrimos un TcpListener local y por cada conexión
    // creamos un channel_direct_tcpip en una sesión ssh2 dedicada.
    //
    // Este es el mismo principio que websockify/stunnel: TCP local ↔ SSH tunnel.
    //
    // El hilo port-forward corre en background hasta que stop_flag se activa.
    let fwd_h = host.clone();
    let fwd_u = user.clone();
    let fwd_p = password.clone();
    let fwd_stop = stop_flag.clone();

    // Listener local que noVNC/bridge usará para hablar con x11vnc
    let fwd_listener = std::net::TcpListener::bind(format!("127.0.0.1:{local_fwd_port}"))
        .map_err(|e| format!("No se pudo abrir port-forward listener en {local_fwd_port}: {e}"))?;
    fwd_listener.set_nonblocking(true).ok();

    std::thread::Builder::new()
        .name(format!("vnc-fwd-{session_id}"))
        .spawn(move || {
            run_port_forward(fwd_listener, fwd_h, port, fwd_u, fwd_p, vnc_port, fwd_stop);
        })
        .map_err(|e| format!("No se pudo lanzar el hilo port-forward: {e}"))?;

    // Dar tiempo al hilo port-forward para que esté listo
    std::thread::sleep(std::time::Duration::from_millis(100));

    // Dummy child para el campo ssh_fwd_child (no usamos proceso externo)
    let ssh_fwd_child: Option<std::process::Child> = None;

    let app_bridge = app.clone();
    let sid_bridge = session_id.clone();
    let bridge = std::thread::Builder::new()
        .name(format!("vnc-bridge-{session_id}"))
        .spawn(move || {
            run_bridge_thread(
                ws_listener, h, port, u, p, vnc_port, display, stop_clone,
                app_bridge, sid_bridge, local_fwd_port,
            );
        })
        .map_err(|e| format!("No se pudo lanzar el hilo bridge VNC: {e}"))?;

    // Persistir estado en la sesión SSH
    {
        let mut map = SESSIONS.lock().map_err(|e| e.to_string())?;
        let sess = map
            .get_mut(&session_id)
            .ok_or_else(|| AppError::NotFoundSession.to_string())?;
        sess.vnc_session = Some(crate::cmd::state::VncSessionState {
            display_num: display,
            vnc_port_remote: vnc_port,
            ws_port_local: ws_port,
            stop_flag,
            bridge_thread: Some(bridge),
            ssh_fwd_child,
            host,
            port,
            user,
            password,
        });
    }

    let _ = app.emit(
        &format!("vnc_ready_{session_id}"),
        serde_json::json!({ "ws_port": ws_port, "display": display }),
    );

    Ok(VncSessionInfo {
        ws_port,
        display,
        vnc_port,
    })
}

/// Detiene la sesión gráfica activa: para el bridge WS y mata los procesos
/// remotos (Xvfb, Openbox, x11vnc).
#[tauri::command]
pub async fn vnc_stop(session_id: String) -> Result<(), String> {
    if let Ok(mut map) = SESSIONS.lock() {
        if let Some(sess) = map.get_mut(&session_id) {
            // Drop del VncSessionState activa su impl Drop → cleanup automático
            drop(sess.vnc_session.take());
        }
    }
    Ok(())
}

/// Consulta el estado de la sesión gráfica para un session_id dado.
#[tauri::command]
pub async fn vnc_status(session_id: String) -> Result<VncStatusResponse, String> {
    let map = SESSIONS.lock().map_err(|e| e.to_string())?;
    let sess = map
        .get(&session_id)
        .ok_or_else(|| AppError::NotFoundSession.to_string())?;
    Ok(match &sess.vnc_session {
        None => VncStatusResponse::NotStarted,
        Some(v) => VncStatusResponse::Running {
            ws_port: v.ws_port_local,
            display: v.display_num,
        },
    })
}
