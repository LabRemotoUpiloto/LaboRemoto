//! cmd/practices/linux_api — Cliente HTTP hacia el servicio de prácticas de
//! Linux (`practicas-linux-api`) que corre en la Raspberry Pi.
//!
//! A diferencia de las demás categorías (ver `practicas.rs`, basadas en JSON
//! local), el contenido y la validación de Linux viven en un servicio propio
//! en la Pi — este módulo es el único punto que
//! le habla por HTTP. La conexión SSH de trabajo (terminal del estudiante) no
//! pasa por acá: usa el mismo `ssh_connect` genérico que el resto de la app,
//! con el usuario resuelto de la sesión Keycloak y la contraseña pedida una
//! vez en el cliente (nunca gestionada desde este módulo).

use std::sync::Arc;

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};

use crate::cmd::practices::linux_tunnel::{self, TunnelConfig};
use crate::cmd::protocol::CommandError;
use crate::session_manager::SessionManager;

static HTTP_CLIENT: Lazy<reqwest::Client> = Lazy::new(reqwest::Client::new);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinuxPracticeSummary {
    pub id: String,
    pub order: Option<u32>,
    pub title: String,
    pub difficulty: String,
    pub estimated_minutes: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinuxConnectionTarget {
    pub host: String,
    pub port: u16,
    pub user: String,
}

// ─── Config (.env, raíz del repo — variables PRACTICE_LINUX_*) ───
//
// Antes vivía en un `.env.practicas` aparte con su propio parser manual
// (mismo patrón que practicas.rs para Eve3/Circuitos, duplicado). Se
// consolidó en el único `.env` de la app: `dotenvy::dotenv()` ya lo carga al
// arrancar (ver lib.rs), así que alcanza con leer el entorno del proceso.

#[derive(Debug, Clone)]
pub(crate) struct LinuxApiConfig {
    tunnel: TunnelConfig,
    pub(crate) token: String,
    ssh_host: String,
    ssh_port: u16,
}

fn env_var(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|v| !v.trim().is_empty())
}

pub(crate) fn load_config() -> Result<LinuxApiConfig, CommandError> {
    let missing = |key: &str| {
        CommandError::permanent("VALIDATION_FAILED", format!("{key} no configurado en .env"))
    };

    // Cuenta de servicio restringida (sin shell, forwarding local limitado a
    // un único puerto en la Pi vía PermitOpen) — ver linux_tunnel.rs. Es el
    // único camino habilitado hoy hacia la API; no hay modo "HTTP directo"
    // porque el puerto 8770 no está expuesto a internet (a propósito).
    let tunnel_host = env_var("PRACTICE_LINUX_TUNNEL_HOST").ok_or_else(|| missing("PRACTICE_LINUX_TUNNEL_HOST"))?;
    let tunnel_port: u16 = env_var("PRACTICE_LINUX_TUNNEL_PORT").and_then(|v| v.parse().ok()).unwrap_or(22);
    let tunnel_user = env_var("PRACTICE_LINUX_TUNNEL_USER").ok_or_else(|| missing("PRACTICE_LINUX_TUNNEL_USER"))?;
    let tunnel_password = env_var("PRACTICE_LINUX_TUNNEL_PASSWORD").ok_or_else(|| missing("PRACTICE_LINUX_TUNNEL_PASSWORD"))?;
    let remote_port: u16 = env_var("PRACTICE_LINUX_API_REMOTE_PORT").and_then(|v| v.parse().ok()).unwrap_or(8770);

    let token = env_var("PRACTICE_LINUX_API_TOKEN").ok_or_else(|| missing("PRACTICE_LINUX_API_TOKEN"))?;

    // El host SSH de trabajo (terminal del estudiante) es independiente del
    // host del túnel de servicio — separado para cuando haya pool de Pis por
    // curso (ver diseño de arquitectura).
    let ssh_host = env_var("PRACTICE_LINUX_SSH_HOST").unwrap_or_else(|| tunnel_host.clone());
    let ssh_port: u16 = env_var("PRACTICE_LINUX_SSH_PORT").and_then(|v| v.parse().ok()).unwrap_or(22);

    Ok(LinuxApiConfig {
        tunnel: TunnelConfig {
            host: tunnel_host,
            port: tunnel_port,
            user: tunnel_user,
            password: tunnel_password,
            remote_host: "127.0.0.1".to_string(),
            remote_port,
        },
        token,
        ssh_host,
        ssh_port,
    })
}

