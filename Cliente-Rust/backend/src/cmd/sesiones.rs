//! cmd/sesiones — registro central de sesiones de práctica (vía broker).
//!
//! La app reporta inicio/latido/fin de cada práctica al broker de la Pi
//! (`infra/broker-sesiones/sesiones.js`) con el access_token de Keycloak — así el
//! registro lleva al estudiante real, no la cuenta compartida del sistema
//! operativo. El dashboard del personal de laboratorio lee de ahí el resumen.

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use ts_rs::TS;

use crate::cmd::broker_client::{access_token, error_de_red, get_json, HTTP_CLIENT, BROKER_HOST};
use crate::auth::client::reparar_mojibake;
use crate::cmd::protocol::CommandError;
use crate::session_manager::SessionManager;

/// Una sesión tal como la guarda el broker: una práctica o la app abierta (`clase`).
#[derive(Serialize, Deserialize, Clone, TS)]
#[ts(export)]
pub struct SesionPractica {
    pub id: String,
    /// "practica" | "app" (la app abierta, con o sin práctica). Las sesiones viejas no lo traen: son prácticas.
    #[serde(default)]
    pub clase: Option<String>,
    pub sesion_id: String,
    pub usuario: String,
    pub nombre: Option<String>,
    pub correo: Option<String>,
    pub practica_id: Option<String>,
    pub practica_nombre: Option<String>,
    /// ISO 8601 (UTC)
    pub inicio: String,
    pub ultimo_latido: String,
    /// `None` mientras la sesión sigue activa.
    pub fin: Option<String>,
    /// "cliente" (se cerró la práctica) | "sin_latido" (app cerrada o sin red)
    pub cierre: Option<String>,
    pub ip: Option<String>,
    /// Barrio y/o ciudad: por IP (aprox.) o del dispositivo vía Nominatim.
    pub ciudad: Option<String>,
    pub region: Option<String>,
    pub pais: Option<String>,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
    /// "ip" (aprox. nivel ciudad) | "dispositivo" (servicio de ubicación del equipo)
    pub fuente_ubicacion: Option<String>,
    /// Precisión reportada por el equipo, en metros (solo fuente "dispositivo").
    pub precision_m: Option<f64>,
    /// Ubicación por IP y operador de la red, guardados aparte de la del equipo: si no cuadran, Actividad la marca como dudosa.
    #[serde(default)]
    pub ip_ciudad: Option<String>,
    #[serde(default)]
    pub ip_region: Option<String>,
    #[serde(default)]
    pub ip_pais: Option<String>,
    #[serde(default)]
    pub ip_lat: Option<f64>,
    #[serde(default)]
    pub ip_lon: Option<f64>,
    /// Operador de la red («AS10620 Telmex Colombia S.A.»): casa, celular, universidad o un servidor.
    #[serde(default)]
    pub ip_org: Option<String>,
}

#[derive(Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ResumenSesiones {
    pub generado: String,
    pub dias: u32,
    /// Más recientes primero.
    pub sesiones: Vec<SesionPractica>,
}

const TIPOS_EVENTO: &[&str] = &["inicio", "latido", "fin", "ubicacion"];
const QUE: &str = "el registro de sesiones";

/// Reporta un evento de la sesión de práctica `sesion_id` (el id de la
/// sesión SSH). La identidad del estudiante la pone el broker desde el token.
/// `lat`/`lon`/`precision_m` solo aplican al tipo "ubicacion".
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn sesiones_reportar_evento(
    tipo: String,
    sesion_id: String,
    practica_id: Option<String>,
    practica_nombre: Option<String>,
    lat: Option<f64>,
    lon: Option<f64>,
    precision_m: Option<f64>,
    manager: tauri::State<'_, Arc<dyn SessionManager>>,
) -> Result<(), CommandError> {
    if !TIPOS_EVENTO.contains(&tipo.as_str()) {
        return Err(CommandError::permanent("VALIDATION_FAILED", format!("Tipo de evento inválido: {tipo}")));
    }
    let token = access_token(manager.inner()).await?;
    let body = serde_json::json!({
        "tipo": tipo,
        "sesion_id": sesion_id,
        "practica_id": practica_id,
        "practica_nombre": practica_nombre,
        "lat": lat,
        "lon": lon,
        "precision_m": precision_m,
    });

    let response = HTTP_CLIENT
        .post(format!("{BROKER_HOST}/nvr/sesiones/evento"))
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await
        .map_err(|e| error_de_red("sesiones_reportar_evento", QUE, e))?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(CommandError::permanent("VALIDATION_FAILED", format!("Registro de sesiones respondió {status}: {text}"))
            .with_context("sesiones_reportar_evento", &sesion_id));
    }
    Ok(())
}

