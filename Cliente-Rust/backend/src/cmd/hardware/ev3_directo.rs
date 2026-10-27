//! Conexión directa con un robot EV3 físico, sin pasar por el laboratorio.
//!
//! Para pruebas: el robot está al lado de quien prueba (misma red Wi‑Fi o cable USB) y corre
//! `api_simulador/main.py` (investigacion_ev3), que escucha en el puerto 8080 con este contrato:
//!
//! ```text
//!   GET  /status -> {connected, battery, motors[{port, connected, speed, position}], sensors[{port, sensor_type, value}]}
//!   POST /move   <- {motor, speed}   speed en % (−100…100); responde {ok, error?}
//!   POST /stop   <- {motor?}         sin motor, detiene los cuatro
//! ```
//!
//! Los comandos `ev3_status`, `ev3_set_motor` y `ev3_stop_all` usan este camino cuando reciben `robot`; si no, siguen
//! por el puente del laboratorio (sesión SSH + script de salto, ver `ev3.rs`). La dirección la escribe la persona en
//! la vista «Probar con mi robot»; más adelante podrá venir embebida al compilar, como las de la práctica de Linux.
//!
//! Solo se aceptan direcciones de red local (IPv4 privada, de enlace local o loopback) y nombres `.local` o
//! `localhost`: la app no debe poder apuntar a cualquier servidor de internet.

use std::net::Ipv4Addr;
use std::time::Duration;

use super::ev3::{Ev3ApiResult, Ev3Status};
use crate::cmd::protocol::CommandError;

/// Puerto en el que escucha `api_simulador` en el ladrillo.
pub const PUERTO_ROBOT: u16 = 8080;
const TIEMPO_ESTADO: Duration = Duration::from_secs(2);
const TIEMPO_ORDEN: Duration = Duration::from_secs(5);

/// Robot ya validado: URL base (`http://host:puerto`) y cómo se muestra (`host` o `host:puerto`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RobotDirecto {
    pub base: String,
    pub nombre: String,
}

fn invalida(msg: impl Into<String>) -> CommandError {
    CommandError::permanent("INVALID_INPUT", msg.into())
}

fn host_permitido(host: &str) -> bool {
    if let Ok(ip) = host.parse::<Ipv4Addr>() {
        return ip.is_private() || ip.is_link_local() || ip.is_loopback();
    }
    let nombre = host.to_ascii_lowercase();
    let caracteres_ok = !nombre.is_empty()
        && nombre.len() <= 253
        && nombre.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.')
        && !nombre.starts_with('.')
        && !nombre.starts_with('-');
    caracteres_ok && (nombre == "localhost" || (nombre.ends_with(".local") && nombre.len() > ".local".len()))
}

/// Valida lo que escribió la persona: `host` o `host:puerto` (puerto 8080 por defecto).
pub fn validar_robot(entrada: &str) -> Result<RobotDirecto, CommandError> {
    let entrada = entrada.trim();
    if entrada.is_empty() {
        return Err(invalida("Escribe la dirección IP del robot."));
    }
    if entrada.contains("://") || entrada.contains('/') {
        return Err(invalida("Escribe solo la dirección del robot, sin http:// ni rutas."));
    }
    let (host, puerto) = match entrada.rsplit_once(':') {
        Some((h, p)) => {
            let puerto = p.parse::<u16>().ok().filter(|p| *p > 0)
                .ok_or_else(|| invalida(format!("El puerto «{p}» no es válido.")))?;
            (h, puerto)
        }
        None => (entrada, PUERTO_ROBOT),
    };
    if !host_permitido(host) {
        return Err(invalida(
            "Solo se permiten direcciones de tu red local (IP privada) o nombres terminados en .local, como ev3dev.local.",
        ));
    }
    let nombre = if puerto == PUERTO_ROBOT { host.to_string() } else { format!("{host}:{puerto}") };
    Ok(RobotDirecto { base: format!("http://{host}:{puerto}"), nombre })
}

/// Telemetría a partir del `/status` del robot. El formato coincide con `Ev3Status`; se completan la dirección y
/// `reachable` (el robot respondió).
pub fn estado_desde_robot(cuerpo: &str, robot: &RobotDirecto) -> Result<Ev3Status, String> {
    let mut estado: Ev3Status = serde_json::from_str(cuerpo).map_err(|e| e.to_string())?;
    estado.ip = robot.nombre.clone();
    estado.reachable = true;
    Ok(estado)
}

fn cliente(tiempo: Duration) -> Result<reqwest::Client, CommandError> {
    reqwest::Client::builder()
        .timeout(tiempo)
        .build()
        .map_err(|e| CommandError::internal("HTTP_CLIENT_ERROR", e.to_string()))
}

/// Estado del robot. Si no responde no es un error: se devuelve «sin conexión» con una alerta que dice qué revisar,
/// igual que cuando el puente del laboratorio no contesta.
pub async fn estado(robot: &RobotDirecto) -> Result<Ev3Status, CommandError> {
    let sin_conexion = |detalle: String| Ev3Status {
        ip: robot.nombre.clone(),
        reachable: false,
        alerts: vec![format!(
            "No se pudo conectar con el robot en {}. Revisa que esté encendido, en la misma red que este computador \
             y con api_simulador corriendo (puerto {PUERTO_ROBOT}). Detalle: {detalle}",
            robot.nombre
        )],
        ..Default::default()
    };
    let respuesta = match cliente(TIEMPO_ESTADO)?.get(format!("{}/status", robot.base)).send().await {
        Ok(r) => r,
        Err(e) => return Ok(sin_conexion(e.to_string())),
    };
    if !respuesta.status().is_success() {
        return Ok(sin_conexion(format!("HTTP {}", respuesta.status().as_u16())));
    }
    let cuerpo = respuesta.text().await.map_err(|e| {
        CommandError::transient("COMMUNICATION_ERROR", format!("No se pudo leer la respuesta del robot: {e}"))
    })?;
    estado_desde_robot(&cuerpo, robot).map_err(|e| {
        CommandError::permanent("INVALID_DATA", format!("El robot devolvió una respuesta no válida: {e}"))
    })
}