pub(crate) async fn resolve_base_url(config: &LinuxApiConfig) -> Result<String, CommandError> {
    let local_port = linux_tunnel::ensure_tunnel(config.tunnel.clone())
        .await
        .map_err(|e| CommandError::transient("LINUX_TUNNEL_ERROR", format!("No se pudo establecer el túnel hacia la Pi: {e}")))?;
    Ok(format!("http://127.0.0.1:{local_port}"))
}

// ─── HTTP helpers ───

fn map_reqwest_err(e: reqwest::Error, operation: &str, resource: &str) -> CommandError {
    let err = if e.is_timeout() {
        CommandError::transient(
            "OPERATION_TIMEOUT",
            format!("Timeout contactando el servicio de prácticas de Linux: {}", e),
        )
    } else {
        CommandError::transient(
            "LINUX_API_REQUEST_ERROR",
            format!("Error contactando el servicio de prácticas de Linux: {}", e),
        )
    };
    err.with_context(operation, resource)
}

async fn handle_response(
    resp: reqwest::Response,
    operation: &str,
    resource: &str,
) -> Result<serde_json::Value, CommandError> {
    let status = resp.status();
    let text = resp.text().await.map_err(|e| {
        CommandError::transient("LINUX_API_REQUEST_ERROR", format!("Error leyendo respuesta: {}", e))
            .with_context(operation, resource)
    })?;

    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err(
            CommandError::permanent("AUTH_FAILED", "Token inválido para el servicio de prácticas de Linux")
                .with_context(operation, resource),
        );
    }
    if status == reqwest::StatusCode::NOT_FOUND {
        return Err(
            CommandError::permanent("RESOURCE_NOT_FOUND", format!("No encontrado en la Pi: {}", resource))
                .with_context(operation, resource),
        );
    }
    if !status.is_success() {
        return Err(CommandError::transient(
            "LINUX_API_REQUEST_ERROR",
            format!("El servicio de prácticas respondió {}: {}", status, text),
        )
        .with_context(operation, resource));
    }

    serde_json::from_str(&text).map_err(|e| {
        CommandError::permanent("INVALID_JSON", format!("JSON inválido del servicio de prácticas: {}", e))
            .with_context(operation, resource)
    })
}

async fn api_get(config: &LinuxApiConfig, path: &str) -> Result<serde_json::Value, CommandError> {
    let base_url = resolve_base_url(config).await?;
    let url = format!("{}{}", base_url, path);
    let resp = HTTP_CLIENT
        .get(&url)
        .header("Authorization", format!("Bearer {}", config.token))
        .send()
        .await
        .map_err(|e| map_reqwest_err(e, "linux_api_get", path))?;
    handle_response(resp, "linux_api_get", path).await
}

async fn api_post(
    config: &LinuxApiConfig,
    path: &str,
    body: &serde_json::Value,
) -> Result<serde_json::Value, CommandError> {
    let base_url = resolve_base_url(config).await?;
    let url = format!("{}{}", base_url, path);
    let resp = HTTP_CLIENT
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.token))
        .json(body)
        .send()
        .await
        .map_err(|e| map_reqwest_err(e, "linux_api_post", path))?;
    handle_response(resp, "linux_api_post", path).await
}

/// Como `api_get`, pero para respuestas binarias (imágenes, video, diagramas
/// de un módulo) -- `handle_response` fuerza JSON, esto no.
async fn api_get_bytes(config: &LinuxApiConfig, path: &str) -> Result<(String, Vec<u8>), CommandError> {
    let base_url = resolve_base_url(config).await?;
    let url = format!("{}{}", base_url, path);
    let resp = HTTP_CLIENT
        .get(&url)
        .header("Authorization", format!("Bearer {}", config.token))
        .send()
        .await
        .map_err(|e| map_reqwest_err(e, "linux_api_get_media", path))?;

    let status = resp.status();
    if status == reqwest::StatusCode::NOT_FOUND {
        return Err(CommandError::permanent("RESOURCE_NOT_FOUND", format!("Media no encontrada en la Pi: {}", path)));
    }
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err(CommandError::permanent("AUTH_FAILED", "Token inválido para el servicio de prácticas de Linux"));
    }
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    if !status.is_success() {
        return Err(CommandError::transient(
            "LINUX_API_REQUEST_ERROR",
            format!("El servicio de prácticas respondió {} pidiendo media", status),
        ));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| map_reqwest_err(e, "linux_api_get_media", path))?;
    Ok((content_type, bytes.to_vec()))
}

