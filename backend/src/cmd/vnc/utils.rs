use crate::ssh::exec::ssh_exec_session;

/// Verifica que las dependencias necesarias existan en el servidor remoto.
pub(crate) fn check_dependencies(sess: &ssh2::Session, virtual_mode: bool) -> Result<(), String> {
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
    let (_, out) = ssh_exec_session(sess, &cmd)?;
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
pub(crate) fn stop_vnc_server_real(sess: &ssh2::Session, vnc_port: u16) -> Result<(), String> {
    let _ = ssh_exec_session(
        sess,
        &format!("pkill -f 'x11vnc.*rfbport {vnc_port}' 2>/dev/null; true"),
    );
    Ok(())
}

/// Busca un display virtual libre entre :20 y :99.
pub(crate) fn find_free_display(sess: &ssh2::Session) -> Result<u32, String> {
    let _ = ssh_exec_session(
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

    let (_, out) = ssh_exec_session(
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

/// Busca un puerto VNC libre entre 5900 y 5998.
pub(crate) fn find_free_vnc_port(sess: &ssh2::Session) -> Result<u16, String> {
    let (_, out) = ssh_exec_session(
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

/// Obtiene el directorio home del usuario remoto.
pub(crate) fn get_remote_home(sess: &ssh2::Session) -> String {
    match ssh_exec_session(sess, "echo $HOME") {
        Ok((_, out)) => {
            let s = out.trim().to_string();
            if !s.is_empty() && s.starts_with('/') { s } else { "/tmp".to_string() }
        }
        Err(_) => "/tmp".to_string(),
    }
}
