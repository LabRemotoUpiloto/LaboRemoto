//! cmd/moodle_cursos — cursos y prácticas desde Moodle (vía broker).
//!
//! El cliente NO habla con Moodle ni conoce su token: manda el access_token de Keycloak al broker
//! (`infra/broker-moodle/moodle.js`), que valida la identidad, consulta Moodle con su propio token y
//! solo devuelve lo que esa persona puede ver. Convención: la práctica `ev3-m3` se vincula a una
//! tarea de Moodle con ID number `labo:ev3-m3`.
//!
//! (El módulo `cmd::integration::moodle` es el cliente directo anterior, con el token dentro del
//! binario; este lo reemplaza para cursos y resultados.)

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use ts_rs::TS;

use crate::cmd::broker_client::{access_token, error_de_red, get_json};
use crate::cmd::nvr::shinobi::{HTTP_CLIENT, BROKER_HOST};
use crate::cmd::protocol::CommandError;
use crate::session_manager::SessionManager;

#[derive(Serialize, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MoodleCurso {
    pub id: u32,
    pub nombre: String,
    pub corto: String,
    /// "docente" | "estudiante" (el que tiene la persona en ese curso)
    pub rol: String,
}

#[derive(Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MisCursos {
    /// `false` si la persona aún no tiene cuenta en Moodle (mismo username que en Keycloak).
    pub en_moodle: bool,
    pub cursos: Vec<MoodleCurso>,
}

#[derive(Serialize, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MoodlePractica {
    /// Id del módulo de curso en Moodle (el que se usa para enviar el resultado).
    pub cmid: u32,
    pub tarea_id: u32,
    pub nombre: String,
    /// Id de la práctica de LaboRemoto, p. ej. "ev3-m3".
    pub practica: String,
    /// La tarea tiene flujo de calificación: el resultado queda «listo para revisar».
    pub flujo_revision: bool,
    pub nota_maxima: Option<f64>,
    /// Solo para estudiantes: "notgraded" | "readyforreview" | "inreview" | "graded" | …
    pub estado: Option<String>,
}

#[derive(Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PracticasCurso {
    pub curso: MoodleCurso,
    pub practicas: Vec<MoodlePractica>,
}

/// Una práctica tal como la ve el docente en la lista de entregas.
#[derive(Serialize, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PracticaEntregas {
    pub cmid: u32,
    pub nombre: String,
    pub practica: String,
    pub nota_maxima: Option<f64>,
    pub flujo_revision: bool,
}

/// Cómo va un estudiante en una práctica.
#[derive(Serialize, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct EntregaEstudiante {
    /// Usuario de Moodle (el mismo que en Keycloak).
    pub usuario: String,
    pub nombre: String,
    /// Estado de revisión: "notgraded" | "readyforreview" | "inreview" | "readyforrelease" | "released" | "graded" | …
    pub estado: String,
    /// Nota provisional o final, de 0 a 100; `None` si todavía no hay.
    pub nota: Option<f64>,
    /// ISO 8601 (UTC) de la última modificación de la nota.
    pub fecha: Option<String>,
}

#[derive(Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct EntregasPractica {
    pub curso: MoodleCurso,
    pub practica: PracticaEntregas,
    pub estudiantes: Vec<EntregaEstudiante>,
}

/// Cómo va un estudiante en una práctica concreta (una celda de la vista general del curso).
#[derive(Serialize, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct EntregaPractica {
    pub cmid: u32,
    pub estado: String,
    /// De 0 a 100; `None` si todavía no hay nota.
    pub nota: Option<f64>,
    pub fecha: Option<String>,
}

/// Un estudiante con una entrada por práctica del curso, en el mismo orden que `ResumenCurso::practicas`.
#[derive(Serialize, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct EstudianteResumen {
    pub usuario: String,
    pub nombre: String,
    pub entregas: Vec<EntregaPractica>,
}

/// Vista general de un curso para el docente: todas las prácticas y cómo va cada estudiante en ellas.
#[derive(Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ResumenCurso {
    pub curso: MoodleCurso,
    pub practicas: Vec<PracticaEntregas>,
    pub estudiantes: Vec<EstudianteResumen>,
}