async fn current_username(manager: &Arc<dyn SessionManager>) -> Result<String, CommandError> {
    let info = manager
        .session_info()
        .await
        .map_err(|e| CommandError::internal("SESSION_ERROR", e.to_string()))?;
    info.map(|s| s.preferred_username)
        .ok_or_else(|| CommandError::permanent("AUTH_FAILED", "No hay sesión activa"))
}

// ─── Comandos Tauri ───

/// Lista los módulos de Linux disponibles (metadata liviana). Función libre
/// (no `#[tauri::command]`) para que `practicas.rs` también pueda llamarla
/// al armar la categoría "linux" de `practicas_list_categories`.
pub async fn fetch_linux_summaries() -> Result<Vec<LinuxPracticeSummary>, CommandError> {
    let config = load_config()?;
    let value = api_get(&config, "/practices").await?;
    serde_json::from_value(value).map_err(|e| {
        CommandError::permanent("INVALID_JSON", format!("No se pudo interpretar la lista de módulos: {}", e))
    })
}

#[tauri::command]
pub async fn practicas_linux_list() -> Result<Vec<LinuxPracticeSummary>, CommandError> {
    fetch_linux_summaries().await
}

/// Devuelve el contenido completo en bloques de un módulo (objective, blocks,
/// hints, validation_rules — ver diseño de arquitectura). Se pasa como JSON
/// crudo al frontend: el schema de bloques todavía está en evolución.
#[tauri::command]
pub async fn practicas_linux_get_module(practice_id: String) -> Result<serde_json::Value, CommandError> {
    let config = load_config()?;
    api_get(&config, &format!("/practices/{}", practice_id)).await
}

#[derive(Debug, Clone, Serialize)]
pub struct LinuxMedia {
    pub mime: String,
    /// Base64 estándar -- el frontend arma un `data:` URI directo con esto,
    /// sin pasar por un endpoint HTTP propio del cliente (no existe uno).
    pub base64: String,
}

/// Trae un archivo de media (imagen, video, diagrama) de un módulo. El
/// cliente nunca le habla directo a la Pi -- pasa por el mismo túnel que
/// `practicas_linux_get_module`, con el mismo token bearer.
///
/// `media_path` es el valor que ya viene en un bloque `media` del
/// `module.json` (ej. `"diagrams/pipe.png"`) -- se valida acá igual (no solo
/// del lado Python) por defensa en profundidad.
#[tauri::command]
pub async fn practicas_linux_get_media(practice_id: String, media_path: String) -> Result<LinuxMedia, CommandError> {
    if media_path.contains("..") {
        return Err(CommandError::permanent("INVALID_PATH", "Ruta de media inválida"));
    }
    let config = load_config()?;
    let (mime, bytes) = api_get_bytes(&config, &format!("/practices/{}/media/{}", practice_id, media_path)).await?;
    use base64::Engine as _;
    Ok(LinuxMedia { mime, base64: base64::engine::general_purpose::STANDARD.encode(&bytes) })
}

/// Valida el progreso del estudiante autenticado contra las reglas del
/// módulo. El `student` NO viene del cliente — se resuelve server-side desde
/// la sesión Keycloak activa, para que no se pueda falsear.
///
/// `quiz_answers` (question_id -> option_id elegida) viaja igual que
/// `command_history`: el cliente solo manda lo que el estudiante eligió, la
/// respuesta correcta de cada pregunta vive únicamente en la Pi (mismo
/// principio que ya aplica a las reglas de tipo comando -- acá tampoco hay
/// forma de leer la clave de corrección abriendo devtools).
#[tauri::command]
pub async fn practicas_linux_validate(
    practice_id: String,
    command_history: Vec<String>,
    quiz_answers: Option<std::collections::HashMap<String, String>>,
    manager: tauri::State<'_, Arc<dyn SessionManager>>,
) -> Result<serde_json::Value, CommandError> {
    let manager = manager.inner().clone();
    let student = current_username(&manager).await?;
    let config = load_config()?;

    let body = serde_json::json!({
        "student": student,
        "command_history": command_history,
        "quiz_answers": quiz_answers.unwrap_or_default(),
    });

    api_post(&config, &format!("/practices/{}/validate", practice_id), &body).await
}

