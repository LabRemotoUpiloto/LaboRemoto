use crate::ssh_core::exec::ssh_exec_session;
use super::utils::{kill_display_cmd, run_dir};

/// Inicia Xvnc (display virtual + servidor VNC en un solo proceso) + entorno
/// gráfico en el display/puerto dados.
///
/// Antes esto eran DOS procesos (Xvfb generando el display, x11vnc
/// "espiándolo" para exponerlo por VNC, adivinando qué cambió vía xdamage o
/// polling completo). Xvnc de TigerVNC es el servidor X y el servidor VNC al
/// mismo tiempo: como genera el framebuffer él mismo, sabe exactamente qué
/// píxeles cambiaron sin polling ni extensión xdamage de por medio — más
/// liviano en CPU y sin el problema de "regiones que quedan viejas" que
/// tuvimos que parchear con -fixscreen en x11vnc.
///
/// `practica`: escritorio acotado para las prácticas (ver `setup_steps_1`): sin menú de inicio, sin navegador ni
/// explorador de archivos, solo el acceso a la terminal.
pub(crate) fn start_vnc_server(
    sess: &ssh2::Session,
    display: u32,
    vnc_port: u16,
    resolution: &str,
    home_dir: &str,
    practica: bool,
) -> Result<(), String> {
    let rd = run_dir(home_dir, display);
    // Limpieza previa + lanzamiento en una sola llamada SSH (el PID sale en la última línea).
    let cleanup = format!(
        "{kill} \
         for p in $(ss -tlnpH 'sport = :{x_port}' 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); do \
           case \"$(cat /proc/$p/comm 2>/dev/null)\" in Xvnc*|Xtigervnc*) kill $p 2>/dev/null;; esac; \
         done; \
         sleep 0.5; \
         rm -f /tmp/.X{display}-lock /tmp/.X11-unix/X{display} 2>/dev/null; \
         mkdir -p {rd} && chmod 700 {rd}; true",
        kill = kill_display_cmd(&display.to_string(), "", true),
        x_port = 6000 + display
    );

    // El binario puede llamarse Xvnc o Xtigervnc según la distro — se
    // resuelve una vez y se usa esa ruta (ver check_dependencies en utils.rs,
    // que ya validó que al menos uno de los dos existe antes de llegar acá).
    let launch = format!(
        "XVNC_BIN=$(command -v Xtigervnc || command -v Xvnc); \
         nohup \"$XVNC_BIN\" :{display} -geometry {resolution} -depth 24 \
         -rfbport {vnc_port} -SecurityTypes None -AlwaysShared -ac -nolisten tcp -localhost \
         >{rd}/xvnc.log 2>&1 </dev/null & echo $!"
    );
    let (_, launched) = ssh_exec_session(sess, &format!("{cleanup}\n{launch}"))?;
    let xvnc_pid: u32 = launched
        .lines()
        .last()
        .and_then(|l| l.trim().parse().ok())
        .ok_or_else(|| format!("No se pudo obtener el PID de Xvnc (salida: {})", launched.trim()))?;

    // Se espera (hasta 15 s; una Pi 3 es lenta) a que el puerto VNC lo escuche el Xvnc que ACABAMOS de lanzar (su
    // PID, o un hijo directo suyo si el binario es un script envoltorio). Comprobar solo "algo escucha en el
    // puerto" daba por bueno el Xvnc de OTRO estudiante, que no tiene contraseña. Tampoco se busca el proceso
    // por nombre ni /tmp/.X11-unix/X<n>: el Xvnc de RealVNC (`Xvnc-core`) no crea ese archivo.
    let (_, out) = ssh_exec_session(
        sess,
        &format!(
            "PID={xvnc_pid}; \
             for i in $(seq 1 60); do \
               LP=$(ss -tlnpH 'sport = :{vnc_port}' 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2); \
               if [ -n \"$LP\" ]; then \
                 if [ \"$LP\" = \"$PID\" ] || [ \"$(ps -o ppid= -p $LP 2>/dev/null | tr -d ' ')\" = \"$PID\" ]; then echo ok; \
                 else echo foreign; fi; \
                 exit 0; \
               fi; \
               kill -0 $PID 2>/dev/null || {{ echo dead; exit 0; }}; \
               sleep 0.25; \
             done; echo timeout"
        ),
    )?;
    std::thread::sleep(std::time::Duration::from_millis(300));
    let verdict = out.trim().to_string();
    if verdict != "ok" {
        // No dejar un Xvnc huérfano si no arrancó bien; de paso se lee el final de su log (una sola llamada).
        let (_, log_tail) = ssh_exec_session(
            sess,
            &format!(
                "kill {xvnc_pid} 2>/dev/null; sleep 0.3; kill -9 {xvnc_pid} 2>/dev/null; \
                 rm -f /tmp/.X{display}-lock /tmp/.X11-unix/X{display} 2>/dev/null; \
                 tail -8 {rd}/xvnc.log 2>/dev/null"
            ),
        ).unwrap_or((0, String::new()));
        let motivo = match verdict.as_str() {
            "foreign" => "el puerto lo ocupa otro proceso",
            "dead" => "el proceso terminó",
            _ => "no quedó escuchando a tiempo",
        };
        return Err(format!(
            "Xvnc no arrancó correctamente ({motivo}) en el display :{display} / puerto {vnc_port}. Log: {}",
            log_tail.trim()
        ));
    }

    let out1 = run_batch(sess, display, home_dir, &setup_steps_1(display, home_dir, practica), false)?;
    let wallpaper = section(&out1, "fondo-detectar");
    run_batch(sess, display, home_dir, &setup_steps_2(display, home_dir, &wallpaper, practica), true)?;

    Ok(())
}