/// Traduce una respuesta de error del broker a un `CommandError` legible.
fn error_de_broker(ctx: &str, status: reqwest::StatusCode, body: &str) -> CommandError {
    let codigo = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| v.get("error").and_then(|e| e.as_str()).map(str::to_owned))
        .unwrap_or_default();
    let err = match (status.as_u16(), codigo.as_str()) {
        (401, _) => CommandError::permanent("AUTH_FAILED", "Tu sesión expiró. Vuelve a iniciar sesión"),
        (403, "solo_docentes") => CommandError::permanent("AUTH_FAILED", "Solo los docentes del curso pueden ver las entregas"),
        (403, _) => CommandError::permanent("AUTH_FAILED", "No estás matriculado en este curso"),
        (409, "tarea_sin_flujo_de_revision") => CommandError::permanent(
            "VALIDATION_FAILED",
            "La tarea de Moodle debe tener activado el flujo de calificación para recibir resultados",
        ),
        (409, "ya_en_revision_o_calificada") => {
            CommandError::permanent("VALIDATION_FAILED", "Esta práctica ya está en revisión o calificada por el docente")
        }
        (404, _) => CommandError::permanent("NOT_FOUND", "La práctica no existe en Moodle"),
        (503, _) => CommandError::transient("COMMUNICATION_ERROR", "Moodle no está configurado en el servidor").with_retry_after(10_000),
        _ => CommandError::transient("COMMUNICATION_ERROR", format!("Moodle respondió {status}: {body}")).with_retry_after(3000),
    };
    err.with_context(ctx, "broker")
}

/// Cursos de la persona en Moodle, con su rol en cada uno.
#[tauri::command]
pub async fn moodle_mis_cursos(manager: tauri::State<'_, Arc<dyn SessionManager>>) -> Result<MisCursos, CommandError> {
    let ctx = "moodle_mis_cursos";
    get_json(ctx, "los cursos", "/nvr/moodle/cursos", manager.inner(), |status, body| error_de_broker(ctx, status, body)).await
}

/// Prácticas (tareas `labo:…`) de un curso. El broker exige que la persona esté matriculada.
#[tauri::command]
pub async fn moodle_practicas_curso(
    curso_id: u32,
    manager: tauri::State<'_, Arc<dyn SessionManager>>,
) -> Result<PracticasCurso, CommandError> {
    let ctx = "moodle_practicas_curso";
    get_json(ctx, "los cursos", &format!("/nvr/moodle/cursos/{curso_id}/practicas"), manager.inner(), |status, body| {
        error_de_broker(ctx, status, body)
    })
    .await
}

/// Cómo va cada estudiante en una práctica (estado, nota y fecha). Solo para docentes del curso: el broker responde 403 al resto.
#[tauri::command]
pub async fn moodle_entregas_practica(
    curso_id: u32,
    cmid: u32,
    manager: tauri::State<'_, Arc<dyn SessionManager>>,
) -> Result<EntregasPractica, CommandError> {
    let ctx = "moodle_entregas_practica";
    get_json(ctx, "los cursos", &format!("/nvr/moodle/cursos/{curso_id}/practicas/{cmid}/entregas"), manager.inner(), |status, body| {
        error_de_broker(ctx, status, body)
    })
    .await
}

/// Vista general de un curso (todas las prácticas × todos los estudiantes). Solo docentes del curso.
#[tauri::command]
pub async fn moodle_resumen_curso(
    curso_id: u32,
    manager: tauri::State<'_, Arc<dyn SessionManager>>,
) -> Result<ResumenCurso, CommandError> {
    let ctx = "moodle_resumen_curso";
    get_json(ctx, "los cursos", &format!("/nvr/moodle/cursos/{curso_id}/resumen"), manager.inner(), |status, body| {
        error_de_broker(ctx, status, body)
    })
    .await
}

