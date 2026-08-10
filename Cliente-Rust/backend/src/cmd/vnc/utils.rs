use crate::ssh_core::exec::ssh_exec_session;

/// Familia de SO del servidor remoto, detectada para poder sugerir el
/// comando de instalación correcto (o explicar que el escritorio remoto no
/// aplica ahí). Xvnc+openbox+lxpanel+pcmanfm son herramientas de X11/Linux —
/// no existe un equivalente directo en Windows ni macOS, así que ahí no
/// tiene sentido sugerir un comando de instalación.
enum RemoteOs {
    Linux(LinuxPkgMgr),
    Macos,
    Windows,
    Unknown,
}

enum LinuxPkgMgr {
    Apt,
    Dnf,
    Yum,
    Pacman,
    Apk,
    Unknown,
}

/// Un solo probe barato: en un shell POSIX (Linux/macOS) `uname -s` devuelve
/// "Linux" o "Darwin". Si el servidor SSH presenta cmd.exe/PowerShell
/// (Windows), esa sintaxis no es válida y no vamos a ver ninguno de los dos
/// valores — lo tratamos como Windows sin necesitar parsear su sintaxis.
fn detect_remote_os(sess: &ssh2::Session) -> RemoteOs {
    let Ok((_, out)) = ssh_exec_session(sess, "uname -s 2>/dev/null || echo NOTPOSIX") else {
        return RemoteOs::Unknown;
    };
    match out.trim() {
        "Darwin" => RemoteOs::Macos,
        "Linux" => RemoteOs::Linux(detect_linux_pkg_mgr(sess)),
        _ => RemoteOs::Windows,
    }
}

fn detect_linux_pkg_mgr(sess: &ssh2::Session) -> LinuxPkgMgr {
    let (_, out) = ssh_exec_session(
        sess,
        "if command -v apt-get >/dev/null 2>&1; then echo apt; \
         elif command -v dnf >/dev/null 2>&1; then echo dnf; \
         elif command -v yum >/dev/null 2>&1; then echo yum; \
         elif command -v pacman >/dev/null 2>&1; then echo pacman; \
         elif command -v apk >/dev/null 2>&1; then echo apk; \
         else echo unknown; fi",
    )
    .unwrap_or((0, "unknown".to_string()));
    match out.trim() {
        "apt" => LinuxPkgMgr::Apt,
        "dnf" => LinuxPkgMgr::Dnf,
        "yum" => LinuxPkgMgr::Yum,
        "pacman" => LinuxPkgMgr::Pacman,
        "apk" => LinuxPkgMgr::Apk,
        _ => LinuxPkgMgr::Unknown,
    }
}

/// Comando de instalación sugerido para el modo virtual (Xvnc + entorno de
/// escritorio). Nombres de paquete de memoria, sin poder verificarlos contra
/// cada distro real — si el comando falla, el nombre exacto puede variar.
fn install_hint_virtual(pkg_mgr: &LinuxPkgMgr) -> String {
    match pkg_mgr {
        LinuxPkgMgr::Apt => "sudo apt install tigervnc-standalone-server openbox lxpanel pcmanfm dbus-x11".to_string(),
        LinuxPkgMgr::Dnf => "sudo dnf install tigervnc-server openbox lxpanel pcmanfm dbus-x11".to_string(),
        LinuxPkgMgr::Yum => "sudo yum install tigervnc-server openbox lxpanel pcmanfm dbus-x11".to_string(),
        LinuxPkgMgr::Pacman => "sudo pacman -S tigervnc openbox lxpanel pcmanfm dbus".to_string(),
        LinuxPkgMgr::Apk => "sudo apk add tigervnc openbox lxpanel pcmanfm dbus-x11".to_string(),
        LinuxPkgMgr::Unknown => "no reconocí el gestor de paquetes de esta distro (busqué apt/dnf/yum/pacman/apk) — instala manualmente: Xvnc (TigerVNC), openbox, lxpanel, pcmanfm, dbus-launch".to_string(),
    }
}