/// Host/puerto/usuario para que el frontend abra la sesión SSH de trabajo del
/// estudiante — el usuario es su username de Keycloak (mismo del Active
/// Directory de la U con el que la Pi ya le crea su homedir). La contraseña
/// NO se resuelve acá: se le pide al estudiante en un diálogo nativo justo
/// antes de conectar, y nunca pasa por este backend salvo para abrir el
/// socket SSH (mismo camino que ya usa `ssh_connect` para el resto de la app).
#[tauri::command]
pub async fn practicas_linux_connection_target(
    manager: tauri::State<'_, Arc<dyn SessionManager>>,
) -> Result<LinuxConnectionTarget, CommandError> {
    let manager = manager.inner().clone();
    let username = current_username(&manager).await?;
    let config = load_config()?;

    // El AD de la U exige el dominio en el login. La Pi usa sssd con
    // use_fully_qualified_names=true (ver /etc/sssd/sssd.conf,
    // domain/upiloto.edu) — el nombre canónico que resuelve ahí es
    // "usuario@upiloto.edu" (verificado con getent y con una conexión real),
    // no el formato NetBIOS "UPILOTO\usuario" que usa el resto de la app
    // para SSH manual. El username de Keycloak (preferred_username) no trae
    // el dominio, así que se agrega acá.
    let user = format!("{username}@upiloto.edu");

    Ok(LinuxConnectionTarget {
        host: config.ssh_host,
        port: config.ssh_port,
        user,
    })
}

// ─── Categorías y entorno de los módulos ───

/// Categoría (`PracticeCategory.id`) a la que pertenece un módulo, según el
/// prefijo de su id: `ev3-*` van a Eve3 y todo lo demás a Linux. El servicio de
/// la Pi no distingue categorías (la lista `/practices` mezcla todos los
/// módulos), así que la separación vive acá, sin tocar su código.
pub fn module_category(practice_id: &str) -> &'static str {
    if practice_id.starts_with("ev3-") {
        "eve3"
    } else {
        "linux"
    }
}

/// Únicos comandos que el entorno de un módulo puede pedir ejecutar: los
/// scripts de salto que levantan el robot y su puente (desplegados a mano en
/// la Pi, con sus credenciales adentro). Defensa en profundidad: aunque el
/// contenido del servicio cambie, la app no ejecuta nada más con esto.
///
/// La forma vigente es `sudo -n -u pi <script>`: los scripts quedan legibles
/// solo por `pi` y las cuentas de estudiantes los ejecutan por una regla de
/// sudoers. Se acepta también la forma antigua (`bash <script>`) mientras
/// haya módulos desplegados que la usen.
const SETUP_ALLOWED_PREFIXES: &[&str] = &[
    "sudo -n -u pi /home/pi/ev3-hop-robot.sh ",
    "sudo -n -u pi /home/pi/ev3-hop-pi5.sh ",
    "bash /home/pi/ev3-hop-robot.sh ",
    "bash /home/pi/ev3-hop-pi5.sh ",
];

const SETUP_STEP_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);

/// Lee `environment.setup_commands` (lista de textos) de un módulo y valida
/// cada comando. Sin esa clave, el módulo no necesita preparar nada.
fn setup_commands_from(module: &serde_json::Value) -> Result<Vec<String>, CommandError> {
    let Some(list) = module.pointer("/environment/setup_commands") else {
        return Ok(Vec::new());
    };
    let invalid = |msg: String| CommandError::permanent("INVALID_DATA", msg);
    let list = list
        .as_array()
        .ok_or_else(|| invalid("environment.setup_commands debe ser una lista de textos".into()))?;

    let mut commands = Vec::with_capacity(list.len());
    for (i, item) in list.iter().enumerate() {
        let cmd = item
            .as_str()
            .ok_or_else(|| invalid(format!("environment.setup_commands[{i}] no es un texto")))?;
        if cmd.chars().any(|c| c == '\n' || c == '\r' || c == '\0') {
            return Err(invalid(format!("environment.setup_commands[{i}] tiene saltos de línea")));
        }
        if !SETUP_ALLOWED_PREFIXES.iter().any(|p| cmd.starts_with(p)) {
            return Err(invalid(format!("environment.setup_commands[{i}] no es un comando de arranque permitido")));
        }
        commands.push(cmd.to_string());
    }
    Ok(commands)
}

fn truncate_output(s: &str) -> String {
    let t = s.trim();
    if t.chars().count() > 300 {
        format!("{}…", t.chars().take(300).collect::<String>())
    } else {
        t.to_string()
    }
}