/// Enlace que el docente pega en la descripción de la tarea de Moodle: abre una página puente del servidor que lanza la app en esa
/// práctica (`laboremoto://practica/<id>`). Moodle no deja usar enlaces con un esquema propio, pero sí http(s).
#[tauri::command]
pub fn moodle_enlace_practica(practica: String) -> Result<String, CommandError> {
    enlace_de_practica(&practica)
}

fn enlace_de_practica(practica: &str) -> Result<String, CommandError> {
    let valido = !practica.is_empty()
        && practica.len() <= 100
        && practica.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'));
    if !valido {
        return Err(CommandError::permanent("VALIDATION_FAILED", "Id de práctica inválido").with_context("moodle_enlace_practica", practica));
    }
    Ok(format!("{BROKER_HOST}/nvr/moodle/abrir/{practica}"))
}

/// Buffer crudo de la terminal de la práctica (ANSI tal como lo serializa xterm) y los datos de la sesión: con esto se arma el mismo
/// HTML que el log guardado, que viaja a Moodle como archivo de comentarios.
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RegistroSesion {
    pub session_id: String,
    pub user: String,
    pub host: String,
    pub port: u16,
    pub start_time: String,
    pub end_time: String,
    pub raw_content: String,
}

/// Lo que se manda al broker: el HTML completo comprimido (gzip) y en base64, para que un registro grande quepa en la petición.
pub(crate) fn registro_comprimido(r: &RegistroSesion) -> Result<String, CommandError> {
    use base64::Engine;
    use std::io::Write;
    let html = crate::cmd::logs::logs::html_de_buffer_crudo(
        &r.session_id, r.user.clone(), r.host.clone(), r.port, &r.start_time, &r.end_time, &r.raw_content,
    )?;
    let mut gz = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    gz.write_all(html.as_bytes())
        .map_err(|e| CommandError::internal("COMPRESSION_FAILED", e.to_string()))?;
    let bytes = gz.finish().map_err(|e| CommandError::internal("COMPRESSION_FAILED", e.to_string()))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// Envía el resultado de una práctica a Moodle como nota provisional «lista para revisar»: el docente
/// decide la nota final. `nota` va de 0 a 100. Con `registro`, también el registro completo de la sesión
/// (mismo formato que el log guardado) como archivo adjunto. Devuelve cómo quedó el registro:
/// "adjuntado" | "no_enviado" | "fallo_la_subida" | "no_valido" | "subida_no_disponible".
#[tauri::command]
pub async fn moodle_enviar_resultado(
    cmid: u32,
    nota: f64,
    resumen: String,
    registro: Option<RegistroSesion>,
    manager: tauri::State<'_, Arc<dyn SessionManager>>,
) -> Result<String, CommandError> {
    let ctx = "moodle_enviar_resultado";
    if !nota.is_finite() || !(0.0..=100.0).contains(&nota) {
        return Err(CommandError::permanent("VALIDATION_FAILED", "La nota debe estar entre 0 y 100").with_context(ctx, "cliente"));
    }
    let token = access_token(manager.inner()).await?;
    let mut cuerpo = serde_json::json!({ "cmid": cmid, "nota": nota, "resumen": resumen });
    if let Some(r) = registro.as_ref() {
        // Comprimir un registro grande no debe bloquear el runtime async.
        let comprimido = {
            let datos = r.clone();
            tokio::task::spawn_blocking(move || registro_comprimido(&datos))
                .await
                .map_err(|e| CommandError::internal("TASK_JOIN_ERROR", e.to_string()))??
        };
        cuerpo["log"] = serde_json::json!({ "gzipBase64": comprimido });
    }
    let response = HTTP_CLIENT
        .post(format!("{BROKER_HOST}/nvr/moodle/resultado"))
        .bearer_auth(&token)
        .json(&cuerpo)
        .send()
        .await
        .map_err(|e| error_de_red(ctx, "los cursos", e))?;
    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(error_de_broker(ctx, status, &text));
    }
    let texto = response.text().await.unwrap_or_default();
    Ok(registro_de_respuesta(&texto))
}

