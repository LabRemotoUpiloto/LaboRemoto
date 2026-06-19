use crate::ssh_core::exec::ssh_exec_session;

/// Inicia Xvfb + entorno gráfico + x11vnc en el display/puerto dados.
pub(crate) fn start_vnc_server(
    sess: &ssh2::Session,
    display: u32,
    vnc_port: u16,
    resolution: &str,
    home_dir: &str,
) -> Result<(), String> {
    let _ = ssh_exec_session(
        sess,
        &format!(
            "pkill -f 'Xvfb :{display} ' 2>/dev/null; pkill -f 'x11vnc.*:{display}' 2>/dev/null; rm -f /tmp/.X{display}-lock /tmp/.X11-unix/X{display} 2>/dev/null; true"
        ),
    );

    crate::ssh_core::exec::ssh_exec_session(
        sess,
        &format!(
            "nohup Xvfb :{display} -screen 0 {resolution}x24 -ac \
             >/tmp/xvfb{display}.log 2>&1 </dev/null & echo started"
        ),
    )?;

    std::thread::sleep(std::time::Duration::from_millis(500));

    let (_, out) = ssh_exec_session(
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

    let chromium_dir = format!("/tmp/chromium-vnc-{display}");
    let xstartup_path = format!("/tmp/vnc-xstartup-{display}.sh");
    let panel_profile = format!("lxde-pi-{display}");
    let browser_desktop = format!("{home_dir}/.local/share/applications/browser-vnc-{display}.desktop");
    let webserver_desktop = format!("{home_dir}/.local/share/applications/webserver-vnc-{display}.desktop");

    let _ = ssh_exec_session(
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

    let _ = ssh_exec_session(
        sess,
        &format!(
            "mkdir -p /tmp/xdg{display} {chromium_dir}/Default {home_dir}/.local/bin {home_dir}/Desktop; true"
        ),
    )?;

    let _ = ssh_exec_session(
        sess,
        &format!(
            "mkdir -p {home_dir}/.config/libfm && \
             grep -q 'quick_exec' {home_dir}/.config/libfm/libfm.conf 2>/dev/null || \
             printf '[config]\\nquick_exec=1\\n' >> {home_dir}/.config/libfm/libfm.conf; true"
        ),
    )?;

    let _ = ssh_exec_session(
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

    let _ = ssh_exec_session(
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

    let _ = ssh_exec_session(
        sess,
        &format!(
            "mkdir -p {home_dir}/.local/share/applications && \
             printf '[Desktop Entry]\\nVersion=1.0\\nName=Web Browser\\nExec={home_dir}/.local/bin/chromium-browser-{display}\\nIcon=web-browser\\nType=Application\\nTerminal=false\\nCategories=Network;WebBrowser;\\n' \
             > {browser_desktop} && chmod +x {browser_desktop} && \
             gio set {browser_desktop} metadata::trusted true 2>/dev/null; true"
        ),
    )?;

    let _ = ssh_exec_session(
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

    let _ = ssh_exec_session(
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

    let (_, wallpaper_detect_out) = ssh_exec_session(
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

    let (wallpaper_path, wallpaper_mode_legacy, wallpaper_mode_modern) =
        if !real_wallpaper.is_empty() {
            (real_wallpaper.clone(), "1".to_string(), "stretch".to_string())
        } else {
            (String::new(), "0".to_string(), "color".to_string())
        };

    let wp_line = if wallpaper_path.is_empty() {
        String::new()
    } else {
        format!("wallpaper={wallpaper_path}\n")
    };

    let _ = ssh_exec_session(
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

    let _ = ssh_exec_session(
        sess,
        &format!(
            "nohup x11vnc -display :{display} -rfbport {vnc_port} \
             -nopw -shared -forever -noxdamage -xrandr resize \
             >/tmp/x11vnc{display}.log 2>&1 </dev/null & echo started"
        ),
    )?;

    std::thread::sleep(std::time::Duration::from_millis(500));

    let (_, out_vnc) = ssh_exec_session(
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

    let xstartup_wp = wallpaper_path.replace('\'', "'\\''");
    let set_wp_cmd = if xstartup_wp.is_empty() {
        "pcmanfm --reconfigure 2>/dev/null || true".to_string()
    } else {
        format!(
            "pcmanfm --set-wallpaper='{xstartup_wp}' 2>/dev/null || pcmanfm --set-wallpaper '{xstartup_wp}' 2>/dev/null || true\\npcmanfm --reconfigure 2>/dev/null || true",
            xstartup_wp = xstartup_wp
        )
    };

    let _ = ssh_exec_session(
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

    let _ = ssh_exec_session(
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

    let _ = ssh_exec_session(
        sess,
        &format!(
            "printf '[Desktop Entry]\\nVersion=1.0\\nName=Chromium Browser\\nComment=Navegador web\\nExec={home_dir}/.local/bin/chromium-browser-{display}\\nIcon=web-browser\\nType=Application\\nCategories=Network;WebBrowser;\\nTerminal=false\\nStartupNotify=true\\n' \
             > {home_dir}/.local/share/applications/chromium-browser-vnc-{display}.desktop && \
             chmod +x {home_dir}/.local/share/applications/chromium-browser-vnc-{display}.desktop && \
             update-desktop-database {home_dir}/.local/share/applications 2>/dev/null; true"
        ),
    )?;

    let _ = ssh_exec_session(
        sess,
        &format!(
            "printf '[Desktop Entry]\\nVersion=1.0\\nName=LXTerminal\\nComment=Terminal\\nExec=lxterminal\\nIcon=utilities-terminal\\nType=Application\\nCategories=System;TerminalEmulator;\\nTerminal=false\\nStartupNotify=true\\n' \
             > {home_dir}/.local/share/applications/lxterminal-vnc-{display}.desktop && \
             chmod +x {home_dir}/.local/share/applications/lxterminal-vnc-{display}.desktop && \
             update-desktop-database {home_dir}/.local/share/applications 2>/dev/null; true"
        ),
    )?;

    let _ = ssh_exec_session(
        sess,
        &format!(
            "printf '[Desktop Entry]\\nVersion=1.0\\nName=Visual Studio Code\\nComment=Editor de código\\nExec=code --no-sandbox --disable-gpu --user-data-dir={chromium_dir}\\nIcon=vscode\\nType=Application\\nCategories=Development;IDE;\\nTerminal=false\\nStartupNotify=true\\n' \
             > {home_dir}/.local/share/applications/code-vnc-{display}.desktop && \
             chmod +x {home_dir}/.local/share/applications/code-vnc-{display}.desktop && \
             update-desktop-database {home_dir}/.local/share/applications 2>/dev/null; true"
        ),
    )?;

    let _ = ssh_exec_session(
        sess,
        &format!(
            "printf '[Desktop Entry]\\nVersion=1.0\\nName=Servidor Web Local\\nComment=Ver paginas de Apache (localhost:10000)\\nExec={home_dir}/.local/bin/chromium-browser-{display} http://localhost:10000\\nIcon=text-html\\nType=Application\\nCategories=Network;WebBrowser;\\nTerminal=false\\nStartupNotify=true\\n' \
             > {webserver_desktop} && chmod +x {webserver_desktop} && \
             gio set {webserver_desktop} metadata::trusted true 2>/dev/null && \
             cp {webserver_desktop} {home_dir}/Desktop/servidor-web.desktop 2>/dev/null && \
             chmod +x {home_dir}/Desktop/servidor-web.desktop && \
             gio set {home_dir}/Desktop/servidor-web.desktop metadata::trusted true 2>/dev/null; true"
        ),
    )?;

    Ok(())
}

/// Detiene todos los procesos remotos asociados a una sesión VNC.
pub(crate) fn stop_vnc_server(
    sess: &ssh2::Session,
    display: u32,
    vnc_port: u16,
    home_dir: &str,
) -> Result<(), String> {
    let xstartup_path = format!("/tmp/vnc-xstartup-{display}.sh");
    let panel_profile = format!("lxde-pi-{display}");
    let browser_desktop = format!("/tmp/browser-{display}.desktop");
    let webserver_desktop = format!("/tmp/webserver-{display}.desktop");
    let _ = ssh_exec_session(
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
