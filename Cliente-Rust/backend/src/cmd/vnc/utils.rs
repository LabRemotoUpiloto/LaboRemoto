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
        &format!("pkill -f '[x]11vnc.*rfbport {vnc_port}' 2>/dev/null; true"),
    );
    Ok(())
}

/// Comando de shell que termina los servidores X/VNC de un display (`display` puede ser un número o `$d`).
/// Es la única lista de `pkill` del proyecto. Los corchetes ([X]vnc) evitan que el patrón de `pkill -f` coincida
/// con la propia línea de comandos del `sh -c` que lo ejecuta y se mate a sí mismo (con lo que la limpieza no
/// terminaba). `signal` es "" o "-9"; `legacy` incluye también Xvfb/x11vnc (huérfanos de antes de Xvnc).
pub(crate) fn kill_display_cmd(display: &str, signal: &str, legacy: bool) -> String {
    let mut cmd = format!(
        "pkill {signal} -f \"[X]vnc :{display} \" 2>/dev/null; \
         pkill {signal} -f \"[X]tigervnc :{display} \" 2>/dev/null; \
         pkill {signal} -f \"[X]vnc-core :{display} \" 2>/dev/null; "
    );
    if legacy {
        cmd.push_str(&format!(
            "pkill {signal} -f \"[X]vfb :{display} \" 2>/dev/null; \
             pkill {signal} -f \"[x]11vnc.*:{display}\" 2>/dev/null; "
        ));
    }
    cmd
}

/// Reserva un display virtual (:20–:99) y un puerto VNC (5900–5998) libres en la Pi.
///
/// La reserva es un `mkdir` (atómico) en ~/.cache/labremoto/claims: si dos estudiantes arrancan casi al mismo
/// tiempo, el segundo no puede obtener el mismo display ni el mismo puerto que el primero. Antes cada uno miraba
/// "qué está libre" por separado y los dos recibían el mismo número; el segundo terminaba conectado al escritorio
/// (sin contraseña) del primero. Las reservas caducan a los 3 min (para entonces Xvnc ya se ve en `ps`/`ss`).
///
/// También mira Xvfb/x11vnc (el combo que Xvnc reemplazó): un huérfano de antes de la migración puede seguir
/// vivo en un display. Una sola lectura de `ps` (antes eran ~800 `pgrep`: casi un minuto en una Pi 3). Los
/// locks viejos solo se limpian de displays >= 20, nunca el :0 de la pantalla física.
pub(crate) fn reserve_display_and_port(sess: &ssh2::Session, home_dir: &str) -> Result<(u32, u16), String> {
    let (_, out) = ssh_exec_session(
        sess,
        &format!(
            "C={home_dir}/.cache/labremoto/claims; mkdir -p \"$C\" && chmod 700 {home_dir}/.cache/labremoto \"$C\" 2>/dev/null; \
             find \"$C\" -maxdepth 1 -name '[dp]-*' -mmin +3 -exec rmdir {{}} + 2>/dev/null; \
             USED_D=$(ps -eo args= 2>/dev/null \
                      | grep -oE '(X[v]nc|X[t]igervnc|X[v]nc-core|X[v]fb) :[0-9]+|[x]11vnc.* :[0-9]+' \
                      | grep -oE ':[0-9]+$' | tr -d ':' | sort -un); \
             for f in /tmp/.X*-lock; do \
               [ -e \"$f\" ] || continue; \
               n=${{f#/tmp/.X}}; n=${{n%-lock}}; \
               case \"$n\" in ''|*[!0-9]*) continue;; esac; \
               [ \"$n\" -ge 20 ] || continue; \
               echo \"$USED_D\" | grep -qx \"$n\" || rm -f \"$f\" \"/tmp/.X11-unix/X$n\" 2>/dev/null; \
             done; \
             USED_P=$(ss -tln 2>/dev/null | awk '{{print $4}}' | grep -oE ':[0-9]+$' | tr -d ':' | sort -un); \
             D=''; for d in $(seq 20 99); do \
               echo \"$USED_D\" | grep -qx \"$d\" && continue; \
               mkdir \"$C/d-$d\" 2>/dev/null && {{ D=$d; break; }}; \
             done; \
             P=''; for p in $(seq 5900 5998); do \
               echo \"$USED_P\" | grep -qx \"$p\" && continue; \
               mkdir \"$C/p-$p\" 2>/dev/null && {{ P=$p; break; }}; \
             done; \
             echo \"$D $P\""
        ),
    )?;
    let mut it = out.split_whitespace().filter_map(|t| t.parse::<u32>().ok());
    let display = it.next().ok_or_else(|| "No hay display virtual libre (:20–:99 todos en uso o reservados)".to_string())?;
    let port = it.next().ok_or_else(|| "No hay puerto VNC libre (5900–5998 todos en uso o reservados)".to_string())?;
    Ok((display, port as u16))
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