/// Un paso de la preparación del escritorio: un nombre (para el marcador `STEP:nombre`) y su comando de shell.
pub(crate) struct Step {
    pub(crate) name: &'static str,
    pub(crate) cmd: String,
}

fn step(name: &'static str, cmd: String) -> Step {
    Step { name, cmd }
}

/// Cita `s` para usarla como una sola palabra de shell (`'` → `'\''`).
fn sh_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// Une los pasos en UN solo script. Cada paso corre en su propio subshell (un `exit` o un fallo suyo no corta
/// los demás: misma tolerancia que cuando eran llamadas SSH sueltas), marca su inicio en stdout y en el log
/// de preparación, y el stderr de todo el script va a ese log (`vnc_logs` lo muestra). Al final escribe
/// `STEP:fin`: si no aparece, el script se cortó y el último marcador dice dónde.
pub(crate) fn build_script(display: u32, home_dir: &str, steps: &[Step], append: bool) -> String {
    let log = format!("{home_dir}/.cache/labremoto/setup-{display}.log");
    let redirect = if append { ">>" } else { ">" };
    let mut script = format!("exec 2{redirect}\"{log}\"\n");
    for st in steps {
        script.push_str(&format!(
            "echo \"STEP:{n}\" >&2\necho \"STEP:{n}\"\n(\n{cmd}\n)\n",
            n = st.name,
            cmd = st.cmd
        ));
    }
    script.push_str("echo \"STEP:fin\"\n");
    script
}

/// Sube el script por la entrada estándar (sin límite de tamaño de comando), lo ejecuta y lo borra.
/// Devuelve su salida; si no llegó a `STEP:fin`, devuelve el error con el último paso visto.
fn run_batch(sess: &ssh2::Session, display: u32, home_dir: &str, steps: &[Step], append: bool) -> Result<String, String> {
    let dir = format!("{home_dir}/.cache/labremoto");
    let script = build_script(display, home_dir, steps, append);
    let run = format!(
        "mkdir -p {dir} && chmod 700 {dir} && cat > {dir}/setup-{display}.sh && sh {dir}/setup-{display}.sh; \
         rm -f {dir}/setup-{display}.sh"
    );
    let (_, out) = crate::ssh_core::exec::ssh_exec_with_stdin(sess, &run, &script)?;
    if !out.lines().any(|l| l.trim() == "STEP:fin") {
        let last = out
            .lines()
            .rev()
            .find_map(|l| l.trim().strip_prefix("STEP:"))
            .unwrap_or("inicio");
        return Err(format!(
            "La preparación del escritorio se detuvo en el paso «{last}» del display :{display}. \
             Usa «Ver detalles» para ver el log."
        ));
    }
    Ok(out)
}

/// Líneas de salida de un paso (lo que hay entre su marcador `STEP:nombre` y el siguiente), sin espacios extremos.
fn section(out: &str, name: &str) -> String {
    let tag = format!("STEP:{name}");
    let mut found = false;
    let mut lines: Vec<&str> = Vec::new();
    for l in out.lines() {
        if l.trim() == tag {
            found = true;
            continue;
        }
        if found {
            if l.trim().starts_with("STEP:") {
                break;
            }
            lines.push(l);
        }
    }
    lines.join("\n").trim().to_string()
}