/// Prepara el entorno de un módulo (ej. levantar el servidor del robot y su
/// puente) ejecutando sus `environment.setup_commands` por la sesión SSH del
/// propio estudiante. El backend trae los comandos él mismo desde el servicio:
/// el frontend solo dice qué módulo es, así que no puede pedir comandos
/// arbitrarios. Devuelve una línea por paso. Un paso que sale con error NO
/// aborta (el panel del robot ya avisa si el puente no responde); solo un fallo
/// de conexión o un tiempo agotado devuelve error.
#[tauri::command]
pub async fn practicas_module_setup(session_id: String, practice_id: String) -> Result<Vec<String>, CommandError> {
    if practice_id.is_empty() || !practice_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err(CommandError::permanent("VALIDATION_FAILED", format!("Id de práctica inválido: {practice_id}")));
    }
    let config = load_config()?;
    let module = api_get(&config, &format!("/practices/{}", practice_id)).await?;
    let commands = setup_commands_from(&module)?;

    let mut report = Vec::with_capacity(commands.len());
    for (i, cmd) in commands.into_iter().enumerate() {
        let step = i + 1;
        let sid = session_id.clone();
        let task = tokio::task::spawn_blocking(move || crate::ssh_core::exec::ssh_exec(&sid, &cmd));
        let result = tokio::time::timeout(SETUP_STEP_TIMEOUT, task)
            .await
            .map_err(|_| {
                CommandError::transient(
                    "OPERATION_TIMEOUT",
                    format!("El paso {step} del arranque tardó más de {} s", SETUP_STEP_TIMEOUT.as_secs()),
                )
                .with_context("practicas_module_setup", &practice_id)
            })?
            .map_err(|e| CommandError::internal("TASK_JOIN_ERROR", e.to_string()))?;

        match result {
            Ok((0, out)) => report.push(format!("paso {step}: ok {}", truncate_output(&out)).trim().to_string()),
            Ok((code, out)) => report.push(format!("paso {step}: terminó con código {code} {}", truncate_output(&out)).trim().to_string()),
            Err(e) => {
                return Err(CommandError::transient("COMMUNICATION_ERROR", format!("Paso {step} del arranque: {e}"))
                    .with_context("practicas_module_setup", &practice_id))
            }
        }
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn category_by_prefix() {
        assert_eq!(module_category("ev3-m1"), "eve3");
        assert_eq!(module_category("linux-m3"), "linux");
        // Cualquier otro id cae en Linux: es lo que pasaba antes de existir EV3.
        assert_eq!(module_category("m1"), "linux");
        assert_eq!(module_category("eve3-p1"), "linux");
    }

    #[test]
    fn setup_without_environment_is_empty() {
        assert!(setup_commands_from(&json!({ "id": "linux-m1" })).unwrap().is_empty());
        assert!(setup_commands_from(&json!({ "environment": {} })).unwrap().is_empty());
    }

    #[test]
    fn setup_accepts_the_known_hop_scripts() {
        let m = json!({ "environment": { "setup_commands": [
            "bash /home/pi/ev3-hop-robot.sh 'cd /home/robot && nohup python3 main.py > /dev/null 2>&1 &'",
            "bash /home/pi/ev3-hop-pi5.sh 'cd /home/labiotpi5/ev3_bridge && ./arrancar.sh'",
            "sudo -n -u pi /home/pi/ev3-hop-robot.sh 'cd /home/robot && nohup python3 main.py > /dev/null 2>&1 &'",
            "sudo -n -u pi /home/pi/ev3-hop-pi5.sh 'cd /home/labiotpi5/ev3_bridge && ./arrancar.sh'",
        ] } });
        assert_eq!(setup_commands_from(&m).unwrap().len(), 4);
    }

    #[test]
    fn setup_rejects_anything_else() {
        for bad in [
            "rm -rf /",
            "bash /tmp/otro.sh 'x'",
            "bash /home/pi/ev3-hop-robot.shx 'x'",
            "sudo -n -u pi /tmp/otro.sh 'x'",
            "sudo -u root /home/pi/ev3-hop-robot.sh 'x'",
            "sudo -n -u pi /home/pi/ev3-hop-robot.shx 'x'",
            "bash /home/pi/ev3-hop-robot.sh 'ok'\nrm -rf ~",
            "echo bash /home/pi/ev3-hop-robot.sh ",
        ] {
            let m = json!({ "environment": { "setup_commands": [bad] } });
            assert!(setup_commands_from(&m).is_err(), "debió rechazar: {bad:?}");
        }
    }

    #[test]
    fn setup_rejects_wrong_shapes() {
        assert!(setup_commands_from(&json!({ "environment": { "setup_commands": "bash x" } })).is_err());
        assert!(setup_commands_from(&json!({ "environment": { "setup_commands": [42] } })).is_err());
    }

    #[test]
    fn truncate_keeps_short_and_cuts_long() {
        assert_eq!(truncate_output("  hola \n"), "hola");
        assert!(truncate_output(&"x".repeat(1000)).chars().count() <= 301);
    }
}
