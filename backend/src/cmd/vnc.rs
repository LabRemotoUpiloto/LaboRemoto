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

pub fn run_remote_pub(sess: &ssh2::Session, cmd: &str) -> Result<(i32, String), String> {
    run_remote(sess, cmd)
}

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

fn check_dependencies(sess: &ssh2::Session, virtual_mode: bool) -> Result<(), String> {
    let tools = if virtual_mode {
        "Xvfb x11vnc openbox lxpanel pcmanfm dbus-launch"
    } else {
        "x11vnc"
    };
    let cmd = format!(
        "MISS=''; \
        for B in {tools}; do \
            command -v \"$B\" >/dev/null 2>&1 || MISS=\"$MISS $B\"; \
        done; \
        [ -z \"$MISS\" ] && echo ok || echo \"MISSING:$MISS\""
    );
    let (_, out) = run_remote(sess, &cmd)?;
    if out.trim().starts_with("MISSING:") {
        let pkgs = out.trim().trim_start_matches("MISSING:").trim();
        let install = if virtual_mode {
            "sudo apt install xvfb x11vnc openbox lxpanel pcmanfm dbus-x11"
        } else {
            "sudo apt install x11vnc"
        };
        return Err(format!(
            "El servidor no tiene los paquetes requeridos:{pkgs}. \
             Instala con:\n  {install}"
        ));
    }
    Ok(())
}

/// Detiene x11vnc para un display real (solo mata el proceso x11vnc por puerto).
pub fn stop_vnc_server_real(sess: &ssh2::Session, vnc_port: u16) -> Result<(), String> {
    let _ = run_remote(
        sess,
        &format!("pkill -f 'x11vnc.*rfbport {vnc_port}' 2>/dev/null; true"),
    );
    Ok(())
}