/// Verifica que las dependencias necesarias existan en el servidor remoto.
/// Modo virtual: Xvnc (TigerVNC) hace de display virtual + servidor VNC en
/// un solo proceso — reemplaza al combo Xvfb+x11vnc (ver server.rs). El
/// binario puede llamarse `Xvnc` o `Xtigervnc` según cómo lo empaquete la
/// distro, por eso se chequean ambos nombres.
pub(crate) fn check_dependencies(sess: &ssh2::Session, virtual_mode: bool) -> Result<(), String> {
    let cmd = if virtual_mode {
        "MISS=''; \
         command -v Xvnc >/dev/null 2>&1 || command -v Xtigervnc >/dev/null 2>&1 || MISS=\"$MISS Xvnc\"; \
         for B in openbox lxpanel pcmanfm dbus-launch; do \
             command -v \"$B\" >/dev/null 2>&1 || MISS=\"$MISS $B\"; \
         done; \
         [ -z \"$MISS\" ] && echo ok || echo \"MISSING:$MISS\"".to_string()
    } else {
        "MISS=''; \
         command -v x11vnc >/dev/null 2>&1 || MISS=\"$MISS x11vnc\"; \
         [ -z \"$MISS\" ] && echo ok || echo \"MISSING:$MISS\"".to_string()
    };
    let (_, out) = ssh_exec_session(sess, &cmd)?;
    if out.trim().starts_with("MISSING:") {
        let pkgs = out.trim().trim_start_matches("MISSING:").trim();

        if !virtual_mode {
            return Err(format!(
                "El servidor no tiene los paquetes requeridos:{pkgs}. Instala con:\n\n```bash\nsudo apt install x11vnc\n```"
            ));
        }

        return Err(match detect_remote_os(sess) {
            RemoteOs::Linux(pkg_mgr) => format!(
                "El servidor no tiene los paquetes requeridos:{pkgs}. Instala con:\n\n```bash\n{}\n```",
                install_hint_virtual(&pkg_mgr)
            ),
            RemoteOs::Macos => format!(
                "El servidor es macOS: el escritorio remoto de esta app usa Xvnc + un entorno \
                 de escritorio Linux (openbox/lxpanel/pcmanfm), que no existe en macOS. Si \
                 querés acceso remoto gráfico a este Mac, macOS ya trae \"Compartir pantalla\" \
                 (VNC) integrado — actívalo en Preferencias del Sistema → General → Compartir \
                 en pantalla, y conéctate con un cliente VNC en vez de este botón. \
                 (Paquetes que faltarían acá si igual quisieras intentarlo:{pkgs})"
            ),
            RemoteOs::Windows => format!(
                "El servidor parece ser Windows: el escritorio remoto de esta app usa Xvnc + un \
                 entorno de escritorio Linux (openbox/lxpanel/pcmanfm), que no existe en \
                 Windows. Para acceso remoto gráfico a un servidor Windows, usá Conexión a \
                 Escritorio Remoto (RDP) en vez de esta función. \
                 (Paquetes que faltarían acá si igual quisieras intentarlo:{pkgs})"
            ),
            RemoteOs::Unknown => format!(
                "El servidor no tiene los paquetes requeridos para el escritorio remoto:{pkgs}, \
                 y no pude determinar su sistema operativo para sugerir cómo instalarlos. \
                 Verifica manualmente si tiene Xvnc (TigerVNC), openbox, lxpanel, pcmanfm y \
                 dbus-launch disponibles."
            ),
        });
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
///
/// También chequea `Xvfb`/`x11vnc` (el combo que Xvnc reemplazó) — no porque
/// haga falta para el flujo normal, sino como red de seguridad transicional:
/// un huérfano de una sesión de ANTES de la migración a Xvnc puede seguir
/// vivo en un display, invisible si solo buscáramos el patrón nuevo, y
/// haría fallar a Xvnc con "server already running" al intentar reusar ese
/// número.
pub(crate) fn find_free_display(sess: &ssh2::Session) -> Result<u32, String> {
    let _ = ssh_exec_session(
        sess,
        "for d in $(seq 20 99); do \
           if pgrep -f \"Xvnc :$d \" >/dev/null 2>&1 || pgrep -f \"Xtigervnc :$d \" >/dev/null 2>&1 \
              || pgrep -f \"Xvfb :$d \" >/dev/null 2>&1 || pgrep -f \"x11vnc.*:$d\" >/dev/null 2>&1; then \
             continue; \
           fi; \
           rm -f /tmp/.X$d-lock /tmp/.X11-unix/X$d 2>/dev/null; \
         done; true"
    );

    let (_, out) = ssh_exec_session(
        sess,
        "for d in $(seq 20 99); do \
           if pgrep -f \"Xvnc :$d \" >/dev/null 2>&1 || pgrep -f \"Xtigervnc :$d \" >/dev/null 2>&1 \
              || pgrep -f \"Xvfb :$d \" >/dev/null 2>&1 || pgrep -f \"x11vnc.*:$d\" >/dev/null 2>&1; then \
             echo $d; \
           fi; \
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