/// «registro» de la respuesta del broker; si no viene (broker anterior), "no_enviado".
fn registro_de_respuesta(texto: &str) -> String {
    serde_json::from_str::<serde_json::Value>(texto)
        .ok()
        .and_then(|v| v.get("registro").and_then(|r| r.as_str().map(String::from)))
        .unwrap_or_else(|| "no_enviado".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn el_registro_viaja_comprimido_y_con_el_formato_completo_del_log() {
        use base64::Engine;
        use std::io::Read;
        let r = RegistroSesion {
            session_id: "s1".into(), user: "ana@upiloto.edu".into(), host: "172.16.34.1".into(), port: 22,
            start_time: "2026-10-04T18:00:00Z".into(), end_time: "2026-10-04T18:10:00Z".into(),
            raw_content: "ana@pi:~ $ pwd\r\n/home/ana\r\n".repeat(50),
        };
        let b64 = registro_comprimido(&r).unwrap();
        let gz = base64::engine::general_purpose::STANDARD.decode(b64).unwrap();
        let mut html = String::new();
        flate2::read::GzDecoder::new(&gz[..]).read_to_string(&mut html).unwrap();
        assert!(html.contains("<!DOCTYPE html>"), "es el HTML completo, no solo el fragmento");
        assert!(html.contains("/home/ana"));
        assert!(gz.len() < html.len(), "va comprimido");
    }

    #[test]
    fn un_buffer_con_fechas_invalidas_es_un_error_y_no_un_registro_vacio() {
        let r = RegistroSesion {
            session_id: "s1".into(), user: "u".into(), host: "h".into(), port: 22,
            start_time: "ayer".into(), end_time: "hoy".into(), raw_content: "x".into(),
        };
        assert!(registro_comprimido(&r).is_err());
    }

    #[test]
    fn el_enlace_de_la_practica_apunta_a_la_pagina_puente_y_rechaza_ids_raros() {
        assert_eq!(enlace_de_practica("ev3-m3").unwrap(), format!("{BROKER_HOST}/nvr/moodle/abrir/ev3-m3"));
        for malo in ["", "a b", "x/../y", "<b>", "a\"b"] {
            assert!(enlace_de_practica(malo).is_err(), "{malo}");
        }
    }

    #[test]
    fn lee_las_entregas_de_una_practica_como_las_manda_el_broker() {
        let json = r#"{"curso":{"id":2,"nombre":"Robótica EV3 (prueba)","corto":"ROBOEV3","rol":"docente"},
            "practica":{"cmid":4,"nombre":"Práctica EV3 · Python","practica":"ev3-m5","notaMaxima":100,"flujoRevision":true},
            "estudiantes":[{"usuario":"a@x","nombre":"Ana","estado":"readyforreview","nota":75,"fecha":"2026-10-04T09:02:35.000Z"},
                           {"usuario":"b@x","nombre":"Beto","estado":"notgraded","nota":null,"fecha":null}]}"#;
        let r: EntregasPractica = serde_json::from_str(json).unwrap();
        assert_eq!(r.practica.practica, "ev3-m5");
        assert_eq!(r.estudiantes[0].nota, Some(75.0));
        assert_eq!(r.estudiantes[1].nota, None);
        assert!(r.estudiantes[1].fecha.is_none());
    }

    #[test]
    fn lee_el_resumen_general_de_un_curso() {
        let json = r#"{"curso":{"id":2,"nombre":"Robótica","corto":"ROBO","rol":"docente"},
            "practicas":[{"cmid":2,"nombre":"m1","practica":"ev3-m1","notaMaxima":100,"flujoRevision":false},
                         {"cmid":4,"nombre":"m5","practica":"ev3-m5","notaMaxima":100,"flujoRevision":true}],
            "estudiantes":[{"usuario":"a@x","nombre":"Ana","entregas":[
                {"cmid":2,"estado":"graded","nota":85,"fecha":"2026-10-03T22:48:00.000Z"},
                {"cmid":4,"estado":"notgraded","nota":null,"fecha":null}]}]}"#;
        let r: ResumenCurso = serde_json::from_str(json).unwrap();
        assert_eq!(r.practicas.len(), 2);
        assert_eq!(r.estudiantes[0].entregas.len(), r.practicas.len());
        assert_eq!(r.estudiantes[0].entregas[0].nota, Some(85.0));
        assert!(r.estudiantes[0].entregas[1].nota.is_none());
    }

    #[test]
    fn un_estudiante_que_pide_las_entregas_recibe_un_mensaje_claro() {
        let e = error_de_broker("x", reqwest::StatusCode::FORBIDDEN, r#"{"error":"solo_docentes"}"#);
        assert!(format!("{e:?}").contains("Solo los docentes"));
    }

    #[test]
    fn lee_como_quedo_el_registro_segun_el_broker() {
        assert_eq!(registro_de_respuesta(r#"{"ok":true,"estado":"readyforreview","registro":"adjuntado"}"#), "adjuntado");
        assert_eq!(registro_de_respuesta(r#"{"ok":true,"estado":"readyforreview"}"#), "no_enviado");
        assert_eq!(registro_de_respuesta("no es json"), "no_enviado");
    }

    // Respuestas reales del broker (infra/broker-moodle) contra el Moodle de prueba. Si el broker cambia un campo,
    // estas pruebas fallan aquí en vez de mostrar «Respuesta inválida de los cursos» al usuario.

    #[test]
    fn lee_mis_cursos() {
        let json = r#"{"enMoodle":true,"cursos":[{"id":3,"nombre":"Linux básico (prueba)","corto":"LINUX","rol":"estudiante"},{"id":2,"nombre":"Robótica EV3 (prueba)","corto":"ROBOEV3","rol":"docente"}]}"#;
        let r: MisCursos = serde_json::from_str(json).unwrap();
        assert!(r.en_moodle);
        assert_eq!(r.cursos.len(), 2);
        assert_eq!(r.cursos[1].corto, "ROBOEV3");
        assert_eq!(r.cursos[1].rol, "docente");
    }

    #[test]
    fn lee_mis_cursos_sin_cuenta_en_moodle() {
        let r: MisCursos = serde_json::from_str(r#"{"enMoodle":false,"cursos":[]}"#).unwrap();
        assert!(!r.en_moodle);
        assert!(r.cursos.is_empty());
    }

    #[test]
    fn lee_practicas_de_un_curso_estudiante_y_docente() {
        // Estudiante: trae `estado`. Docente: no lo trae (campo opcional).
        let est = r#"{"curso":{"id":3,"nombre":"Linux básico (prueba)","corto":"LINUX","rol":"estudiante"},"practicas":[{"cmid":7,"tareaId":5,"nombre":"Archivos y permisos","practica":"linux-m2","flujoRevision":true,"notaMaxima":100,"estado":"readyforreview"}]}"#;
        let r: PracticasCurso = serde_json::from_str(est).unwrap();
        assert_eq!(r.curso.corto, "LINUX");
        assert_eq!(r.practicas[0].estado.as_deref(), Some("readyforreview"));
        assert!(r.practicas[0].flujo_revision);

        let doc = r#"{"curso":{"id":2,"nombre":"Robótica EV3 (prueba)","corto":"ROBOEV3","rol":"docente"},"practicas":[{"cmid":2,"tareaId":1,"nombre":"Conociendo el EV3","practica":"ev3-m1","flujoRevision":false,"notaMaxima":null}]}"#;
        let r: PracticasCurso = serde_json::from_str(doc).unwrap();
        assert_eq!(r.practicas[0].estado, None);
        assert_eq!(r.practicas[0].nota_maxima, None);
        assert!(!r.practicas[0].flujo_revision);
    }

    #[test]
    fn el_error_de_falta_de_campo_es_el_que_veia_el_usuario() {
        // Reproduce el fallo original: `curso` sin `corto`.
        let roto = r#"{"curso":{"id":3,"nombre":"X","rol":"estudiante"},"practicas":[]}"#;
        let e = match serde_json::from_str::<PracticasCurso>(roto) {
            Ok(_) => panic!("debía fallar: falta `corto`"),
            Err(e) => e.to_string(),
        };
        assert!(e.contains("missing field `corto`"), "{e}");
    }
}