fn find_free_display(sess: &ssh2::Session) -> Result<u32, String> {
    // Matar todos los Xvfb de :20-:99 que NO tienen x11vnc activo asociado (huérfanos)
    // Esto limpia los residuos de cierres bruscos de la app.
    let _ = run_remote(
        sess,
        "for d in $(seq 20 99); do \
           pgrep -f \"Xvfb :$d \" >/dev/null 2>&1 || { \
             rm -f /tmp/.X$d-lock /tmp/.X11-unix/X$d 2>/dev/null; continue; \
           }; \
           pgrep -f \"x11vnc.*:$d\" >/dev/null 2>&1 || { \
             pkill -9 -f \"Xvfb :$d \" 2>/dev/null; \
             rm -f /tmp/.X$d-lock /tmp/.X11-unix/X$d 2>/dev/null; \
           }; \
         done; true"
    );

    // Buscar displays con AMBOS Xvfb Y x11vnc activos (sesión realmente en uso)
    let (_, out) = run_remote(
        sess,
        "for d in $(seq 20 99); do \
           pgrep -f \"Xvfb :$d \" >/dev/null 2>&1 && \
           pgrep -f \"x11vnc.*:$d\" >/dev/null 2>&1 && \
           echo $d; \
         done; true"
    )?;
    let mut used: Vec<u32> = out
        .lines()
        .filter_map(|l| l.trim().parse::<u32>().ok())
        .collect();
    used.sort();
    used.dedup();
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

/// Obtiene el directorio home del usuario remoto (e.g. /home/labiot, /home/pi).
fn get_remote_home(sess: &ssh2::Session) -> String {
    match run_remote(sess, "echo $HOME") {
        Ok((_, out)) => {
            let s = out.trim().to_string();
            if !s.is_empty() && s.starts_with('/') { s } else { "/tmp".to_string() }
        }
        Err(_) => "/tmp".to_string(),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ciclo de vida del servidor VNC en el host remoto
// ─────────────────────────────────────────────────────────────────────────────

fn start_vnc_server(
    sess: &ssh2::Session,
    display: u32,
    vnc_port: u16,
    resolution: &str,
    home_dir: &str,
) -> Result<(), String> {
    // Limpiar artefactos de sesiones anteriores en este display
    let _ = run_remote(
        sess,
        &format!(
            "pkill -f 'Xvfb :{display} ' 2>/dev/null; pkill -f 'x11vnc.*:{display}' 2>/dev/null; rm -f /tmp/.X{display}-lock /tmp/.X11-unix/X{display} 2>/dev/null; true"
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
    std::thread::sleep(std::time::Duration::from_millis(500));

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
    let browser_desktop = format!("{home_dir}/.local/share/applications/browser-vnc-{display}.desktop");
    let webserver_desktop = format!("{home_dir}/.local/share/applications/webserver-vnc-{display}.desktop");

    // -1. Limpiar TODOS los .desktop y perfiles de sesiones VNC anteriores
    run_remote(
        sess,
        &format!(
            "rm -f {home_dir}/.local/share/applications/browser-vnc-*.desktop \
                   {home_dir}/.local/share/applications/webserver-vnc-*.desktop \
                   {home_dir}/Desktop/servidor-web*.desktop 2>/dev/null; \
             rm -rf {home_dir}/.config/lxpanel/lxde-pi-[0-9]* 2>/dev/null; \
             rm -rf {home_dir}/.config/pcmanfm/lxde-pi-[0-9]* 2>/dev/null; \
             update-desktop-database {home_dir}/.local/share/applications 2>/dev/null; true"
        ),
    )?;

    // 0. Crear XDG_RUNTIME_DIR y el directorio de datos de Chromium
    //    XDG_RUNTIME_DIR DEBE existir antes de que cualquier proceso lo use;
    //    sin él, Chromium y otros procesos pierden acceso a sockets de red.
    run_remote(
        sess,
        &format!(
            "mkdir -p /tmp/xdg{display} {chromium_dir}/Default {home_dir}/.local/bin {home_dir}/Desktop; true"
        ),
    )?;

    // 0b. Configurar libfm para ejecutar .desktop sin preguntar (evita diálogo "Execute File")
    run_remote(
        sess,
        &format!(
            "mkdir -p {home_dir}/.config/libfm && \
             grep -q 'quick_exec' {home_dir}/.config/libfm/libfm.conf 2>/dev/null || \
             printf '[config]\\nquick_exec=1\\n' >> {home_dir}/.config/libfm/libfm.conf; true"
        ),
    )?;

    // 1. Wrapper de browser único para este display — prueba múltiples browsers
    //    en orden (chromium → google-chrome → firefox) y loguea si ninguno funciona.
    run_remote(
        sess,
        &format!(
            "cat > {home_dir}/.local/bin/chromium-browser-{display} << 'WRAPPER_EOF'\n\
#!/bin/sh\n\
# Limpiar singleton locks del perfil aislado\n\
rm -f {chromium_dir}/SingletonLock {chromium_dir}/SingletonCookie {chromium_dir}/SingletonSocket 2>/dev/null\n\
# Aislar completamente del display fisico\n\
export DISPLAY=:{display}\n\
export XDG_RUNTIME_DIR=/tmp/xdg{display}\n\
export DBUS_SESSION_BUS_ADDRESS=\n\
export XDG_SESSION_TYPE=x11\n\
LOG=/tmp/browser-{display}.log\n\
UDIR={chromium_dir}\n\
CARGS='--no-sandbox --disable-gpu --disable-software-rasterizer --disable-dev-shm-usage --no-first-run --no-default-browser-check --disable-session-crashed-bubble --disable-infobars'\n\
for BROWSER in chromium-browser chromium google-chrome-stable google-chrome firefox-esr firefox midori x-www-browser; do\n\
  if command -v \"$BROWSER\" >/dev/null 2>&1; then\n\
    case \"$BROWSER\" in\n\
      *chrom*|*google*) exec \"$BROWSER\" $CARGS --user-data-dir=\"$UDIR\" \"$@\" 2>>\"$LOG\" ;;\n\
      *firefox*) exec \"$BROWSER\" --no-remote --profile \"$UDIR\" --display=:{display} \"$@\" 2>>\"$LOG\" ;;\n\
      *) exec \"$BROWSER\" \"$@\" 2>>\"$LOG\" ;;\n\
    esac\n\
  fi\n\
done\n\
echo no-browser-found >> \"$LOG\"\n\
WRAPPER_EOF\n\
chmod +x {home_dir}/.local/bin/chromium-browser-{display}; true"
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
            "mkdir -p {home_dir}/.local/share/applications && \
             printf '[Desktop Entry]\\nVersion=1.0\\nName=Web Browser\\nExec={home_dir}/.local/bin/chromium-browser-{display}\\nIcon=web-browser\\nType=Application\\nTerminal=false\\nCategories=Network;WebBrowser;\\n' \
             > {browser_desktop} && chmod +x {browser_desktop} && \
             gio set {browser_desktop} metadata::trusted true 2>/dev/null; true"
        ),
    )?;

    // 2b. Acceso directo en el escritorio para ver páginas del Servidor Web (Apache)
    //     Apunta a http://localhost:10000 — cualquier página en /var/www/html será accesible
    //     desde aquí navegando normalmente dentro de Chromium.
    run_remote(
        sess,
        &format!(
            "printf '[Desktop Entry]\\nVersion=1.0\\nName=Servidor Web Local\\nComment=Ver paginas de Apache (localhost:10000)\\nExec={home_dir}/.local/bin/chromium-browser-{display} http://localhost:10000\\nIcon=text-html\\nType=Application\\nTerminal=false\\nCategories=Network;WebBrowser;\\n' \
             > {webserver_desktop} && chmod +x {webserver_desktop} && \
             gio set {webserver_desktop} metadata::trusted true 2>/dev/null && \
             cp {webserver_desktop} {home_dir}/Desktop/servidor-web.desktop 2>/dev/null && \
             chmod +x {home_dir}/Desktop/servidor-web.desktop && \
             gio set {home_dir}/Desktop/servidor-web.desktop metadata::trusted true 2>/dev/null; true"
        ),
    )?;

    // 3. Crear perfil lxpanel minimalista (solo plugins seguros para SSH)
    //    y copiar perfil pcmanfm para fondo de escritorio e iconos.
    run_remote(
        sess,
        &format!(
            "mkdir -p {home_dir}/.config/lxpanel/{panel_profile}/panels && \
             cat > {home_dir}/.config/lxpanel/{panel_profile}/panels/panel << 'PANEL_EOF'\n\
# lxpanel <profile> config file.\n\
Global {{\n\
  edge=top\n\
  align=left\n\
  margin=0\n\
  widthtype=percent\n\
  width=100\n\
  height=36\n\
  transparent=0\n\
  tintcolor=#000000\n\
  alpha=0\n\
  autohide=0\n\
  heightwhenhidden=2\n\
  setdocktype=1\n\
  setpartialstrut=1\n\
  usefontcolor=0\n\
  fontsize=12\n\
  fontcolor=#ffffff\n\
  usefontsize=0\n\
  background=0\n\
  iconsize=36\n\
  monitor=0\n\
}}\n\
Plugin {{\n\
  type=menu\n\
  Config {{\n\
    padding=4\n\
    image=start-here\n\
    system {{\n\
    }}\n\
    separator {{\n\
    }}\n\
    item {{\n\
      image=system-shutdown\n\
      command=logout\n\
    }}\n\
  }}\n\
}}\n\
Plugin {{\n\
  type=launchbar\n\
  Config {{\n\
    Button {{\n\
      id={browser_desktop}\n\
    }}\n\
    Button {{\n\
      id=pcmanfm.desktop\n\
    }}\n\
    Button {{\n\
      id=lxterminal.desktop\n\
    }}\n\
  }}\n\
}}\n\
Plugin {{\n\
  type=taskbar\n\
  expand=1\n\
  Config {{\n\
    tooltips=1\n\
    IconsOnly=0\n\
    ShowAllDesks=0\n\
    MaxTaskWidth=200\n\
  }}\n\
}}\n\
Plugin {{\n\
  type=tray\n\
  Config {{\n\
  }}\n\
}}\n\
Plugin {{\n\
  type=dclock\n\
  Config {{\n\
    ClockFmt=%R\n\
    TooltipFmt=%A %x\n\
    BoldFont=0\n\
    IconOnly=0\n\
    CenterText=1\n\
  }}\n\
}}\n\
PANEL_EOF\n\
             \n\
             mkdir -p {home_dir}/.config/pcmanfm/{panel_profile} && \
             for SRC_PROFILE in LXDE-pi LXDE default; do \
                if [ -d {home_dir}/.config/pcmanfm/$SRC_PROFILE ]; then \
                   cp -r {home_dir}/.config/pcmanfm/$SRC_PROFILE/. {home_dir}/.config/pcmanfm/{panel_profile}/; break; \
                elif [ -d /etc/xdg/pcmanfm/$SRC_PROFILE ]; then \
                   cp -r /etc/xdg/pcmanfm/$SRC_PROFILE/. {home_dir}/.config/pcmanfm/{panel_profile}/; break; \
                fi; \
             done; \
             true"
        ),
    )?;

    // Fondo de escritorio: detectar el wallpaper real del dispositivo.
    // Cubre: pcmanfm/LXDE, GNOME (gsettings/dconf), XFCE (xfconf-query),
    // y rutas comunes de Ubuntu/Jetson como último recurso.
    let (_, wallpaper_detect_out) = run_remote(
        sess,
        &format!(
            "REAL_WP='';\
             \
             for F in \
               {home_dir}/.config/pcmanfm/LXDE-pi/desktop-items-0.conf \
               {home_dir}/.config/pcmanfm/LXDE-pi/pcmanfm.conf \
               {home_dir}/.config/pcmanfm/LXDE/desktop-items-0.conf \
               {home_dir}/.config/pcmanfm/LXDE/pcmanfm.conf \
               /etc/xdg/pcmanfm/LXDE-pi/desktop-items-0.conf \
               /etc/xdg/pcmanfm/LXDE/desktop-items-0.conf; do \
               [ -f \"$F\" ] || continue; \
               V=$(grep -m1 '^wallpaper=' \"$F\" 2>/dev/null | cut -d= -f2- | tr -d '\\r\\n'); \
               [ -n \"$V\" ] && [ -f \"$V\" ] && REAL_WP=\"$V\" && break; \
             done; \
             \
             if [ -z \"$REAL_WP\" ]; then \
               V=$(dconf read /org/gnome/desktop/background/picture-uri 2>/dev/null | tr -d \"'\\\"\" | sed 's|file://||' | tr -d '\\r\\n'); \
               [ -n \"$V\" ] && [ -f \"$V\" ] && REAL_WP=\"$V\"; \
             fi; \
             \
             if [ -z \"$REAL_WP\" ]; then \
               V=$(gsettings get org.gnome.desktop.background picture-uri 2>/dev/null | tr -d \"'\\\"\" | sed 's|file://||' | tr -d '\\r\\n'); \
               [ -n \"$V\" ] && [ -f \"$V\" ] && REAL_WP=\"$V\"; \
             fi; \
             \
             if [ -z \"$REAL_WP\" ]; then \
               for MON in eDP-1 HDMI-1 VGA-1 screen0/monitor0; do \
                 V=$(xfconf-query -c xfce4-desktop -p /backdrop/$MON/workspace0/last-image 2>/dev/null | tr -d '\\r\\n' || true); \
                 [ -n \"$V\" ] && [ -f \"$V\" ] && REAL_WP=\"$V\" && break; \
               done; \
             fi; \
             \
             if [ -z \"$REAL_WP\" ]; then \
               for TRYPATH in \
                 $(ls /usr/share/backgrounds/*.jpg /usr/share/backgrounds/*.png /usr/share/backgrounds/NVIDIA/*.jpg /usr/share/backgrounds/NVIDIA/*.png 2>/dev/null | head -1) \
                 $(ls {home_dir}/Pictures/*.jpg {home_dir}/Pictures/*.png 2>/dev/null | head -1); do \
                 [ -f \"$TRYPATH\" ] && REAL_WP=\"$TRYPATH\" && break; \
               done; \
             fi; \
             \
             echo \"$REAL_WP\""
        ),
    ).unwrap_or((0, String::new()));
    let real_wallpaper = wallpaper_detect_out.trim().to_string();

    // Decidir qué wallpaper usar: el real del dispositivo o el color sólido de fallback.
    // wallpaper_mode: legacy numérico (PCManFM <1.2) / string moderno (PCManFM 1.2+)
    //   1/stretch  = escala la imagen al tamaño del escritorio
    //   4/color    = color sólido (usa desktop_bg, ignora wallpaper=)
    let (wallpaper_path, wallpaper_mode_legacy, wallpaper_mode_modern) =
        if !real_wallpaper.is_empty() {
            (real_wallpaper.clone(), "1".to_string(), "stretch".to_string())
        } else {
            (String::new(), "0".to_string(), "color".to_string())
        };

    // Escribir configuración de pcmanfm.
    // Siempre se incluye desktop_bg=#2c3e50 como red de seguridad (si no hay imagen, o
    // la imagen no carga, pcmanfm usa este color en lugar de negro).
    let wp_line = if wallpaper_path.is_empty() {
        String::new()
    } else {
        format!("wallpaper={wallpaper_path}\n")
    };
    run_remote(
        sess,
        &format!(
            "mkdir -p {home_dir}/.config/pcmanfm/{panel_profile} && \
             printf '[desktop]\\n{wp_line}wallpaper_mode={wml}\\nwallpaper_common=0\\ndesktop_bg=#2c3e50\\ndesktop_fg=#ffffff\\ndesktop_shadow=#000000\\nshow_trash=1\\nshow_mounts=1\\n' \
               | tee {home_dir}/.config/pcmanfm/{panel_profile}/pcmanfm.conf \
                     {home_dir}/.config/pcmanfm/{panel_profile}/desktop-preferences.conf > /dev/null && \
             printf '[*]\\n{wp_line}wallpaper_mode={wmm}\\ndesktop_bg=#2c3e50\\ndesktop_fg=#ffffff\\ndesktop_shadow=#000000\\nshow_trash=1\\nshow_mounts=1\\n' \
               > {home_dir}/.config/pcmanfm/{panel_profile}/desktop-items-0.conf; true",
            wp_line = wp_line,
            wml = wallpaper_mode_legacy,
            wmm = wallpaper_mode_modern,
        ),
    )?;

    // =========================================================================
    // INICIAR x11vnc PRIMERO (Escritorio instantáneo)
    // =========================================================================

    // Al iniciar VNC antes del DE, la UI cargará frente al usuario de inmediato.
    run_remote(
        sess,
        &format!(
            "nohup x11vnc -display :{display} -rfbport {vnc_port} \
             -nopw -shared -forever -noxdamage -xrandr resize \
             >/tmp/x11vnc{display}.log 2>&1 </dev/null & echo started"
        ),
    )?;

    std::thread::sleep(std::time::Duration::from_millis(500));

    let (_, out_vnc) = run_remote(
        sess,
        &format!(
            "ss -tlnp 2>/dev/null | grep -q ':{vnc_port}' && echo ok \
             || (echo fail; tail -8 /tmp/x11vnc{display}.log 2>/dev/null)"
        ),
    )?;

    if !out_vnc.trim().starts_with("ok") {
        let log_lines: String = out_vnc.lines().skip(1).collect::<Vec<_>>().join(" | ");
        let _ = stop_vnc_server(sess, display, vnc_port, home_dir);
        return Err(format!(
            "x11vnc no arrancó en el puerto {vnc_port}. Log: {log_lines}"
        ));
    }
    // =========================================================================

    // 4. xstartup único — exporta TODAS las variables de entorno necesarias
    //    para que los procesos hijos (especialmente Chromium desde lxpanel)
    //    hereden el entorno completo y puedan acceder a la red (localhost/Apache).
    //    Sin estas exports, Chromium no puede resolver localhost ni conectarse.
    //    wallpaper_path puede ser la imagen real del dispositivo o vacío (color sólido).
    let xstartup_wp = wallpaper_path.replace('\'', "'\\''"); // escapar comillas simples
    let set_wp_cmd = if xstartup_wp.is_empty() {
        // Sin imagen real: pcmanfm usará desktop_bg del config (color sólido)
        "pcmanfm --reconfigure 2>/dev/null || true".to_string()
    } else {
        format!(
            "pcmanfm --set-wallpaper='{xstartup_wp}' 2>/dev/null || pcmanfm --set-wallpaper '{xstartup_wp}' 2>/dev/null || true\\\npcmanfm --reconfigure 2>/dev/null || true",
            xstartup_wp = xstartup_wp
        )
    };
    run_remote(
        sess,
        &format!(
            "printf '#!/bin/sh\\n\
export DISPLAY=:{display}\\n\
export HOME={home_dir}\\n\
export XDG_RUNTIME_DIR=/tmp/xdg{display}\\n\
export XDG_DATA_HOME={home_dir}/.local/share\\n\
export XDG_DATA_DIRS={home_dir}/.local/share:/usr/local/share:/usr/share\\n\
export PATH={home_dir}/.local/bin:/usr/local/bin:/usr/bin:/bin\\n\
export XDG_SESSION_TYPE=x11\\n\
unset DBUS_SESSION_BUS_ADDRESS\\n\
unset DBUS_LAUNCHD_SESSION_BUS_SOCKET\\n\
xsetroot -solid \\#2c3e50 2>/dev/null || true\\n\
rm -f {chromium_dir}/SingletonLock {chromium_dir}/SingletonCookie {chromium_dir}/SingletonSocket 2>/dev/null\\n\
openbox >/tmp/openbox{display}.log 2>&1 & echo $! > /tmp/openbox-{display}.pid\\n\
sleep 2\\n\
lxpanel --profile {panel_profile} >/tmp/lxpanel{display}.log 2>&1 &\\n\
pcmanfm --desktop --profile {panel_profile} >/tmp/pcmanfm{display}.log 2>&1 &\\n\
sleep 2\\n\
{set_wp_cmd}\\n\
wait\\n' \
             > {xstartup_path} && chmod +x {xstartup_path}; true",
            set_wp_cmd = set_wp_cmd,
        ),
    )?;
    run_remote(
        sess,
        &format!(
            "DISPLAY=:{display} HOME={home_dir} XDG_RUNTIME_DIR=/tmp/xdg{display} \
             XDG_DATA_HOME={home_dir}/.local/share \
             XDG_DATA_DIRS={home_dir}/.local/share:/usr/local/share:/usr/share \
             PATH={home_dir}/.local/bin:/usr/local/bin:/usr/bin:/bin \
             nohup dbus-launch --exit-with-session {xstartup_path} \
             >/tmp/lxsession{display}.log 2>&1 </dev/null & echo started"
        ),
    )?;

    // Ya no hacemos sleep aquí porque x11vnc ya está corriendo.
    // El frontend intentará conectarse casi de inmediato.
    Ok(())
}

pub fn stop_vnc_server(
    sess: &ssh2::Session,
    display: u32,
    vnc_port: u16,
    home_dir: &str,
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
             sleep 0.5; \
             pkill -9 -f 'Xvfb :{display} ' 2>/dev/null; \
             pkill -9 -f 'x11vnc.*rfbport {vnc_port}' 2>/dev/null; \
             rm -f /tmp/.X{display}-lock /tmp/.X11-unix/X{display} \
                   {xstartup_path} /tmp/openbox-{display}.pid \
                   {browser_desktop} {webserver_desktop} \
                   {home_dir}/Desktop/servidor-web.desktop 2>/dev/null; \
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
// Port-forward local usando ssh2 (equivalente a ssh -L)
//
// Por cada conexión TCP local, abre un channel_direct_tcpip en una sesión
// ssh2 nueva y hace copy bidireccional en dos hilos.
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
                return;
            };
            sess.set_blocking(true);
            // timeout=0 → infinito en libssh2; lo cambiaremos a 5 ms para el poll
            sess.set_timeout(0);
            let Ok(mut channel) = sess.channel_direct_tcpip("127.0.0.1", remote_port, None)
            else {
                return;
            };

            // ── Lectura diagnóstica: solo para VNC (puerto 5900) ─────────────
            // HTTP (cámaras, port 8888) envía el request primero → no hay saludo
            // del servidor; esperar 1 s solo añade latencia a cada reconexión.
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
            // ─────────────────────────────────────────────────────────────────

            // local_conn: read timeout de 1 ms (no-bloqueante efectivo) pero
            // escrituras bloqueantes para evitar WouldBlock al enviar frames grandes.
            sess.set_blocking(false);
            local_conn.set_read_timeout(Some(std::time::Duration::from_millis(1))).ok();
            local_conn.set_nodelay(true).ok();

            let mut buf = vec![0u8; 65536];
            loop {
                let mut progress = false;

                // ── SSH channel → local TCP ──────────────────────────────────
                match channel.read(&mut buf) {
                    Ok(0) => {
                        break; // SSH channel EOF — fin normal
                    }
                    Ok(n) => {
                        progress = true;
                        // Escritura bloqueante: espera hasta que el buffer del kernel
                        // acepta todos los bytes. No falla con WouldBlock.
                        if local_conn.write_all(&buf[..n]).is_err() {
                            break;
                        }
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
                    Err(_e) => {
                        break;
                    }
                }

                // ── local TCP → SSH channel ──────────────────────────────────
                match local_conn.read(&mut buf) {
                    Ok(0) => {
                        break; // local_conn EOF — fin normal
                    }
                    Ok(n) => {
                        progress = true;
                        sess.set_blocking(true);
                        let write_ok = channel.write_all(&buf[..n]).is_ok();
                        sess.set_blocking(false);
                        if !write_ok {
                            break;
                        }
                    }
                    Err(ref e)
                        if matches!(
                            e.kind(),
                            std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                        ) =>
                    {}
                    Err(_e) => {
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
            // Port-forward session ended (normal)
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
            Ok(0) => { break; }
            Ok(n) => {
                if ws_send_binary(&mut ws, &buf[..n]).is_err() {
                    break;
                }
            }
            Err(_e) => { break; }
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
                if let Err(_e) = vnc.write_all(&data) {
                    break;
                }
            }
            Ok(Some(WsFrame::Close)) => {
                break;
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::UnexpectedEof => {
                break;
            }
            Err(_e) => { break; }
            _ => {}
        }
    }
    let _ = vnc.shutdown(std::net::Shutdown::Both);
}

fn handle_vnc_client(
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
        Err(_e) => { return; }
    };

    // Obtener TcpStream raw del WS (BufReader interno vacío en este punto)
    let ws_stream = match ws.get_mut().try_clone() {
        Ok(s) => s,
        Err(_e) => {
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
            s
        }
        Err(_e) => {
            let mut ws_stream_err = ws_stream;
            ws_send_close(&mut ws_stream_err);
            return;
        }
    };

    // Dos hilos bidireccionales — ambos son TcpStream puro (Send + Clone)
    let ws_for_vnc = match ws_stream.try_clone() {
        Ok(s) => s,
        Err(_e) => { return; }
    };
    let vnc_for_ws = match vnc_stream.try_clone() {
        Ok(s) => s,
        Err(_e) => { return; }
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

    let (display, vnc_port, ws_listener, local_fwd_port, is_virtual, home_dir) =
        tokio::task::spawn_blocking(move || -> Result<(u32, u16, std::net::TcpListener, u16, bool, String), String> {
            let (_tcp_setup, setup_sess) =
                crate::ssh::ssh2_sftp::connect_password(&h, port, &u, &p)
                    .map_err(|e| format!("Conexión SSH para setup VNC falló: {e}"))?;

            // Siempre crear display virtual (Xvfb) — pantalla adicional separada,
            // no tomar control del escritorio real (comportamiento tipo AnyDesk).
            let home_dir = get_remote_home(&setup_sess);
            check_dependencies(&setup_sess, true)?;
            // Limpiar cualquier display huérfano de cierres anteriores de la app
            crate::cmd::state::run_pending_vnc_cleanups(&setup_sess);
            let display  = find_free_display(&setup_sess)?;
            let vnc_port = find_free_vnc_port(&setup_sess)?;
            start_vnc_server(&setup_sess, display, vnc_port, &r, &home_dir)?;

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

            Ok((display, vnc_port, ws_listener, local_fwd_port, true, home_dir))
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
            is_virtual,
            home_dir,
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
/// remotos (Xvfb, Openbox, x11vnc) usando el canal russh ya conectado.
#[tauri::command]
pub async fn vnc_stop(session_id: String) -> Result<(), String> {
    let (vnc_opt, term_tx) = {
        let mut map = crate::cmd::state::SESSIONS.lock().map_err(|e| e.to_string())?;
        let sess = map.get_mut(&session_id).ok_or("NotFoundSession")?;
        (sess.vnc_session.take(), sess.term.tx.clone())
    };

    if let Some(mut vnc) = vnc_opt {
        // Señalar al bridge que pare y matar el tunnel local
        vnc.stop_flag.store(true, std::sync::atomic::Ordering::Relaxed);
        if let Some(mut child) = vnc.ssh_fwd_child.take() { let _ = child.kill(); }

        let display  = vnc.display_num;
        let vnc_port = vnc.vnc_port_remote;
        vnc.host     = "".to_string(); // Evitar reconexión en Drop

        // Enviar pkill por el canal russh ya conectado (sin nueva conexión SSH)
        let kill_cmd = format!(
            "pkill -9 -f 'Xvfb :{display} ' 2>/dev/null; \
             pkill -9 -f 'x11vnc.*rfbport {vnc_port}' 2>/dev/null; \
             rm -f /tmp/.X{display}-lock /tmp/.X11-unix/X{display} 2>/dev/null; true\n"
        );
        let _ = term_tx.send(crate::ssh::client::ChanCmd::Send(kill_cmd.into_bytes()));

        // Esperar a que los procesos mueran antes de retornar
        tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;
    }

    Ok(())
}

/// Limpia todos los displays VNC virtuales desde :20 en el servidor activo.
/// Útil para limpiar manualmente tras cierres inesperados de la app.
#[tauri::command]
pub async fn vnc_cleanup_all(session_id: String) -> Result<String, String> {
    let (host, port, user, password) = {
        let map = crate::cmd::state::SESSIONS.lock().map_err(|e| e.to_string())?;
        let sess = map.get(&session_id).ok_or("NotFoundSession")?;
        (sess.host.clone(), sess.port, sess.user.clone(), sess.password.clone())
    };

    let result = tokio::task::spawn_blocking(move || -> Result<String, String> {
        let (_tcp, sess) = crate::ssh::ssh2_sftp::connect_password(&host, port, &user, &password)
            .map_err(|e| format!("SSH error: {e}"))?;
        // Matar todos los Xvfb de :20 a :99 que no tengan procesos activos o sean nuestros
        let (_, out) = run_remote(
            &sess,
            "for d in $(seq 20 99); do \
               pgrep -f \"Xvfb :$d \" >/dev/null 2>&1 && { \
                 pkill -9 -f \"Xvfb :$d \" 2>/dev/null; \
                 pkill -9 -f \"x11vnc.*:$d\" 2>/dev/null; \
                 rm -f /tmp/.X$d-lock /tmp/.X11-unix/X$d 2>/dev/null; \
                 echo \"killed :$d\"; \
               }; \
             done; true"
        ).map_err(|e| e)?;
        Ok(out.trim().to_string())
    }).await.map_err(|e| e.to_string())??;

    Ok(if result.is_empty() { "No había displays activos".to_string() } else { result })
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