/// Primer script: carpetas, accesos, navegador, parche de íconos, panel y detección del fondo de pantalla
/// (el único paso cuya salida necesita Rust para armar el segundo script).
///
/// Con `practica` el escritorio queda acotado a la tarea de la práctica: no se preparan el navegador ni sus accesos,
/// la barra no tiene menú de inicio y solo lleva el acceso a la terminal. Es para enfocar al estudiante, no una
/// barrera de seguridad: esa terminal da exactamente lo mismo que la terminal de la práctica.
pub(crate) fn setup_steps_1(display: u32, home_dir: &str, practica: bool) -> Vec<Step> {
    let rd = run_dir(home_dir, display);
    let chromium_dir = format!("{rd}/chromium");
    let panel_profile = format!("lxde-pi-{display}");
    let browser_desktop = format!("{home_dir}/.local/share/applications/browser-vnc-{display}.desktop");
    let webserver_desktop = format!("{home_dir}/.local/share/applications/webserver-vnc-{display}.desktop");

    let mut steps: Vec<Step> = Vec::new();

    steps.push(step("limpiar", format!(
            // Solo se borra lo de displays SIN escritorio activo (más el nuestro, que se regenera): borrar los perfiles
            // de panel de otro estudiante conectado dejaba a su `lxpanel` reiniciándose sin configuración.
            "ACTIVE=$(ps -eo args= 2>/dev/null | grep -oE '(X[t]igervnc|X[v]nc|X[v]nc-core) :[0-9]+' | grep -oE '[0-9]+$'); \
             for f in {home_dir}/.config/lxpanel/lxde-pi-[0-9]* {home_dir}/.config/pcmanfm/lxde-pi-[0-9]* \
                      {home_dir}/.local/share/applications/browser-vnc-[0-9]*.desktop \
                      {home_dir}/.local/share/applications/webserver-vnc-[0-9]*.desktop; do \
               [ -e \"$f\" ] || continue; \
               n=${{f##*-}}; n=${{n%.desktop}}; \
               [ \"$n\" = \"{display}\" ] || ! echo \"$ACTIVE\" | grep -qx \"$n\" || continue; \
               rm -rf \"$f\"; \
             done; \
             rm -f {home_dir}/Desktop/servidor-web*.desktop {home_dir}/Desktop/labremoto-*.desktop 2>/dev/null; \
             update-desktop-database {home_dir}/.local/share/applications 2>/dev/null; true"
        )));

    steps.push(step("carpetas", format!(
            "mkdir -p {rd}/xdg {chromium_dir}/Default {home_dir}/.local/bin {home_dir}/Desktop; \
             chmod 700 {rd}/xdg 2>/dev/null; true"
        )));

    steps.push(step("libfm", format!(
            "mkdir -p {home_dir}/.config/libfm && \
             grep -q 'quick_exec' {home_dir}/.config/libfm/libfm.conf 2>/dev/null || \
             printf '[config]\\nquick_exec=1\\n' >> {home_dir}/.config/libfm/libfm.conf; true"
        )));

    if !practica {
        steps.push(step("navegador-wrapper", format!(
                "cat > {home_dir}/.local/bin/chromium-browser-{display} << 'WRAPPER_EOF'\n\
    #!/bin/sh\n\
    # Limpiar singleton locks del perfil aislado\n\
    rm -f {chromium_dir}/SingletonLock {chromium_dir}/SingletonCookie {chromium_dir}/SingletonSocket 2>/dev/null\n\
    # Aislar completamente del display fisico\n\
    export DISPLAY=:{display}\n\
    export XDG_RUNTIME_DIR={rd}/xdg\n\
    export DBUS_SESSION_BUS_ADDRESS=\n\
    export XDG_SESSION_TYPE=x11\n\
    LOG={rd}/browser.log\n\
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
            )));

        steps.push(step("navegador-prefs", format!(
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
            )));

        steps.push(step("acceso-navegador", format!(
                "mkdir -p {home_dir}/.local/share/applications && \
                 printf '[Desktop Entry]\\nVersion=1.0\\nName=Web Browser\\nExec={home_dir}/.local/bin/chromium-browser-{display}\\nIcon=web-browser\\nType=Application\\nTerminal=false\\nCategories=Network;WebBrowser;\\n' \
                 > {browser_desktop} && chmod +x {browser_desktop} && \
                 gio set {browser_desktop} metadata::trusted true 2>/dev/null; true"
            )));

        steps.push(step("acceso-servidor-web", format!(
                "printf '[Desktop Entry]\\nVersion=1.0\\nName=Servidor Web Local\\nComment=Ver paginas de Apache (localhost:10000)\\nExec={home_dir}/.local/bin/chromium-browser-{display} http://localhost:10000\\nIcon=text-html\\nType=Application\\nTerminal=false\\nCategories=Network;WebBrowser;\\n' \
                 > {webserver_desktop} && chmod +x {webserver_desktop} && \
                 gio set {webserver_desktop} metadata::trusted true 2>/dev/null && \
                 cp {webserver_desktop} {home_dir}/Desktop/servidor-web.desktop 2>/dev/null && \
                 chmod +x {home_dir}/Desktop/servidor-web.desktop && \
                 gio set {home_dir}/Desktop/servidor-web.desktop metadata::trusted true 2>/dev/null; true"
            )));
    }

    // En Raspberry Pi OS Trixie el libfm de Raspberry (+rpt) pide un argumento extra de escala en
    // fm_pixbuf_from_icon_with_fallback, pero el lxpanel de Debian lo llama con la firma vieja: la escala llega
    // en 0 y NINGÚN ícono de tema carga (y el panel puede caerse). Solo en ese caso se compila un parche mínimo
    // (LD_PRELOAD) que añade escala 1. Sin desajuste no se toca nada; con desajuste y sin gcc no se pone la barra
    // de accesos (saldría rota). El .so vive en ~/.cache (no en /tmp) para que nadie más pueda reemplazarlo.
    steps.push(step("parche-iconos", format!(
            "C={home_dir}/.cache/labremoto; mkdir -p \"$C\" && chmod 700 \"$C\"; \
             rm -f \"$C\"/fmfix-{display}.ok \"$C\"/fmfix-{display}.path; \
             MISMATCH=0; \
             if dpkg-query -W -f='${{Version}}\\n' 'libfm-gtk3-4*' 2>/dev/null | grep -q rpt \
                && ! dpkg-query -W -f='${{Version}}\\n' lxpanel 2>/dev/null | grep -q rpt; then MISMATCH=1; fi; \
             if [ $MISMATCH = 0 ]; then \
               touch \"$C\"/fmfix-{display}.ok; \
             elif command -v gcc >/dev/null 2>&1; then \
               cat > \"$C\"/fmfix.c << 'FMFIX_EOF'\n\
#define _GNU_SOURCE\n\
#include <dlfcn.h>\n\
#include <stdlib.h>\n\
typedef void *(*fn_t)(void *, unsigned, int, const char *);\n\
__attribute__((constructor)) static void fmfix_init(void) {{ unsetenv(\"LD_PRELOAD\"); }}\n\
void *fm_pixbuf_from_icon_with_fallback(void *icon, unsigned size, const char *fallback) {{\n\
    static fn_t real;\n\
    if (!real) real = (fn_t)dlsym(RTLD_NEXT, \"fm_pixbuf_from_icon_with_fallback\");\n\
    return real(icon, size, 1, fallback);\n\
}}\n\
FMFIX_EOF\n\
               gcc -shared -fPIC -O2 -o \"$C\"/fmfix.so \"$C\"/fmfix.c -ldl 2>/dev/null \
                 && echo \"$C\"/fmfix.so > \"$C\"/fmfix-{display}.path \
                 && touch \"$C\"/fmfix-{display}.ok; \
             fi; true"
        )));

    let menu_plugin = if practica {
        String::new()
    } else {
        format!(
            "Plugin {{\n type=menu\n Config {{\n  padding=4\n  image=__START_ICON__\n  \
             item {{\n   name=Navegador web\n   action={home_dir}/.local/bin/chromium-browser-{display}\n  }}\n  \
             item {{\n   name=Archivos\n   action=pcmanfm\n  }}\n  \
             item {{\n   name=Terminal\n   action=lxterminal\n  }}\n  \
             separator {{\n  }}\n  system {{\n  }}\n  separator {{\n  }}\n  \
             item {{\n   command=logout\n  }}\n }}\n}}\n"
        )
    };
    let launch_items = if practica {
        "/usr/share/applications/lxterminal.desktop".to_string()
    } else {
        format!(
            "{browser_desktop} /usr/share/applications/pcmanfm.desktop /usr/share/applications/lxterminal.desktop \
             /usr/share/applications/org.thonny.Thonny.desktop /usr/share/applications/thonny.desktop \
             /usr/share/applications/geany.desktop /usr/share/applications/code.desktop"
        )
    };

    steps.push(step("panel", format!(
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
{menu_plugin}__LAUNCHBAR__\n\
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
  type=cpu\n\
  Config {{\n\
    Color=#00c800\n\
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
             START_ICON=''; \
             for F in /usr/share/icons/PiXtrix/48x48/places/start-here.png /usr/share/icons/*/48x48/places/start-here.png /usr/share/lxpanel/images/my-computer.png; do \
               [ -f \"$F\" ] && START_ICON=\"$F\" && break; \
             done; \
             sed -i \"s#__START_ICON__#${{START_ICON:-start-here}}#\" {home_dir}/.config/lxpanel/{panel_profile}/panels/panel; \
             PANEL_FILE={home_dir}/.config/lxpanel/{panel_profile}/panels/panel; \
             if [ -f {home_dir}/.cache/labremoto/fmfix-{display}.ok ]; then \
               LB={home_dir}/.cache/labremoto/launchbar-{display}.txt; \
               printf 'Plugin {{\\ntype=launchbar\\nConfig {{\\n' > \"$LB\"; \
               for D in {launch_items}; do \
                 [ -f \"$D\" ] && printf 'Button {{\\nid=%s\\n}}\\n' \"$D\" >> \"$LB\"; \
               done; \
               printf '}}\\n}}\\n' >> \"$LB\"; \
               sed -i -e \"/__LAUNCHBAR__/{{r $LB\" -e 'd}}' \"$PANEL_FILE\"; \
             else \
               sed -i '/__LAUNCHBAR__/d' \"$PANEL_FILE\"; \
             fi; \
             mkdir -p {home_dir}/.config/pcmanfm/{panel_profile} && \
             for SRC_PROFILE in LXDE-pi LXDE default; do \
                if [ -d {home_dir}/.config/pcmanfm/$SRC_PROFILE ]; then \
                   cp -r {home_dir}/.config/pcmanfm/$SRC_PROFILE/. {home_dir}/.config/pcmanfm/{panel_profile}/; break; \
                elif [ -d /etc/xdg/pcmanfm/$SRC_PROFILE ]; then \
                   cp -r /etc/xdg/pcmanfm/$SRC_PROFILE/. {home_dir}/.config/pcmanfm/{panel_profile}/; break; \
                fi; \
             done; \
             true"
        )));

    steps.push(step("fondo-detectar", format!(
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
                 $(ls /usr/share/rpd-wallpaper/*.jpg /usr/share/rpd-wallpaper/*.png 2>/dev/null | head -1) \
                 $(ls /usr/share/backgrounds/*.jpg /usr/share/backgrounds/*.png /usr/share/backgrounds/NVIDIA/*.jpg /usr/share/backgrounds/NVIDIA/*.png 2>/dev/null | head -1) \
                 $(ls {home_dir}/Pictures/*.jpg {home_dir}/Pictures/*.png 2>/dev/null | head -1); do \
                 [ -f \"$TRYPATH\" ] && REAL_WP=\"$TRYPATH\" && break; \
               done; \
             fi; \
             \
             echo \"$REAL_WP\""
        )));

    steps
}

/// Segundo script: configuración del fondo, ajustes GTK, xstartup, arranque del escritorio y accesos.
pub(crate) fn setup_steps_2(display: u32, home_dir: &str, wallpaper: &str, practica: bool) -> Vec<Step> {
    let rd = run_dir(home_dir, display);
    let chromium_dir = format!("{rd}/chromium");
    let xstartup_path = format!("{rd}/xstartup.sh");
    let panel_profile = format!("lxde-pi-{display}");
    let browser_desktop = format!("{home_dir}/.local/share/applications/browser-vnc-{display}.desktop");
    let webserver_desktop = format!("{home_dir}/.local/share/applications/webserver-vnc-{display}.desktop");

    let mut steps: Vec<Step> = Vec::new();

    // La ruta del fondo es un dato del equipo remoto: puede traer comillas, espacios o `%`. NO se incrusta dentro de
    // un `printf '...'` (rompía el script); se pasa como variable de shell bien citada y el xstartup la lee de un
    // archivo en el arranque.
    let wp_quoted = sh_quote(wallpaper.trim());
    let wp_file = format!("{home_dir}/.cache/labremoto/wp-{display}.txt");
    // En una práctica el escritorio no muestra la papelera ni las unidades: solo el acceso a la terminal.
    let show = if practica { 0 } else { 1 };

    steps.push(step("fondo-config", format!(
            "WP={wp_quoted}; \
             if [ -n \"$WP\" ]; then MODE_L=1; MODE_M=stretch; else MODE_L=0; MODE_M=color; fi; \
             mkdir -p {home_dir}/.config/pcmanfm/{panel_profile} {home_dir}/.cache/labremoto && \
             printf '%s' \"$WP\" > {wp_file} && \
             {{ printf '[desktop]\\n'; [ -n \"$WP\" ] && printf 'wallpaper=%s\\n' \"$WP\"; \
                printf 'wallpaper_mode=%s\\nwallpaper_common=0\\ndesktop_bg=#2c3e50\\ndesktop_fg=#ffffff\\ndesktop_shadow=#000000\\nshow_trash={show}\\nshow_mounts={show}\\n' \"$MODE_L\"; \
             }} | tee {home_dir}/.config/pcmanfm/{panel_profile}/pcmanfm.conf \
                     {home_dir}/.config/pcmanfm/{panel_profile}/desktop-preferences.conf > /dev/null && \
             {{ printf '[*]\\n'; [ -n \"$WP\" ] && printf 'wallpaper=%s\\n' \"$WP\"; \
                printf 'wallpaper_mode=%s\\ndesktop_bg=#2c3e50\\ndesktop_fg=#ffffff\\ndesktop_shadow=#000000\\nshow_trash={show}\\nshow_mounts={show}\\n' \"$MODE_M\"; \
             }} > {home_dir}/.config/pcmanfm/{panel_profile}/desktop-items-0.conf; true"
        )));

    // Ajustes de GTK propios de esta sesión (no se toca el ~/.config de la Pi). Sin ellos, en un Xvnc sin
    // XSETTINGS, lxpanel no sabe qué tema de íconos usar y los lanzadores salen rotos.
    steps.push(step("gtk", format!(
            "mkdir -p {rd}/xdgcfg/gtk-3.0 {rd}/xdgcfg/gtk-2.0 && \
             THEME=Adwaita; \
             for T in PiXtrix Adwaita; do [ -f /usr/share/icons/$T/index.theme ] && THEME=$T && break; done; \
             printf '[Settings]\\ngtk-icon-theme-name=%s\\ngtk-fallback-icon-theme=hicolor\\ngtk-cursor-theme-name=Adwaita\\ngtk-xft-dpi=98304\\n' \"$THEME\" \
               > {rd}/xdgcfg/gtk-3.0/settings.ini; \
             printf 'gtk-icon-theme-name=\"%s\"\\n' \"$THEME\" > {rd}/xdgcfg/gtk-2.0/gtkrc; true"
        )));

    // Dentro del xstartup el fondo se lee del archivo de arriba (con `$WP` entre comillas), no se incrusta.
    let set_wp_cmd = format!(
        "WP=$(cat {wp_file} 2>/dev/null)\\n\
         [ -n \"$WP\" ] && {{ pcmanfm --set-wallpaper=\"$WP\" 2>/dev/null || pcmanfm --set-wallpaper \"$WP\" 2>/dev/null; }}\\n\
         pcmanfm --reconfigure 2>/dev/null || true"
    );

    steps.push(step("xstartup", format!(
            "printf '#!/bin/sh\\n\
export DISPLAY=:{display}\\n\
export HOME={home_dir}\\n\
export XDG_RUNTIME_DIR={rd}/xdg\\n\
export XDG_DATA_HOME={home_dir}/.local/share\\n\
export XDG_DATA_DIRS={home_dir}/.local/share:/usr/local/share:/usr/share\\n\
export PATH={home_dir}/.local/bin:/usr/local/bin:/usr/bin:/bin\\n\
export XDG_SESSION_TYPE=x11\\n\
export XDG_CONFIG_DIRS={rd}/xdgcfg:/etc/xdg\\n\
export GTK2_RC_FILES={rd}/xdgcfg/gtk-2.0/gtkrc\\n\
export GDK_SCALE=1\\n\
export GDK_DPI_SCALE=1\\n\
export GDK_BACKEND=x11\\n\
export NO_AT_BRIDGE=1\\n\
unset WAYLAND_DISPLAY\\n\
unset DBUS_SESSION_BUS_ADDRESS\\n\
unset DBUS_LAUNCHD_SESSION_BUS_SOCKET\\n\
xsetroot -solid \\#2c3e50 2>/dev/null || true\\n\
rm -f {chromium_dir}/SingletonLock {chromium_dir}/SingletonCookie {chromium_dir}/SingletonSocket 2>/dev/null\\n\
command -v vncconfig >/dev/null 2>&1 && vncconfig -nowin >{rd}/vncconfig.log 2>&1 &\\n\
openbox >{rd}/openbox.log 2>&1 & echo $! > {rd}/openbox.pid\\n\
sleep 2\\n\
OB=$(cat {rd}/openbox.pid)\\n\
( while kill -0 $OB 2>/dev/null; do LD_PRELOAD=\"$(cat {home_dir}/.cache/labremoto/fmfix-{display}.path 2>/dev/null)\" lxpanel --profile {panel_profile} >>{rd}/lxpanel.log 2>&1; sleep 2; done ) &\\n\
pcmanfm --desktop --profile {panel_profile} >{rd}/pcmanfm.log 2>&1 &\\n\
sleep 2\\n\
{set_wp_cmd}\\n\
wait\\n' \
             > {xstartup_path} && chmod +x {xstartup_path}; true",
            set_wp_cmd = set_wp_cmd,
        )));

    steps.push(step("arrancar", format!(
            "DISPLAY=:{display} HOME={home_dir} XDG_RUNTIME_DIR={rd}/xdg \
             XDG_DATA_HOME={home_dir}/.local/share \
             XDG_DATA_DIRS={home_dir}/.local/share:/usr/local/share:/usr/share \
             PATH={home_dir}/.local/bin:/usr/local/bin:/usr/bin:/bin \
             nohup dbus-launch --exit-with-session {xstartup_path} \
             >{rd}/lxsession.log 2>&1 </dev/null & echo started"
        )));

    if !practica {
        steps.push(step("menu-chromium", format!(
                "printf '[Desktop Entry]\\nVersion=1.0\\nName=Chromium Browser\\nComment=Navegador web\\nExec={home_dir}/.local/bin/chromium-browser-{display}\\nIcon=web-browser\\nType=Application\\nCategories=Network;WebBrowser;\\nTerminal=false\\nStartupNotify=true\\n' \
                 > {home_dir}/.local/share/applications/chromium-browser-vnc-{display}.desktop && \
                 chmod +x {home_dir}/.local/share/applications/chromium-browser-vnc-{display}.desktop && \
                 update-desktop-database {home_dir}/.local/share/applications 2>/dev/null; true"
            )));
    }

    steps.push(step("menu-lxterminal", format!(
            "printf '[Desktop Entry]\\nVersion=1.0\\nName=LXTerminal\\nComment=Terminal\\nExec=lxterminal\\nIcon=utilities-terminal\\nType=Application\\nCategories=System;TerminalEmulator;\\nTerminal=false\\nStartupNotify=true\\n' \
             > {home_dir}/.local/share/applications/lxterminal-vnc-{display}.desktop && \
             chmod +x {home_dir}/.local/share/applications/lxterminal-vnc-{display}.desktop && \
             update-desktop-database {home_dir}/.local/share/applications 2>/dev/null; true"
        )));

    if !practica {
        steps.push(step("menu-code", format!(
                "printf '[Desktop Entry]\\nVersion=1.0\\nName=Visual Studio Code\\nComment=Editor de código\\nExec=code --no-sandbox --disable-gpu --user-data-dir={chromium_dir}\\nIcon=vscode\\nType=Application\\nCategories=Development;IDE;\\nTerminal=false\\nStartupNotify=true\\n' \
                 > {home_dir}/.local/share/applications/code-vnc-{display}.desktop && \
                 chmod +x {home_dir}/.local/share/applications/code-vnc-{display}.desktop && \
                 update-desktop-database {home_dir}/.local/share/applications 2>/dev/null; true"
            )));
    }

    if !practica {
        steps.push(step("menu-servidor-web", format!(
                "printf '[Desktop Entry]\\nVersion=1.0\\nName=Servidor Web Local\\nComment=Ver paginas de Apache (localhost:10000)\\nExec={home_dir}/.local/bin/chromium-browser-{display} http://localhost:10000\\nIcon=text-html\\nType=Application\\nCategories=Network;WebBrowser;\\nTerminal=false\\nStartupNotify=true\\n' \
                 > {webserver_desktop} && chmod +x {webserver_desktop} && \
                 gio set {webserver_desktop} metadata::trusted true 2>/dev/null && \
                 cp {webserver_desktop} {home_dir}/Desktop/servidor-web.desktop 2>/dev/null && \
                 chmod +x {home_dir}/Desktop/servidor-web.desktop && \
                 gio set {home_dir}/Desktop/servidor-web.desktop metadata::trusted true 2>/dev/null; true"
            )));
    }

    // Accesos a las herramientas en el escritorio. lxpanel no logra dibujar íconos de tema en Debian 13, pero
    // pcmanfm --desktop sí, así que, cuando la barra de accesos no puede usarse (ver fmfix arriba), los accesos rápidos
    // van como íconos del escritorio (solo los instalados). Con la barra funcionando no se crean.
    if practica {
        // Práctica: un solo ícono, «Terminal», siempre (la tarea es abrirlo con doble clic).
        steps.push(step("accesos-escritorio", format!(
                "D={home_dir}/Desktop/labremoto-terminal.desktop; \
                 printf '[Desktop Entry]\\nVersion=1.0\\nType=Application\\nName=Terminal\\nComment=Escribir órdenes\\nExec=lxterminal\\nIcon=utilities-terminal\\nTerminal=false\\n' > \"$D\" && \
                 chmod +x \"$D\" && gio set \"$D\" metadata::trusted true 2>/dev/null; true"
            )));
    } else {
        steps.push(step("accesos-escritorio", format!(
                "[ -f {home_dir}/.cache/labremoto/fmfix-{display}.ok ] && exit 0; \
                 cp {browser_desktop} {home_dir}/Desktop/labremoto-navegador.desktop 2>/dev/null; \
                 for A in pcmanfm lxterminal org.thonny.Thonny thonny geany code; do \
                   F=/usr/share/applications/$A.desktop; \
                   [ -f \"$F\" ] && cp \"$F\" {home_dir}/Desktop/labremoto-$A.desktop 2>/dev/null; \
                 done; \
                 for D in {home_dir}/Desktop/labremoto-*.desktop; do \
                   [ -f \"$D\" ] || continue; \
                   chmod +x \"$D\" && gio set \"$D\" metadata::trusted true 2>/dev/null; \
                 done; true"
            )));
    }


    steps
}

/// Detiene todos los procesos remotos asociados a una sesión VNC.
pub(crate) fn stop_vnc_server(
    sess: &ssh2::Session,
    display: u32,
    home_dir: &str,
) -> Result<(), String> {
    let rd = run_dir(home_dir, display);
    let xstartup_path = format!("{rd}/xstartup.sh");
    let panel_profile = format!("lxde-pi-{display}");
    let browser_desktop = format!("/tmp/browser-{display}.desktop");
    let webserver_desktop = format!("/tmp/webserver-{display}.desktop");
    let _ = ssh_exec_session(
        sess,
        &format!(
            "pkill -f '[l]abremoto/d{display}/xstartup.sh$' 2>/dev/null; \
             kill $(cat {rd}/openbox.pid 2>/dev/null) 2>/dev/null; \
             pkill -f '[l]xpanel --profile {panel_profile}$' 2>/dev/null; \
             pkill -f '[p]cmanfm --desktop --profile {panel_profile}$' 2>/dev/null; \
             {kill_term} \
             sleep 0.5; \
             {kill_9} \
             rm -f /tmp/.X{display}-lock /tmp/.X11-unix/X{display} \
                   {xstartup_path} {rd}/openbox.pid \
                   {browser_desktop} {webserver_desktop} \
                   {home_dir}/Desktop/servidor-web.desktop {home_dir}/Desktop/labremoto-*.desktop 2>/dev/null; \
             rm -rf {rd}/xdg 2>/dev/null; \
             true",
            kill_term = kill_display_cmd(&display.to_string(), "", false),
            kill_9 = kill_display_cmd(&display.to_string(), "-9", false)
        ),
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::process::{Command, Stdio};

    /// `sh -n` (solo sintaxis). Se omite si el equipo no tiene `sh` (p. ej. Windows sin Git Bash).
    fn sh_syntax(script: &str) -> Option<Result<(), String>> {
        let mut child = Command::new("sh")
            .arg("-n")
            .stdin(Stdio::piped())
            .stderr(Stdio::piped())
            .stdout(Stdio::null())
            .spawn()
            .ok()?;
        child.stdin.take()?.write_all(script.as_bytes()).ok()?;
        let out = child.wait_with_output().ok()?;
        Some(if out.status.success() { Ok(()) } else { Err(String::from_utf8_lossy(&out.stderr).to_string()) })
    }

    fn assert_syntax(label: &str, script: &str) {
        match sh_syntax(script) {
            Some(Ok(())) => {}
            Some(Err(e)) => panic!("{label}: sh -n falló:\n{e}"),
            None => eprintln!("{label}: sin `sh` en este equipo, se omite la comprobación de sintaxis"),
        }
    }

    #[test]
    fn scripts_de_preparacion_tienen_sintaxis_valida() {
        for practica in [false, true] {
            assert_syntax(&format!("script 1 (práctica={practica})"), &build_script(20, "/home/pi", &setup_steps_1(20, "/home/pi", practica), false));
            assert_syntax(&format!("script 2 con fondo (práctica={practica})"), &build_script(20, "/home/pi", &setup_steps_2(20, "/home/pi", "/usr/share/bg.jpg", practica), true));
            assert_syntax(&format!("script 2 sin fondo (práctica={practica})"), &build_script(20, "/home/pi", &setup_steps_2(20, "/home/pi", "", practica), true));
        }
    }

    #[test]
    fn fondo_con_comilla_no_rompe_la_sintaxis() {
        assert_syntax(
            "script 2 con comilla",
            &build_script(21, "/home/pi", &setup_steps_2(21, "/home/pi", "/home/pi/Imágenes/o'brien.jpg", false), true),
        );
    }

    #[test]
    fn los_pasos_tienen_nombres_unicos_y_el_script_termina_en_fin() {
        for practica in [false, true] {
            let mut names: Vec<&str> = setup_steps_1(20, "/h", practica).iter().map(|s| s.name).collect();
            names.extend(setup_steps_2(20, "/h", "", practica).iter().map(|s| s.name));
            let total = names.len();
            names.sort_unstable();
            names.dedup();
            assert_eq!(names.len(), total, "hay nombres de paso repetidos (práctica={practica})");
            assert!(build_script(20, "/h", &setup_steps_1(20, "/h", practica), false).trim_end().ends_with("echo \"STEP:fin\""));
        }
    }

    #[test]
    fn el_escritorio_de_practica_solo_ofrece_la_terminal() {
        let todo = |practica: bool| {
            let mut t = build_script(20, "/home/pi", &setup_steps_1(20, "/home/pi", practica), false);
            t.push_str(&build_script(20, "/home/pi", &setup_steps_2(20, "/home/pi", "", practica), true));
            t
        };
        let practica = todo(true);
        assert!(!practica.contains("type=menu"), "la práctica no lleva menú de inicio");
        assert!(!practica.contains("chromium-browser-20"), "la práctica no prepara el navegador");
        assert!(!practica.contains("pcmanfm.desktop"), "la práctica no ofrece el explorador de archivos");
        assert!(practica.contains("labremoto-terminal.desktop"), "la práctica pone el ícono Terminal");
        assert!(practica.contains("show_trash=0"), "la práctica oculta la papelera");
        let normal = todo(false);
        assert!(normal.contains("type=menu") && normal.contains("chromium-browser-20"), "el escritorio normal no cambia");
    }

    #[test]
    fn los_archivos_del_display_no_van_a_tmp() {
        // /tmp es compartido: un archivo con nombre fijo que dejó otro usuario no se puede sobrescribir y el
        // escritorio no arrancaba. Solo los locks y sockets de X (convención del sistema) siguen en /tmp.
        for practica in [true, false] {
            let mut t = build_script(22, "/home/ana", &setup_steps_1(22, "/home/ana", practica), false);
            t.push_str(&build_script(22, "/home/ana", &setup_steps_2(22, "/home/ana", "", practica), true));
            let fuera: Vec<&str> = t.match_indices("/tmp/").map(|(i, _)| &t[i..(i + 20).min(t.len())]).filter(|s| !s.starts_with("/tmp/.X")).collect();
            assert!(fuera.is_empty(), "rutas por display en /tmp: {fuera:?}");
            assert!(t.contains("/home/ana/.cache/labremoto/d22/xstartup.sh"));
        }
    }

    #[test]
    fn section_extrae_solo_la_salida_de_su_paso() {
        let out = "STEP:a\nuno\nSTEP:fondo-detectar\n/usr/share/bg.jpg\n\nSTEP:b\notro\nSTEP:fin\n";
        assert_eq!(section(out, "fondo-detectar"), "/usr/share/bg.jpg");
        assert_eq!(section(out, "a"), "uno");
        assert_eq!(section(out, "no-existe"), "");
    }

    #[test]
    fn los_pkill_de_la_lista_unificada_llevan_corchetes() {
        let cmd = kill_display_cmd("20", "-9", true);
        for l in cmd.split(';').map(str::trim).filter(|l| l.starts_with("pkill")) {
            let patron = l.split('"').nth(1).unwrap_or("");
            assert!(patron.starts_with("[X]") || patron.starts_with("[x]"), "pkill sin corchetes: {l}");
        }
    }
}
