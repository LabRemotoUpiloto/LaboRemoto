//! cmd/encuestas — encuesta que el estudiante llena al terminar una práctica completa (todos sus módulos): preguntas
//! generales de aprendizaje y de funcionamiento, para saber qué mejorar.
//!
//! El broker (`infra/broker-sesiones/encuestas.js`) toma la identidad del access_token de Keycloak y guarda una respuesta por
//! persona y práctica. El resumen (pestaña «Encuestas» de Actividad) es solo para supervisión y es ANÓNIMO.

use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::cmd::broker_client::{access_token, error_de_red, get_text, BROKER_HOST, HTTP_CLIENT};
use crate::cmd::protocol::CommandError;
use crate::session_manager::SessionManager;

const QUE: &str = "el registro de encuestas";

/// Lo que responde el estudiante. Las escalas van de 1 a 5.
#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[ts(export)]
pub struct RespuestasEncuesta {
    pub aprendizaje: u8,
    pub claridad: u8,
    pub funcionamiento: u8,
    pub satisfaccion: u8,
    /// 1 a 5, o "no_uso" si no usó el asistente del chat.
    #[ts(type = "number | \"no_uso\"")]
    pub asistente: serde_json::Value,
    /// "muy_facil" | "facil" | "adecuada" | "dificil" | "muy_dificil"
    pub dificultad: String,
    /// "ninguno" (solo) o varios de "lentitud" | "desconexiones" | "terminal" | "camara" | "guia" | "otro"
    pub problemas: Vec<String>,
    pub gusto: String,
    pub mejorar: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[ts(export)]
pub struct PromediosEncuesta {
    pub aprendizaje: Option<f64>,
    pub claridad: Option<f64>,
    pub funcionamiento: Option<f64>,
    pub satisfaccion: Option<f64>,
    /// Solo de quienes sí usaron el asistente.
    pub asistente: Option<f64>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[ts(export)]
pub struct ComentarioEncuesta {
    pub fecha: String,
    pub gusto: String,
    pub mejorar: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ResumenPracticaEncuesta {
    pub practica: String,
    pub respuestas: u32,
    pub promedios: PromediosEncuesta,
    pub asistente_no_uso: u32,
    pub dificultad: HashMap<String, u32>,
    pub problemas: HashMap<String, u32>,
    /// Sin autor, los más recientes primero.
    pub comentarios: Vec<ComentarioEncuesta>,
}

#[derive(Serialize, Deserialize, Debug, TS)]
#[ts(export)]
pub struct ResumenEncuestas {
    pub generado: String,
    pub dias: u32,
    pub version: u32,
    pub practicas: Vec<ResumenPracticaEncuesta>,
}

#[derive(Deserialize)]
struct Mia {
    respondida: bool,
}

fn error_del_broker(status: u16, texto: &str) -> CommandError {
    match status {
        401 => CommandError::permanent("AUTH_FAILED", "Tu sesión expiró. Vuelve a iniciar sesión"),
        403 => CommandError::permanent("AUTH_FAILED", "No tienes permiso para ver las encuestas"),
        400 => CommandError::permanent("VALIDATION_FAILED", format!("La encuesta no es válida: {}", texto.chars().take(200).collect::<String>())),
        _ => CommandError::transient("COMMUNICATION_ERROR", format!("El registro de encuestas respondió {status}: {}", texto.chars().take(200).collect::<String>()))
            .with_retry_after(3000),
    }
}

fn practica_valida(p: &str) -> bool {
    !p.is_empty() && p.len() <= 64 && p.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '.' | '_' | '-'))
}

/// Envía (o reemplaza) la encuesta de una práctica. La identidad la pone el broker desde el token.
#[tauri::command]
pub async fn encuestas_enviar(
    practica: String,
    respuestas: RespuestasEncuesta,
    manager: tauri::State<'_, Arc<dyn SessionManager>>,
) -> Result<(), CommandError> {
    let ctx = "encuestas_enviar";
    if !practica_valida(&practica) {
        return Err(CommandError::permanent("VALIDATION_FAILED", "Práctica inválida").with_context(ctx, "cliente"));
    }
    let token = access_token(manager.inner()).await?;
    let response = HTTP_CLIENT
        .post(format!("{BROKER_HOST}/nvr/encuestas"))
        .bearer_auth(&token)
        .json(&serde_json::json!({ "practica": practica, "respuestas": respuestas }))
        .send()
        .await
        .map_err(|e| error_de_red(ctx, QUE, e))?;
    let status = response.status();
    if !status.is_success() {
        let texto = response.text().await.unwrap_or_default();
        return Err(error_del_broker(status.as_u16(), &texto).with_context(ctx, "broker"));
    }
    Ok(())
}

/// ¿La persona ya respondió la encuesta de esta práctica? (en cualquier equipo)
#[tauri::command]
pub async fn encuestas_mia(practica: String, manager: tauri::State<'_, Arc<dyn SessionManager>>) -> Result<bool, CommandError> {
    let ctx = "encuestas_mia";
    if !practica_valida(&practica) {
        return Err(CommandError::permanent("VALIDATION_FAILED", "Práctica inválida").with_context(ctx, "cliente"));
    }
    let (status, texto) = get_text(ctx, QUE, &format!("/nvr/encuestas/mia?practica={practica}"), manager.inner()).await?;
    if !status.is_success() {
        return Err(error_del_broker(status.as_u16(), &texto).with_context(ctx, "broker"));
    }
    serde_json::from_str::<Mia>(&texto)
        .map(|m| m.respondida)
        .map_err(|e| CommandError::permanent("INVALID_DATA", format!("Respuesta inválida del registro de encuestas: {e}")).with_context(ctx, "broker"))
}

/// Resumen anónimo de las encuestas de los últimos `dias` días (1–365, por defecto 90). Solo supervisión.
#[tauri::command]
pub async fn encuestas_resumen(dias: Option<u32>, manager: tauri::State<'_, Arc<dyn SessionManager>>) -> Result<ResumenEncuestas, CommandError> {
    let ctx = "encuestas_resumen";
    let (status, texto) = get_text(ctx, QUE, &format!("/nvr/encuestas/resumen?dias={}", dias.unwrap_or(90)), manager.inner()).await?;
    interpretar_resumen(status.as_u16(), &texto).map_err(|e| e.with_context(ctx, "broker"))
}

fn interpretar_resumen(status: u16, texto: &str) -> Result<ResumenEncuestas, CommandError> {
    if status != 200 {
        return Err(error_del_broker(status, texto));
    }
    serde_json::from_str(texto).map_err(|e| CommandError::permanent("INVALID_DATA", format!("Respuesta inválida del registro de encuestas: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    // Forma real de la respuesta del broker (infra/broker-sesiones/encuestas.js).
    const JSON: &str = r#"{"generado":"2026-10-18T12:00:00.000Z","dias":90,"version":1,"practicas":[{"practica":"linux","respuestas":2,
        "promedios":{"aprendizaje":4,"claridad":4,"funcionamiento":3,"satisfaccion":4,"asistente":4},"asistenteNoUso":1,
        "dificultad":{"muy_facil":0,"facil":0,"adecuada":1,"dificil":1,"muy_dificil":0},
        "problemas":{"ninguno":1,"lentitud":1,"desconexiones":0,"terminal":0,"camara":0,"guia":0,"otro":0},
        "comentarios":[{"fecha":"2026-10-18T12:00:00.000Z","gusto":"La terminal real","mejorar":"Que cargue más rápido"}]}]}"#;

    #[test]
    fn lee_el_resumen_del_broker() {
        let r = interpretar_resumen(200, JSON).unwrap();
        let p = &r.practicas[0];
        assert_eq!((p.practica.as_str(), p.respuestas, p.asistente_no_uso), ("linux", 2, 1));
        assert_eq!(p.promedios.funcionamiento, Some(3.0));
        assert_eq!(p.dificultad["dificil"], 1);
        assert_eq!(p.comentarios[0].mejorar, "Que cargue más rápido");
    }

    #[test]
    fn una_practica_sin_respuestas_de_asistente_llega_con_promedio_nulo() {
        let j = JSON.replace(r#""asistente":4}"#, r#""asistente":null}"#);
        assert_eq!(interpretar_resumen(200, &j).unwrap().practicas[0].promedios.asistente, None);
    }

    #[test]
    fn errores_del_broker() {
        assert!(interpretar_resumen(403, r#"{"error":"forbidden"}"#).is_err());
        assert!(interpretar_resumen(200, "no es json").is_err());
    }

    #[test]
    fn las_respuestas_viajan_con_los_nombres_que_espera_el_broker() {
        let r = RespuestasEncuesta {
            aprendizaje: 5, claridad: 4, funcionamiento: 3, satisfaccion: 4, asistente: serde_json::json!("no_uso"),
            dificultad: "adecuada".into(), problemas: vec!["ninguno".into()], gusto: String::new(), mejorar: "x".into(),
        };
        let v = serde_json::to_value(&r).unwrap();
        for k in ["aprendizaje", "claridad", "funcionamiento", "satisfaccion", "asistente", "dificultad", "problemas", "gusto", "mejorar"] {
            assert!(v.get(k).is_some(), "{k}");
        }
        assert_eq!(v["asistente"], "no_uso");
    }

    #[test]
    fn valida_el_id_de_practica() {
        assert!(practica_valida("linux") && practica_valida("ev3"));
        assert!(!practica_valida("") && !practica_valida("../x") && !practica_valida("Linux") && !practica_valida("a b"));
    }
}
