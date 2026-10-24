//! cmd/vnc.rs — Sesiones de escritorio gráfico remoto
//!
//! Ciclo de vida:
//!   vnc_start → detecta display/puerto libre → arranca Xvnc+Openbox
//!             → abre bridge WS↔SSH(direct-tcpip) → devuelve ws_port al frontend
//!   vnc_stop  → señala al bridge que pare → mata procesos remotos
//!
//! El bridge corre en un hilo OS dedicado. Lo inicia vnc_start y se detiene
//! automáticamente cuando se descarta el VncSessionState (Drop).

pub mod bridge;
pub mod server;
pub mod utils;

use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
use std::sync::atomic::AtomicBool;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::cmd::state::SESSIONS;
use crate::error::AppError;
use crate::cmd::protocol::CommandError;

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
// Comandos Tauri
// ─────────────────────────────────────────────────────────────────────────────

/// Un candado por sesión SSH: serializa los `vnc_start`. Si la interfaz (o el usuario) dispara dos arranques
/// seguidos, el segundo espera al primero y, al entrar, ve `vnc_session` ya creada y devuelve esa misma sesión
/// en vez de levantar un segundo Xvnc que choca en el display y el puerto del primero.
static START_LOCKS: OnceLock<std::sync::Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>> = OnceLock::new();

/// Último intento de escritorio por sesión SSH: (display, home remoto). Lo usa `vnc_logs` para leer los logs de
/// un arranque que FALLÓ (en ese caso `vnc_session` nunca llega a guardarse).
static LAST_START: OnceLock<std::sync::Mutex<HashMap<String, (u32, String)>>> = OnceLock::new();

fn session_lock(session_id: &str) -> Result<Arc<tokio::sync::Mutex<()>>, CommandError> {
    let mut locks = START_LOCKS
        .get_or_init(Default::default)
        .lock()
        .map_err(|_| CommandError::internal("LOCK_POISONED", "START_LOCKS lock poisoned"))?;
    Ok(locks.entry(session_id.to_string()).or_default().clone())
}

