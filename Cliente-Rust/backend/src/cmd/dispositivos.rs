//! cmd/dispositivos — conexiones SSH a los dispositivos (Pi), para la pestaña «Dispositivos» de Actividad.
//!
//! Un agente en cada dispositivo (`infra/agente-conexiones`) avisa al broker (`infra/broker-sesiones/dispositivos.js`) de cada
//! entrada y salida SSH, desde que arranca (sin historial). Aquí solo se CONSULTA el resumen con el access_token de Keycloak;
//! el broker responde 403 a quien no sea personal de supervisión. Es aparte de las prácticas (`cmd::sesiones`).

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use ts_rs::TS;

use crate::cmd::broker_client::get_text;
use crate::cmd::protocol::CommandError;
use crate::session_manager::SessionManager;

/// Una conexión SSH de una persona del LDAP a un dispositivo.
#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ConexionDispositivo {
    pub id: String,
    /// Como en el Excel: `UPILOTO\persona`.
    pub usuario: String,
    pub persona: Option<String>,
    /// Nombre completo, si la persona ya usó la app.
    pub nombre: Option<String>,
    /// ISO 8601 (UTC)
    pub inicio: String,
    /// `None` mientras sigue conectada.
    pub fin: Option<String>,
    pub activa: bool,
    /// "cliente" (cerró la sesión) | "sin_cierre" (el dispositivo dejó de verla abierta)
    pub cierre: Option<String>,
    pub ip: String,
    pub ciudad: Option<String>,
    pub region: Option<String>,
    pub pais: Option<String>,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
}

/// La cuenta compartida `pi` (prácticas EV3): no identifica a la persona, solo se cuenta.
#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CuentaCompartida {
    pub nombre: String,
    pub conexiones: u32,
    pub activas: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CuentaNoReconocida {
    pub usuario: String,
    pub ip: String,
    pub inicio: String,
    pub activa: bool,
    pub ciudad: Option<String>,
    pub pais: Option<String>,
}

/// Entradas con cuentas que no son del LDAP ni la compartida (p. ej. `root`): conviene avisar de ellas.
#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct NoReconocidas {
    pub conexiones: u32,
    pub activas: u32,
    pub ultimas: Vec<CuentaNoReconocida>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DispositivoActividad {
    pub id: String,
    pub nombre: String,
    /// El agente del dispositivo ha reportado en los últimos 90 s.
    pub en_linea: bool,
    pub ultimo_latido: Option<String>,
    pub conectados: Vec<ConexionDispositivo>,
    pub conexiones: Vec<ConexionDispositivo>,
    pub total_conexiones: u32,
    pub personas_distintas: u32,
    pub cuenta_compartida: CuentaCompartida,
    pub no_reconocidas: NoReconocidas,
}

#[derive(Serialize, Deserialize, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ResumenDispositivos {
    pub generado: String,
    pub dias: u32,
    pub dispositivos: Vec<DispositivoActividad>,
}

/// Interpreta la respuesta del broker. Función pura para poder probarla.
fn interpretar(status: u16, texto: &str) -> Result<ResumenDispositivos, CommandError> {
    match status {
        200 => serde_json::from_str(texto)
            .map_err(|e| CommandError::permanent("INVALID_DATA", format!("Respuesta inválida del registro de dispositivos: {e}"))),
        401 | 403 => Err(CommandError::permanent("AUTH_FAILED", "No tienes permiso para ver la actividad de los dispositivos")),
        _ => Err(CommandError::transient("COMMUNICATION_ERROR", format!("El registro de dispositivos respondió {status}: {}", texto.chars().take(200).collect::<String>())).with_retry_after(3000)),
    }
}

/// Conexiones SSH de los últimos `dias` días (1–90, por defecto 30) y quién está conectado ahora. Solo supervisión.
#[tauri::command]
pub async fn dispositivos_resumen(
    dias: Option<u32>,
    manager: tauri::State<'_, Arc<dyn SessionManager>>,
) -> Result<ResumenDispositivos, CommandError> {
    let ctx = "dispositivos_resumen";
    let dias = dias.unwrap_or(30);
    let (status, texto) = get_text(ctx, "el registro de dispositivos", &format!("/nvr/dispositivos/resumen?dias={dias}"), manager.inner()).await?;
    interpretar(status.as_u16(), &texto).map_err(|e| e.with_context(ctx, "broker"))
}

#[cfg(test)]
mod tests {
    use super::*;

    // Respuesta con la forma real del broker (infra/broker-sesiones/dispositivos.js).
    const JSON: &str = r#"{"generado":"2026-10-04T17:00:00.000Z","dias":30,"dispositivos":[{"id":"pi4","nombre":"Pi4","enLinea":true,"ultimoLatido":"2026-10-04T16:59:40.000Z","conectados":[{"id":"pi4:22029:1","usuario":"UPILOTO\\luisa-quijano","persona":"luisa-quijano","nombre":null,"inicio":"2026-10-04T14:29:00.000Z","fin":null,"activa":true,"cierre":null,"ip":"191.156.236.133","ciudad":"Bogotá","region":"Bogotá D.C.","pais":"CO","lat":4.6,"lon":-74.08}],"conexiones":[{"id":"pi4:22029:1","usuario":"UPILOTO\\luisa-quijano","persona":"luisa-quijano","nombre":"Luisa Quijano","inicio":"2026-10-04T14:29:00.000Z","fin":"2026-10-04T14:30:00.000Z","activa":false,"cierre":"cliente","ip":"191.156.236.133","ciudad":null,"region":null,"pais":null,"lat":null,"lon":null}],"totalConexiones":1,"personasDistintas":1,"cuentaCompartida":{"nombre":"pi","conexiones":947,"activas":0},"noReconocidas":{"conexiones":1,"activas":0,"ultimas":[{"usuario":"root","ip":"45.9.9.9","inicio":"2026-10-04T10:00:00.000Z","activa":false,"ciudad":null,"pais":null}]}}]}"#;

    #[test]
    fn lee_el_resumen_completo() {
        let r = interpretar(200, JSON).unwrap();
        assert_eq!(r.dias, 30);
        let d = &r.dispositivos[0];
        assert_eq!((d.id.as_str(), d.en_linea, d.total_conexiones, d.personas_distintas), ("pi4", true, 1, 1));
        assert_eq!(d.conectados[0].usuario, "UPILOTO\\luisa-quijano");
        assert_eq!(d.conectados[0].ciudad.as_deref(), Some("Bogotá"));
        assert_eq!(d.conexiones[0].fin.as_deref(), Some("2026-10-04T14:30:00.000Z"));
        assert_eq!(d.cuenta_compartida.conexiones, 947);
        assert_eq!(d.no_reconocidas.ultimas[0].usuario, "root");
    }

    #[test]
    fn un_dispositivo_sin_agente_todavia_llega_sin_latido() {
        let j = JSON.replace(r#""ultimoLatido":"2026-10-04T16:59:40.000Z""#, r#""ultimoLatido":null"#).replace(r#""enLinea":true"#, r#""enLinea":false"#);
        let d = &interpretar(200, &j).unwrap().dispositivos[0];
        assert!(!d.en_linea);
        assert_eq!(d.ultimo_latido, None);
    }

    #[test]
    fn los_errores_de_permiso_y_servidor_son_errores_del_comando() {
        assert!(interpretar(401, "{}").is_err());
        assert!(interpretar(403, r#"{"error":"forbidden"}"#).is_err());
        assert!(interpretar(502, "x").is_err());
        assert!(interpretar(200, "no es json").is_err());
    }
}
