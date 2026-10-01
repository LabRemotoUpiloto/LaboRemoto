//! Comandos Tauri para comunicarse con el puente HTTP del robot EV3
//! (`ev3_bridge.py`, FastAPI) que corre en la Raspberry Pi del estudiante
//! (workspace de la práctica), expuesto en `127.0.0.1:8000`. El puente a su
//! vez habla con el servidor del ladrillo EV3 (`api_simulador/main.py`,
//! stdlib puro) en el puerto 8080.
//!
//! Igual que el bridge de Arduino (`arduino.rs`), los comandos se ejecutan
//! mediante `curl` a través de la sesión SSH ya autenticada (reutilizando la
//! misma caché ssh2), en vez de abrir una conexión TCP nueva desde el cliente.
//!
//! La Pi5 (workspace real) no es alcanzable directo desde el cliente — solo
//! vía un bastión público que sí lo es (la Pi4: la sesión SSH del estudiante
//! aterriza ahí, no en la Pi5). Por eso cada curl se reenvía con un script de
//! salto (`HOP_SCRIPT`, `sshpass`+`ssh` desplegado a mano en el bastión) en vez
//! de pegarle directo a `127.0.0.1:8000`.
//!
//! Arquitectura (ver `investigacion_ev3/README.md`, rama `luisa-tauri`):
//! ```text
//!   Cliente Tauri →(SSH)→ bastión →(SSH anidado, HOP_SCRIPT)→ ev3_bridge.py :8000 (Pi5) →(HTTP)→ api_simulador :8080 (ladrillo EV3)
//! ```
//!
//! El arranque de ambos scripts en la Pi/ladrillo lo hace
//! `practicas_module_setup` (ver `cmd/practices/linux_api.rs`) al conectar el
//! módulo EV3, con los `environment.setup_commands` que declara el propio
//! módulo (también reenviados por el bastión).

use serde::{Deserialize, Serialize};

use crate::cmd::protocol::CommandError;

const BRIDGE_URL: &str = "http://127.0.0.1:8000";

/// El bridge corre en la Pi5, no alcanzable directo desde el cliente: la
/// sesión SSH real aterriza en el bastión público, así que cada comando se
/// reenvía a la Pi5 mediante este script (`sshpass` + `ssh` ya desplegados
/// ahí a mano).
const HOP_SCRIPT: &str = "/home/pi/ev3-hop-pi5.sh";

/// Escapa un argumento para uso seguro dentro de comillas simples en bash.
pub(super) fn bash_quote(s: &str) -> String {
    let escaped = s.replace('\'', r"'\''");
    format!("'{}'", escaped)
}

/// Envuelve un comando para que se ejecute en la Pi5 en vez del bastión
/// (donde realmente aterriza la sesión SSH de esta práctica).
fn hop(cmd: &str) -> String {
    format!("bash {} {}", HOP_SCRIPT, bash_quote(cmd))
}

pub(super) fn map_ssh_transport_error(id: &str, operation: &str, e: String) -> CommandError {
    let lower = e.to_lowercase();
    if lower.contains("session") && (lower.contains("not found") || lower.contains("notfoundsession")) {
        return CommandError::session_expired();
    }
    CommandError::transient("COMMUNICATION_ERROR", format!("Error de comunicación SSH con el puente EV3: {e}"))
        .with_context(operation, id)
}