/// Avisa al broker dónde está el equipo (ubicación ya redondeada en el cliente), con o sin práctica abierta. El broker la usa para
/// ubicar con exactitud las conexiones SSH que salen de la misma IP; no crea ninguna sesión de práctica.
#[tauri::command]
pub async fn sesiones_reportar_ubicacion_app(
    lat: f64,
    lon: f64,
    precision_m: Option<f64>,
    manager: tauri::State<'_, Arc<dyn SessionManager>>,
) -> Result<(), CommandError> {
    let token = access_token(manager.inner()).await?;
    let response = HTTP_CLIENT
        .post(format!("{BROKER_HOST}/nvr/sesiones/ubicacion-app"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "lat": lat, "lon": lon, "precision_m": precision_m }))
        .send()
        .await
        .map_err(|e| error_de_red("sesiones_reportar_ubicacion_app", QUE, e))?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(CommandError::permanent("VALIDATION_FAILED", format!("Registro de sesiones respondió {status}: {text}"))
            .with_context("sesiones_reportar_ubicacion_app", "broker"));
    }
    Ok(())
}

const TIPOS_EVENTO_APP: &[&str] = &["inicio", "latido", "fin"];

/// Reporta el uso de la app (`sesion_id` propio de esta apertura de la app): inicio al entrar, un latido por minuto y fin
/// al salir. Va a una ruta aparte del broker: uno sin esta versión responde 404 y no registra nada.
#[tauri::command]
pub async fn sesiones_reportar_app(
    tipo: String,
    sesion_id: String,
    manager: tauri::State<'_, Arc<dyn SessionManager>>,
) -> Result<(), CommandError> {
    if !TIPOS_EVENTO_APP.contains(&tipo.as_str()) {
        return Err(CommandError::permanent("VALIDATION_FAILED", format!("Tipo de evento inválido: {tipo}")));
    }
    let token = access_token(manager.inner()).await?;
    let response = HTTP_CLIENT
        .post(format!("{BROKER_HOST}/nvr/sesiones/app"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "tipo": tipo, "sesion_id": sesion_id }))
        .send()
        .await
        .map_err(|e| error_de_red("sesiones_reportar_app", QUE, e))?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(CommandError::permanent("VALIDATION_FAILED", format!("Registro de sesiones respondió {status}: {text}"))
            .with_context("sesiones_reportar_app", &sesion_id));
    }
    Ok(())
}

/// Sesiones de los últimos `dias` días (1–90, default 30). Solo para roles de
/// supervisión — el broker responde 403 al resto.
#[tauri::command]
pub async fn sesiones_resumen(
    dias: Option<u32>,
    manager: tauri::State<'_, Arc<dyn SessionManager>>,
) -> Result<ResumenSesiones, CommandError> {
    let ctx = "sesiones_resumen";
    let dias = dias.unwrap_or(30);

    get_json(ctx, QUE, &format!("/nvr/sesiones/resumen?dias={dias}"), manager.inner(), |status, text| {
        let err = match status.as_u16() {
            401 | 403 => CommandError::permanent("AUTH_FAILED", "No tienes permiso para ver el registro de sesiones"),
            _ => CommandError::transient("COMMUNICATION_ERROR", format!("Registro de sesiones respondió {status}: {text}"))
                .with_retry_after(3000),
        };
        err.with_context(ctx, "broker")
    })
    .await
    .map(|mut r: ResumenSesiones| {
        // el nombre viene del token, con la Ñ y las tildes del directorio dañadas (ver reparar_mojibake)
        for s in &mut r.sesiones {
            s.nombre = s.nombre.take().map(|n| reparar_mojibake(&n));
        }
        r
    })
}