/// Inicia una sesión de escritorio gráfico sobre una conexión SSH activa.
///
/// `perfil`: `"practica"` arranca el escritorio acotado de las prácticas (solo el acceso a la terminal, sin menú
/// de inicio, navegador ni explorador de archivos). Sin perfil, el escritorio completo de siempre.
#[tauri::command]
pub async fn vnc_start(
    app: AppHandle,
    session_id: String,
    resolution: Option<String>,
    perfil: Option<String>,
) -> Result<VncSessionInfo, CommandError> {
    let res = resolution.unwrap_or_else(|| "1280x720".to_string());
    let practica = match perfil.as_deref() {
        None | Some("") | Some("completo") => false,
        Some("practica") => true,
        Some(otro) => {
            return Err(CommandError::permanent(
                "VALIDATION_FAILED",
                format!("Perfil de escritorio inválido '{otro}'. Opciones: completo, practica"),
            ))
        }
    };

    const VALID: &[&str] = &["1024x768", "1280x720", "1280x800", "1920x1080"];
    if !VALID.contains(&res.as_str()) {
        return Err(CommandError::permanent(
            "VALIDATION_FAILED",
            format!("Resolución inválida '{res}'. Opciones: {}", VALID.join(", ")),
        ));
    }

    let start_lock = session_lock(&session_id)?;
    let _start_guard = start_lock.lock().await;

    let (host, port, user, password) = {
        let map = SESSIONS.lock().map_err(|_| CommandError::internal("LOCK_POISONED", "SESSIONS lock poisoned"))?;
        let sess = map
            .get(&session_id)
            .ok_or_else(|| CommandError::from(AppError::NotFoundSession))?;

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

    let h = host.clone();
    let u = user.clone();
    let p = password.clone();
    let r = res.clone();
    let sid_attempt = session_id.clone();

    let setup_result: Result<(u32, u16, std::net::TcpListener, u16, bool, String), CommandError> =
        tokio::task::spawn_blocking(move || -> Result<(u32, u16, std::net::TcpListener, u16, bool, String), CommandError> {
            let (_tcp_setup, setup_sess) =
                crate::ssh_core::ssh2_sftp::connect_password(&h, port, &u, &p)
                    .map_err(|e| CommandError::transient("SSH_ERROR", format!("Conexión SSH para setup VNC falló: {e}")))?;

            let home_dir = utils::get_remote_home(&setup_sess);
            utils::check_dependencies(&setup_sess, true)
                .map_err(|e| CommandError::permanent("VNC_DEPS_MISSING", e))?;
            crate::cmd::state::run_pending_vnc_cleanups(&setup_sess);
            let (display, vnc_port) = utils::reserve_display_and_port(&setup_sess, &home_dir)
                .map_err(|e| CommandError::transient("IO_ERROR", e))?;
            if let Ok(mut last) = LAST_START.get_or_init(Default::default).lock() {
                last.insert(sid_attempt, (display, home_dir.clone()));
            }
            server::start_vnc_server(&setup_sess, display, vnc_port, &r, &home_dir, practica)
                .map_err(|e| CommandError::transient("IO_ERROR", e))?;

            let ws_listener = std::net::TcpListener::bind("127.0.0.1:0")
                .map_err(|e| CommandError::transient("IO_ERROR", format!("No se pudo abrir el listener WS local: {e}")))?;

            let fwd_listener = std::net::TcpListener::bind("127.0.0.1:0")
                .map_err(|e| CommandError::transient("IO_ERROR", format!("No se pudo reservar puerto local para ssh -L: {e}")))?;
            let local_fwd_port = fwd_listener
                .local_addr()
                .map_err(|e| CommandError::transient("IO_ERROR", e.to_string()))?
                .port();
            drop(fwd_listener);

            Ok((display, vnc_port, ws_listener, local_fwd_port, true, home_dir))
        })
        .await
        .map_err(|e| CommandError::internal("TASK_JOIN_ERROR", format!("Error interno (spawn_blocking): {e}")))?;

    // Dependencias faltantes: además del error normal (que ya se muestra en
    // el panel de escritorio), avisamos por el chat con la explicación y el
    // comando sugerido — más visible/accionable que el cuadro de error.
    if let Err(ref err) = setup_result {
        if err.code == "VNC_DEPS_MISSING" {
            let _ = app.emit(
                &format!("vnc_deps_missing_{session_id}"),
                serde_json::json!({ "message": err.message }),
            );
        }
    }

    let (display, vnc_port, ws_listener, local_fwd_port, is_virtual, home_dir) = setup_result?;

    let ws_port = ws_listener
        .local_addr()
        .map_err(|e| CommandError::transient("IO_ERROR", e.to_string()))?
        .port();

    let stop_flag  = Arc::new(AtomicBool::new(false));
    let stop_clone = stop_flag.clone();
    let (h, u, p)  = (host.clone(), user.clone(), password.clone());

    let fwd_h = host.clone();
    let fwd_u = user.clone();
    let fwd_p = password.clone();
    let fwd_stop = stop_flag.clone();

    let fwd_listener = std::net::TcpListener::bind(format!("127.0.0.1:{local_fwd_port}"))
        .map_err(|e| CommandError::transient("IO_ERROR", format!("No se pudo abrir port-forward listener en {local_fwd_port}: {e}")))?;
    fwd_listener.set_nonblocking(true).ok();

    std::thread::Builder::new()
        .name(format!("vnc-fwd-{session_id}"))
        .spawn(move || {
            bridge::run_port_forward(fwd_listener, fwd_h, port, fwd_u, fwd_p, vnc_port, fwd_stop);
        })
        .map_err(|e| CommandError::internal("TASK_JOIN_ERROR", format!("No se pudo lanzar el hilo port-forward: {e}")))?;

    std::thread::sleep(std::time::Duration::from_millis(100));

    let ssh_fwd_child: Option<std::process::Child> = None;

    let app_bridge = app.clone();
    let sid_bridge = session_id.clone();
    let bridge = std::thread::Builder::new()
        .name(format!("vnc-bridge-{session_id}"))
        .spawn(move || {
            bridge::run_bridge_thread(
                ws_listener, h, port, u, p, vnc_port, display, stop_clone,
                app_bridge, sid_bridge, local_fwd_port,
            );
        })
        .map_err(|e| CommandError::internal("TASK_JOIN_ERROR", format!("No se pudo lanzar el hilo bridge VNC: {e}")))?;

    {
        let mut map = SESSIONS.lock().map_err(|_| CommandError::internal("LOCK_POISONED", "SESSIONS lock poisoned"))?;
        let sess = map
            .get_mut(&session_id)
            .ok_or_else(|| CommandError::from(AppError::NotFoundSession))?;
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

/// Devuelve el final de los logs del último escritorio que se intentó levantar en esta sesión (Xvnc, preparación,
/// openbox, panel, pcmanfm y arranque). Es lo que muestra el botón «Ver detalles» del panel de error.
#[tauri::command]
pub async fn vnc_logs(session_id: String) -> Result<String, CommandError> {
    let (display, home_dir) = LAST_START
        .get()
        .and_then(|m| m.lock().ok().and_then(|m| m.get(&session_id).cloned()))
        .ok_or_else(|| CommandError::permanent("NO_VNC_ATTEMPT", "Todavía no hay un intento de escritorio remoto en esta sesión."))?;

    let (host, port, user, password) = {
        let map = SESSIONS.lock().map_err(|_| CommandError::internal("LOCK_POISONED", "SESSIONS lock poisoned"))?;
        let sess = map.get(&session_id).ok_or_else(|| CommandError::from(AppError::NotFoundSession))?;
        (sess.host.clone(), sess.port, sess.user.clone(), sess.password.clone())
    };

    tokio::task::spawn_blocking(move || -> Result<String, CommandError> {
        let (_tcp, sess) = crate::ssh_core::ssh2_sftp::connect_password(&host, port, &user, &password)
            .map_err(|e| CommandError::transient("SSH_ERROR", format!("No se pudo leer el log: {e}")))?;
        let cmd = format!(
            "for f in /tmp/xvnc{display}.log {home_dir}/.cache/labremoto/setup-{display}.log \
                      /tmp/openbox{display}.log /tmp/lxpanel{display}.log /tmp/pcmanfm{display}.log \
                      /tmp/lxsession{display}.log; do \
               [ -f \"$f\" ] || continue; \
               echo \"== $f\"; tail -n 15 \"$f\" 2>/dev/null; \
             done; true"
        );
        let (_, out) = crate::ssh_core::exec::ssh_exec_session(&sess, &cmd)
            .map_err(|e| CommandError::transient("SSH_ERROR", e))?;
        let out = out.trim().to_string();
        if out.is_empty() {
            return Ok(format!("No hay logs del display :{display} en la Pi (todavía no se escribió ninguno)."));
        }
        // Tope: lo más reciente, para no llenar la interfaz.
        const MAX: usize = 6000;
        if out.chars().count() > MAX {
            let skip = out.chars().count() - MAX;
            return Ok(format!("…\n{}", out.chars().skip(skip).collect::<String>()));
        }
        Ok(out)
    })
    .await
    .map_err(|e| CommandError::internal("TASK_JOIN_ERROR", e.to_string()))?
}

/// Programas cuya ventana puede comprobar una práctica en el escritorio remoto (nombre de la tarea → proceso).
fn proceso_de_programa(programa: &str) -> Option<&'static str> {
    match programa {
        "terminal" => Some("lxterminal"),
        _ => None,
    }
}

/// Comando de shell que responde `si` si el usuario de la sesión tiene `proceso` abierto EN el display dado
/// (mira la variable DISPLAY de cada proceso: otro escritorio del mismo usuario no cuenta).
fn cmd_programa_abierto(proceso: &str, display: u32) -> String {
    format!(
        "for p in $(pgrep -u \"$(id -u)\" -x {proceso} 2>/dev/null); do \
           tr '\\0' '\\n' < /proc/$p/environ 2>/dev/null | grep -qE '^DISPLAY=:{display}(\\.0)?$' && {{ echo si; exit 0; }}; \
         done; echo no"
    )
}

/// Dice si el estudiante abrió `programa` (hoy solo `"terminal"`) en el escritorio remoto de esta sesión. Lo usa
/// la práctica para avanzar sola cuando la tarea del escritorio está hecha. Sin escritorio activo devuelve `false`.
/// Va por la conexión SSH en caché de la sesión: consultarlo cada pocos segundos no abre conexiones nuevas.
#[tauri::command]
pub async fn vnc_programa_abierto(session_id: String, programa: String) -> Result<bool, CommandError> {
    let proceso = proceso_de_programa(&programa).ok_or_else(|| {
        CommandError::permanent("VALIDATION_FAILED", format!("Programa no permitido: '{programa}'"))
    })?;
    let display = {
        let map = SESSIONS.lock().map_err(|_| CommandError::internal("LOCK_POISONED", "SESSIONS lock poisoned"))?;
        let sess = map.get(&session_id).ok_or_else(|| CommandError::from(AppError::NotFoundSession))?;
        sess.vnc_session.as_ref().map(|v| v.display_num)
    };
    let Some(display) = display else { return Ok(false) };
    let cmd = cmd_programa_abierto(proceso, display);
    let (_, out) = tokio::task::spawn_blocking(move || crate::ssh_core::exec::ssh_exec(&session_id, &cmd))
        .await
        .map_err(|e| CommandError::internal("TASK_JOIN_ERROR", e.to_string()))?
        .map_err(|e| CommandError::transient("SSH_ERROR", e))?;
    Ok(out.trim() == "si")
}

/// Detiene la sesión gráfica activa.
#[tauri::command]
pub async fn vnc_stop(session_id: String) -> Result<(), CommandError> {
    // Mismo candado que vnc_start: «Detener» espera a que termine un arranque en curso en vez de pisarlo.
    let stop_lock = session_lock(&session_id)?;
    let _stop_guard = stop_lock.lock().await;
    let vnc_opt = {
        let mut map = crate::cmd::state::SESSIONS.lock().map_err(|_| CommandError::internal("LOCK_POISONED", "SESSIONS lock poisoned"))?;
        let sess = map.get_mut(&session_id).ok_or_else(|| CommandError::from(AppError::NotFoundSession))?;
        sess.vnc_session.take()
    };

    // Al soltar el estado, su `Drop` detiene el puente y el túnel y limpia el escritorio en la Pi por una conexión
    // SSH aparte (y lo deja anotado como pendiente por si la app se cierra antes). Antes esto escribía la orden
    // `pkill … rm -f /tmp/.X…` en la terminal interactiva: el usuario la veía aparecer en su terminal (en una
    // práctica, en medio de los pasos) y quedaba en su historial.
    drop(vnc_opt);

    Ok(())
}

/// Limpia todos los displays VNC virtuales desde :20 en el servidor activo.
#[tauri::command]
pub async fn vnc_cleanup_all(session_id: String) -> Result<String, CommandError> {
    let (host, port, user, password) = {
        let map = crate::cmd::state::SESSIONS.lock().map_err(|_| CommandError::internal("LOCK_POISONED", "SESSIONS lock poisoned"))?;
        let sess = map.get(&session_id).ok_or_else(|| CommandError::from(AppError::NotFoundSession))?;
        (sess.host.clone(), sess.port, sess.user.clone(), sess.password.clone())
    };

    let result = tokio::task::spawn_blocking(move || -> Result<String, CommandError> {
        let (_tcp, sess) = crate::ssh_core::ssh2_sftp::connect_password(&host, port, &user, &password)
            .map_err(|e| CommandError::transient("SSH_ERROR", format!("SSH error: {e}")))?;
        // Además de Xvnc/Xtigervnc, mata también Xvfb/x11vnc (el combo de
        // antes de la migración) — red de seguridad para huérfanos de
        // sesiones viejas que de otra forma le bloquean el display a Xvnc
        // con "server already running" sin que este código los vea.
        let (_, out) = crate::ssh_core::exec::ssh_exec_session(
            &sess,
            &format!(
                "for d in $(seq 20 99); do \
                   if pgrep -f \"[X]vnc :$d \" >/dev/null 2>&1 || pgrep -f \"[X]tigervnc :$d \" >/dev/null 2>&1 || pgrep -f \"[X]vnc-core :$d \" >/dev/null 2>&1 \
                      || pgrep -f \"[X]vfb :$d \" >/dev/null 2>&1 || pgrep -f \"[x]11vnc.*:$d\" >/dev/null 2>&1; then \
                     {} \
                     rm -f /tmp/.X$d-lock /tmp/.X11-unix/X$d 2>/dev/null; \
                     echo \"killed :$d\"; \
                   fi; \
                 done; true",
                utils::kill_display_cmd("$d", "-9", true)
            ),
        ).map_err(|e| CommandError::transient("SSH_ERROR", e))?;
        Ok(out.trim().to_string())
    }).await.map_err(|e| CommandError::internal("TASK_JOIN_ERROR", e.to_string()))??;

    Ok(if result.is_empty() { "No había displays activos".to_string() } else { result })
}

/// Consulta el estado de la sesión gráfica para un session_id dado.
#[tauri::command]
pub async fn vnc_status(session_id: String) -> Result<VncStatusResponse, CommandError> {
    let map = SESSIONS.lock().map_err(|_| CommandError::internal("LOCK_POISONED", "SESSIONS lock poisoned"))?;
    let sess = map
        .get(&session_id)
        .ok_or_else(|| CommandError::from(AppError::NotFoundSession))?;
    Ok(match &sess.vnc_session {
        None => VncStatusResponse::NotStarted,
        Some(v) => VncStatusResponse::Running {
            ws_port: v.ws_port_local,
            display: v.display_num,
        },
    })
}

/// Limpia todas las sesiones VNC activas al cerrar la aplicación.
/// Se invoca desde `lib.rs` en el evento `on_window_event`.
pub fn cleanup_all_vnc_sessions() {
    use crate::cmd::state::SESSIONS;
    let sessions_info: Vec<(u32, u16, String, u16, String, String, bool)> = {
        let mut map = match SESSIONS.lock() {
            Ok(m) => m,
            Err(_) => return,
        };
        map.values_mut()
            .filter_map(|s| s.vnc_session.as_mut().map(|v| {
                let info = (v.display_num, v.vnc_port_remote, v.host.clone(), v.port, v.user.clone(), v.password.clone(), v.is_virtual);
                v.stop_flag.store(true, std::sync::atomic::Ordering::Relaxed);
                if let Some(mut child) = v.ssh_fwd_child.take() { let _ = child.kill(); }
                v.host = "".to_string();
                info
            }))
            .collect()
    };

    if !sessions_info.is_empty() {
        std::thread::spawn(move || {
            for (display, _vnc_port, host, port, user, password, is_virtual) in sessions_info {
                if host.is_empty() { continue; }
                if let Ok((_tcp, sess)) = crate::ssh_core::ssh2_sftp::connect_password(&host, port, &user, &password) {
                    if is_virtual {
                        let _ = crate::ssh_core::exec::ssh_exec_session(
                            &sess,
                            &format!("{} rm -f /tmp/.X{display}-lock /tmp/.X11-unix/X{display} 2>/dev/null; true", utils::kill_display_cmd(&display.to_string(), "-9", false))
                        );
                    }
                }
            }
        });
    }
}

#[cfg(test)]
mod tests_programa_abierto {
    use super::*;

    #[test]
    fn solo_se_aceptan_programas_conocidos() {
        assert_eq!(proceso_de_programa("terminal"), Some("lxterminal"));
        assert_eq!(proceso_de_programa("rm -rf /"), None);
        assert_eq!(proceso_de_programa(""), None);
    }

    #[test]
    fn el_comando_mira_el_display_de_la_sesion() {
        let cmd = cmd_programa_abierto("lxterminal", 20);
        assert!(cmd.contains("pgrep -u \"$(id -u)\" -x lxterminal"));
        assert!(cmd.contains("^DISPLAY=:20(\\.0)?$"));
        assert!(cmd.trim_end().ends_with("echo no"));
    }
}