// ───────────────────────── GET /api/status ─────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct Ev3Motor {
    pub port: String,
    #[serde(default)]
    pub connected: bool,
    #[serde(default)]
    pub speed: i32,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct Ev3Sensor {
    pub port: String,
    #[serde(default)]
    pub sensor_type: String,
    #[serde(default)]
    pub value: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct Ev3Status {
    #[serde(default)]
    pub connected: bool,
    #[serde(default)]
    pub ip: String,
    #[serde(default)]
    pub battery: f64,
    #[serde(default)]
    pub motors: Vec<Ev3Motor>,
    #[serde(default)]
    pub sensors: Vec<Ev3Sensor>,
    #[serde(default)]
    pub alerts: Vec<String>,
    /// true si el puente HTTP respondió (aunque el robot esté desconectado).
    /// No lo envía el puente; se fija en Rust cuando hubo respuesta válida.
    #[serde(default)]
    pub reachable: bool,
}

#[tauri::command]
pub async fn ev3_status(id: String) -> Result<Ev3Status, CommandError> {
    tokio::task::spawn_blocking(move || {
        let inner = format!("curl -s --max-time 2 {}/api/status", BRIDGE_URL);
        let cmd = hop(&inner);
        let (_st, out) = crate::ssh_core::exec::ssh_exec(&id, &cmd)
            .map_err(|e| map_ssh_transport_error(&id, "ev3_status", e))?;
        let body = out.trim();
        if body.is_empty() {
            return Ok(Ev3Status {
                reachable: false,
                alerts: vec!["Puente EV3 no responde (¿ev3-bridge activo en la Pi?)".into()],
                ..Default::default()
            });
        }
        let mut parsed: Ev3Status = serde_json::from_str(body).map_err(|e| {
            CommandError::permanent(
                "INVALID_DATA",
                format!("JSON inválido del puente EV3: {e} — body: {body:?}"),
            )
            .with_context("ev3_status", &id)
        })?;
        parsed.reachable = true;
        Ok(parsed)
    }).await.map_err(|e| CommandError::internal("TASK_JOIN_ERROR", e.to_string()))?
}

// ───────────────────────── POST /api/motor y /api/stop_all ─────────────────────────

#[derive(Serialize, Debug, Clone)]
pub struct Ev3ApiResult {
    pub status: String,
    pub message: String,
}

fn parse_curl_with_code(out: &str) -> (String, u16) {
    match out.rsplit_once("\n\t") {
        Some((b, c)) => (b.trim().to_string(), c.trim().parse::<u16>().unwrap_or(0)),
        None => (out.trim().to_string(), 0),
    }
}

fn ev3_api_error(id: &str, operation: &str, code: u16, body: &str) -> CommandError {
    if code == 0 {
        return CommandError::transient(
            "OPERATION_TIMEOUT",
            format!("No se recibió respuesta del puente EV3 (¿ev3-bridge.service inactivo?). Respuesta cruda: {body}"),
        )
        .with_context(operation, id)
        .with_retry_after(2000);
    }
    CommandError::transient(
        "COMMUNICATION_ERROR",
        format!("Puente EV3 devolvió HTTP {code}: {body}"),
    )
    .with_context(operation, id)
}

/// Mueve un motor. `port` acepta `"A"`/`"outA"`; `speed` en % (−100…100).
#[tauri::command]
pub async fn ev3_set_motor(id: String, port: String, speed: i32) -> Result<Ev3ApiResult, CommandError> {
    let speed = speed.clamp(-100, 100);
    tokio::task::spawn_blocking(move || {
        let payload = serde_json::json!({ "port": port, "speed": speed }).to_string();
        let quoted = bash_quote(&payload);
        let inner = format!(
            "curl -s --max-time 5 -X POST -H 'Content-Type: application/json' -o - -w '\\n\\t%{{http_code}}' {}/api/motor -d {}",
            BRIDGE_URL, quoted
        );
        let shell = hop(&inner);
        let (_st, out) = crate::ssh_core::exec::ssh_exec(&id, &shell)
            .map_err(|e| map_ssh_transport_error(&id, "ev3_set_motor", e))?;

        let (body, code) = parse_curl_with_code(&out);
        if code == 0 || code >= 400 {
            return Err(ev3_api_error(&id, "ev3_set_motor", code, &body));
        }
        Ok(Ev3ApiResult { status: "success".into(), message: body })
    }).await.map_err(|e| CommandError::internal("TASK_JOIN_ERROR", e.to_string()))?
}

/// Detiene todos los motores, o uno solo si se pasa `port`.
#[tauri::command]
pub async fn ev3_stop_all(id: String, port: Option<String>) -> Result<Ev3ApiResult, CommandError> {
    tokio::task::spawn_blocking(move || {
        let payload = match &port {
            Some(p) => serde_json::json!({ "port": p }).to_string(),
            None => "{}".to_string(),
        };
        let quoted = bash_quote(&payload);
        let inner = format!(
            "curl -s --max-time 5 -X POST -H 'Content-Type: application/json' -o - -w '\\n\\t%{{http_code}}' {}/api/stop_all -d {}",
            BRIDGE_URL, quoted
        );
        let shell = hop(&inner);
        let (_st, out) = crate::ssh_core::exec::ssh_exec(&id, &shell)
            .map_err(|e| map_ssh_transport_error(&id, "ev3_stop_all", e))?;

        let (body, code) = parse_curl_with_code(&out);
        if code == 0 || code >= 400 {
            return Err(ev3_api_error(&id, "ev3_stop_all", code, &body));
        }
        Ok(Ev3ApiResult { status: "success".into(), message: body })
    }).await.map_err(|e| CommandError::internal("TASK_JOIN_ERROR", e.to_string()))?
}
