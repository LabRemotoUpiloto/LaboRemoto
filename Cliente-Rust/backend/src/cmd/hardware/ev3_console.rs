//! Consola de Python del panel EV3: el estudiante escribe un programa, la app
//! lo manda al robot y lo corre allá, mostrando su salida en vivo.
//!
//! Camino: cliente →(SSH)→ bastión (Pi4) →(`ev3-hop-robot.sh`)→ Pi5 → robot.
//! No usa el puente HTTP (`ev3_bridge.py`): el script de salto al robot ya
//! ejecuta cualquier comando como el usuario `robot`, y un WebSocket no
//! viaja por el canal SSH+`curl` que usa el resto del panel.
//!
//! Los comandos que se mandan al robot son PLANTILLAS fijas: lo único que
//! aporta el estudiante es el código (viaja en base64, sin que toque el
//! texto del comando) y un identificador de ejecución que genera el backend.
//!
//! Reglas del robot compartido:
//! - un solo programa a la vez (`mkdir` atómico de un directorio candado);
//! - tiempo máximo `MAX_RUN_SECONDS` (`timeout`);
//! - al terminar por cualquier causa (fin, tiempo, Detener) se frenan los
//!   motores desde el propio robot (`/sys/class/tacho-motor`), porque ev3dev
//!   los deja girando cuando el proceso muere.
//!
//! Se usa SIGTERM y no SIGINT para cortar: un proceso lanzado en segundo
//! plano desde un shell no interactivo hereda SIGINT ignorado y Python
//! respetaría ese «ignorado», así que Ctrl+C no haría nada.

use base64::Engine;
use serde::Serialize;

use super::ev3::{bash_quote, map_ssh_transport_error, HOP_RUNNER};
use crate::cmd::protocol::CommandError;

const HOP_ROBOT: &str = "/home/pi/ev3-hop-robot.sh";
const WORK_DIR: &str = "/home/robot/estudiantes";
const LOCK_DIR: &str = "/tmp/ev3run.lock";
const MAX_CODE_BYTES: usize = 20_000;
const MAX_RUN_SECONDS: u32 = 120;
const POLL_CHUNK_BYTES: usize = 8192;

/// Envuelve un comando para que corra en el robot (vía Pi4 → Pi5 → EV3).
fn hop_robot(cmd: &str) -> String {
    format!("{} {} {}", HOP_RUNNER, HOP_ROBOT, bash_quote(cmd))
}