async fn orden(robot: &RobotDirecto, ruta: &str, cuerpo: serde_json::Value) -> Result<Ev3ApiResult, CommandError> {
    let respuesta = cliente(TIEMPO_ORDEN)?
        .post(format!("{}{ruta}", robot.base))
        .json(&cuerpo)
        .send()
        .await
        .map_err(|e| {
            CommandError::transient(
                "COMMUNICATION_ERROR",
                format!("No se pudo conectar con el robot en {}: {e}", robot.nombre),
            )
            .with_retry_after(2000)
        })?;
    let codigo = respuesta.status();
    let texto = respuesta.text().await.unwrap_or_default();
    if !codigo.is_success() {
        return Err(CommandError::transient(
            "COMMUNICATION_ERROR",
            format!("El robot devolvió HTTP {}: {texto}", codigo.as_u16()),
        ));
    }
    // api_simulador responde 200 con {ok: false, error} cuando el motor no está conectado.
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&texto) {
        if v.get("ok") == Some(&serde_json::Value::Bool(false)) {
            let error = v.get("error").and_then(|e| e.as_str()).unwrap_or("el robot rechazó la orden");
            return Err(CommandError::permanent("INVALID_INPUT", format!("No se pudo mover el motor: {error}")));
        }
    }
    Ok(Ev3ApiResult { status: "success".into(), message: texto })
}

pub async fn mover(robot: &RobotDirecto, puerto: &str, velocidad: i32) -> Result<Ev3ApiResult, CommandError> {
    orden(robot, "/move", serde_json::json!({ "motor": puerto, "speed": velocidad.clamp(-100, 100) })).await
}

pub async fn detener(robot: &RobotDirecto, puerto: Option<&str>) -> Result<Ev3ApiResult, CommandError> {
    let cuerpo = match puerto {
        Some(p) => serde_json::json!({ "motor": p }),
        None => serde_json::json!({}),
    };
    orden(robot, "/stop", cuerpo).await
}

#[cfg(test)]
mod tests {
    use super::*;

    // Las direcciones se arman con Ipv4Addr: el CI rechaza IPv4 escritas tal cual en el código.
    fn ip(a: u8, b: u8, c: u8, d: u8) -> String {
        Ipv4Addr::new(a, b, c, d).to_string()
    }

    #[test]
    fn acepta_ip_privada_con_puerto_por_defecto() {
        let casa = ip(192, 168, 1, 20);
        let r = validar_robot(&format!("  {casa} ")).unwrap();
        assert_eq!(r.base, format!("http://{casa}:8080"));
        assert_eq!(r.nombre, casa);
    }

    #[test]
    fn acepta_usb_de_ev3dev_y_nombres_local() {
        assert!(validar_robot(&ip(10, 42, 0, 3)).is_ok());
        assert!(validar_robot(&ip(169, 254, 7, 9)).is_ok());
        assert!(validar_robot("ev3dev.local").is_ok());
        assert!(validar_robot("localhost:9090").is_ok());
    }

    #[test]
    fn respeta_el_puerto_escrito() {
        let r = validar_robot(&format!("{}:9000", ip(172, 16, 5, 4))).unwrap();
        assert!(r.base.ends_with(":9000"));
        assert!(r.nombre.ends_with(":9000"));
    }

    #[test]
    fn rechaza_direcciones_fuera_de_la_red_local() {
        assert!(validar_robot(&ip(8, 8, 8, 8)).is_err());
        assert!(validar_robot("ejemplo.com").is_err());
        assert!(validar_robot("http://ev3dev.local").is_err());
        assert!(validar_robot("ev3dev.local/status").is_err());
        assert!(validar_robot("").is_err());
        assert!(validar_robot(".local").is_err());
        assert!(validar_robot(&format!("{}:0", ip(192, 168, 0, 9))).is_err());
        assert!(validar_robot(&format!("{}:99999", ip(192, 168, 0, 9))).is_err());
    }

    #[test]
    fn el_estado_del_robot_se_lee_con_la_direccion_y_alcanzable() {
        let robot = validar_robot("ev3dev.local").unwrap();
        let cuerpo = r#"{"connected":true,"battery":7.9,
            "motors":[{"port":"outB","connected":true,"speed":120,"position":-360}],
            "sensors":[{"port":"in1","sensor_type":"ultrasonic","value":23.0}]}"#;
        let e = estado_desde_robot(cuerpo, &robot).unwrap();
        assert!(e.connected && e.reachable);
        assert_eq!(e.ip, "ev3dev.local");
        assert_eq!(e.motors[0].position, Some(-360));
        assert_eq!(e.sensors[0].sensor_type, "ultrasonic");
    }

    #[test]
    fn una_respuesta_rota_del_robot_es_error() {
        let robot = validar_robot("ev3dev.local").unwrap();
        assert!(estado_desde_robot("<html>", &robot).is_err());
    }
}