/// Id de ejecución: 8 a 32 caracteres hexadecimales en minúscula.
fn valid_run_id(s: &str) -> bool {
    (8..=32).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// Detiene todos los motores desde el robot (ev3dev: sysfs).
const STOP_MOTORS: &str = "for m in /sys/class/tacho-motor/motor*; do echo stop > $m/command; done 2>/dev/null";

fn start_command(run_id: &str, code_b64: &str) -> String {
    format!(
        "d={work}; mkdir -p $d && cd $d || exit 4; \
         find . -maxdepth 1 -type f \\( -name 'prog_*' -o -name 'out_*' -o -name 'exit_*' \\) -mmin +60 -delete 2>/dev/null; \
         L={lock}; \
         if ! mkdir $L 2>/dev/null; then \
           p=$(cat $L/pid 2>/dev/null); \
           if kill -0 \"$p\" 2>/dev/null; then echo BUSY; exit 3; fi; \
           if [ -z \"$p\" ] && [ -z \"$(find $L -maxdepth 0 -mmin +1)\" ]; then echo BUSY; exit 3; fi; \
           rm -rf $L; mkdir $L || exit 5; \
         fi; \
         echo {b64} | base64 -d > prog_{rid}.py; \
         nohup setsid sh -c 'echo $$ > {lock}/pid; echo {rid} > {lock}/rid; \
           timeout {secs} python3 -u prog_{rid}.py > out_{rid}.log 2>&1; echo $? > exit_{rid}; \
           {stop}; rm -rf {lock}' > /dev/null 2>&1 < /dev/null & \
         echo STARTED",
        work = WORK_DIR,
        lock = LOCK_DIR,
        b64 = code_b64,
        rid = run_id,
        secs = MAX_RUN_SECONDS,
        stop = STOP_MOTORS,
    )
}

fn poll_command(run_id: &str, offset: u64) -> String {
    format!(
        "cd {work} 2>/dev/null || {{ echo GONE; echo; exit 0; }}; \
         if [ -f exit_{rid} ]; then echo \"DONE $(cat exit_{rid})\"; \
         elif [ -f prog_{rid}.py ]; then echo RUNNING; else echo GONE; fi; \
         tail -c +{from} out_{rid}.log 2>/dev/null | head -c {chunk} | base64 -w0; echo",
        work = WORK_DIR,
        rid = run_id,
        from = offset + 1,
        chunk = POLL_CHUNK_BYTES,
    )
}

fn stop_command(run_id: &str) -> String {
    format!(
        "cd {work} 2>/dev/null || exit 0; \
         if [ \"$(cat {lock}/rid 2>/dev/null)\" = {rid} ]; then \
           p=$(cat {lock}/pid 2>/dev/null); \
           kill -TERM -- -$p 2>/dev/null; sleep 1; kill -KILL -- -$p 2>/dev/null; \
           [ -f exit_{rid} ] || echo 143 > exit_{rid}; \
           {stop}; rm -rf {lock}; echo STOPPED; \
         else {stop}; echo NOTRUNNING; fi",
        work = WORK_DIR,
        lock = LOCK_DIR,
        rid = run_id,
        stop = STOP_MOTORS,
    )
}

#[derive(Serialize, Debug, Clone)]
pub struct Ev3RunStarted {
    pub run_id: String,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Ev3RunOutput {
    /// Texto nuevo desde `offset` (puede venir vacío).
    pub chunk: String,
    /// Offset a pedir en la próxima consulta.
    pub next_offset: u64,
    /// "running" | "done" | "gone".
    pub state: String,
    pub exit_code: Option<i32>,
}

/// Interpreta la salida de `poll_command`: línea 1 = estado, línea 2 = base64.
fn parse_poll(out: &str, offset: u64) -> Ev3RunOutput {
    let mut lines = out.lines();
    let head = lines.next().unwrap_or("").trim();
    let b64 = lines.next().unwrap_or("").trim();

    let (state, exit_code) = if let Some(code) = head.strip_prefix("DONE") {
        ("done", code.trim().parse::<i32>().ok())
    } else if head == "RUNNING" {
        ("running", None)
    } else {
        ("gone", None)
    };

    let bytes = base64::engine::general_purpose::STANDARD.decode(b64).unwrap_or_default();
    Ev3RunOutput {
        chunk: String::from_utf8_lossy(&bytes).into_owned(),
        next_offset: offset + bytes.len() as u64,
        state: state.to_string(),
        exit_code,
    }
}

/// Sube el programa al robot y lo ejecuta en segundo plano.
#[tauri::command]
pub async fn ev3_run_start(id: String, code: String) -> Result<Ev3RunStarted, CommandError> {
    if code.trim().is_empty() {
        return Err(CommandError::permanent("INVALID_DATA", "El programa está vacío.").with_context("ev3_run_start", &id));
    }
    if code.len() > MAX_CODE_BYTES || code.contains('\0') {
        return Err(CommandError::permanent(
            "INVALID_DATA",
            format!("El programa es demasiado largo (máximo {} caracteres).", MAX_CODE_BYTES),
        )
        .with_context("ev3_run_start", &id));
    }
    let run_id = uuid::Uuid::new_v4().simple().to_string()[..12].to_string();
    let b64 = base64::engine::general_purpose::STANDARD.encode(code.as_bytes());
    let cmd = hop_robot(&start_command(&run_id, &b64));

    tokio::task::spawn_blocking(move || {
        let (_st, out) = crate::ssh_core::exec::ssh_exec(&id, &cmd)
            .map_err(|e| map_ssh_transport_error(&id, "ev3_run_start", e))?;
        let out = out.trim();
        if out.contains("BUSY") {
            return Err(CommandError::permanent(
                "ROBOT_BUSY",
                "El robot está ejecutando el programa de otra persona. Espera a que termine e inténtalo de nuevo.",
            )
            .with_context("ev3_run_start", &id));
        }
        if !out.ends_with("STARTED") {
            return Err(CommandError::transient(
                "COMMUNICATION_ERROR",
                format!("No se pudo iniciar el programa en el robot (¿robot apagado o sin red?). Respuesta: {out:?}"),
            )
            .with_context("ev3_run_start", &id));
        }
        Ok(Ev3RunStarted { run_id })
    })
    .await
    .map_err(|e| CommandError::internal("TASK_JOIN_ERROR", e.to_string()))?
}

/// Lee la salida nueva (desde `offset`) y el estado de una ejecución.
#[tauri::command]
pub async fn ev3_run_output(id: String, run_id: String, offset: u64) -> Result<Ev3RunOutput, CommandError> {
    if !valid_run_id(&run_id) {
        return Err(CommandError::permanent("INVALID_DATA", "Identificador de ejecución inválido.").with_context("ev3_run_output", &id));
    }
    let cmd = hop_robot(&poll_command(&run_id, offset));
    tokio::task::spawn_blocking(move || {
        let (_st, out) = crate::ssh_core::exec::ssh_exec(&id, &cmd)
            .map_err(|e| map_ssh_transport_error(&id, "ev3_run_output", e))?;
        Ok(parse_poll(&out, offset))
    })
    .await
    .map_err(|e| CommandError::internal("TASK_JOIN_ERROR", e.to_string()))?
}

/// Corta la ejecución (solo si es la que tiene el robot) y frena los motores.
#[tauri::command]
pub async fn ev3_run_stop(id: String, run_id: String) -> Result<(), CommandError> {
    if !valid_run_id(&run_id) {
        return Err(CommandError::permanent("INVALID_DATA", "Identificador de ejecución inválido.").with_context("ev3_run_stop", &id));
    }
    let cmd = hop_robot(&stop_command(&run_id));
    tokio::task::spawn_blocking(move || {
        crate::ssh_core::exec::ssh_exec(&id, &cmd)
            .map(|_| ())
            .map_err(|e| map_ssh_transport_error(&id, "ev3_run_stop", e))
    })
    .await
    .map_err(|e| CommandError::internal("TASK_JOIN_ERROR", e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Si hay `bash` disponible, la sintaxis de cada plantilla debe ser válida.
    fn bash_syntax_ok(cmd: &str) -> bool {
        // En Windows `bash` puede ser el stub de WSL sin distribución: si ni
        // `exit 0` corre, no hay forma de comprobar y se omite.
        let bash_funciona = std::process::Command::new("bash")
            .arg("-c")
            .arg("exit 0")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if !bash_funciona {
            return true;
        }
        match std::process::Command::new("bash").arg("-n").arg("-c").arg(cmd).output() {
            Ok(o) => {
                if !o.status.success() {
                    eprintln!("bash -n falló: {}\ncomando: {cmd}", String::from_utf8_lossy(&o.stderr));
                }
                o.status.success()
            }
            Err(_) => true, // sin bash en este equipo: no se puede comprobar
        }
    }

    #[test]
    fn run_id_solo_acepta_hex_corto() {
        assert!(valid_run_id("0123456789ab"));
        assert!(!valid_run_id("abc"));
        assert!(!valid_run_id("ABCDEF123456"));
        assert!(!valid_run_id("0123456789a; rm -rf /"));
        assert!(!valid_run_id(&"a".repeat(33)));
    }

    #[test]
    fn plantillas_tienen_sintaxis_valida() {
        let rid = "0123456789ab";
        assert!(bash_syntax_ok(&start_command(rid, "cHJpbnQoMSk=")));
        assert!(bash_syntax_ok(&poll_command(rid, 0)));
        assert!(bash_syntax_ok(&poll_command(rid, 12345)));
        assert!(bash_syntax_ok(&stop_command(rid)));
    }

    #[test]
    fn el_comando_envuelto_usa_solo_el_script_de_salto_al_robot() {
        let c = hop_robot(&start_command("0123456789ab", "AAAA"));
        assert!(c.starts_with("sudo -n -u pi /home/pi/ev3-hop-robot.sh '"));
        assert!(!c.contains('\n'));
    }

    #[test]
    fn el_codigo_del_estudiante_nunca_va_en_claro_en_el_comando() {
        let code = "import os; os.system('rm -rf /'); print(\"hola\")";
        let b64 = base64::engine::general_purpose::STANDARD.encode(code.as_bytes());
        let cmd = start_command("0123456789ab", &b64);
        assert!(!cmd.contains("rm -rf /'"));
        assert!(!cmd.contains("os.system"));
        assert!(cmd.contains(&b64));
    }

    #[test]
    fn el_inicio_tiene_candado_tiempo_maximo_y_frena_motores() {
        let cmd = start_command("0123456789ab", "AAAA");
        assert!(cmd.contains("mkdir $L"));
        assert!(cmd.contains("timeout 120 python3 -u"));
        assert!(cmd.contains("tacho-motor"));
    }

    #[test]
    fn poll_pide_desde_el_byte_siguiente() {
        assert!(poll_command("0123456789ab", 0).contains("tail -c +1 "));
        assert!(poll_command("0123456789ab", 100).contains("tail -c +101 "));
    }

    #[test]
    fn parse_poll_corriendo_con_salida() {
        let b64 = base64::engine::general_purpose::STANDARD.encode("hola\n".as_bytes());
        let r = parse_poll(&format!("RUNNING\n{b64}\n"), 10);
        assert_eq!(r, Ev3RunOutput { chunk: "hola\n".into(), next_offset: 15, state: "running".into(), exit_code: None });
    }

    #[test]
    fn parse_poll_terminado_con_codigo() {
        let r = parse_poll("DONE 1\n\n", 7);
        assert_eq!(r.state, "done");
        assert_eq!(r.exit_code, Some(1));
        assert_eq!(r.chunk, "");
        assert_eq!(r.next_offset, 7);
    }

    #[test]
    fn parse_poll_sin_respuesta_es_gone() {
        assert_eq!(parse_poll("", 3).state, "gone");
        assert_eq!(parse_poll("basura\n!!!\n", 3).state, "gone");
    }
}
