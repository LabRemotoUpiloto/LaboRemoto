//! cmd/camaras_admin — administración de cámaras (solo `admin_lab`), vía el broker de cámaras.
//!
//! Crear, editar, eliminar y PROBAR cámaras desde la app. El broker (`infra/broker-camaras/admin.js`) aplica el cambio en
//! Shinobi, MediaMTX y su registro, y guarda las claves; aquí solo se manda lo que escribe el administrador. Las claves
//! viajan solo de la app al broker: el broker nunca las devuelve (solo `tiene_password`).
//!
//! Los resultados «de negocio» (datos inválidos, cámara duplicada, la prueba de conexión falló) NO son errores del
//! comando: vuelven en `ResultadoGuardado` para que la pantalla los muestre campo por campo. Los errores de comando son
//! de sesión, red o servidor.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use std::sync::Arc;
use ts_rs::TS;

use crate::cmd::nvr::shinobi::{BROKER_HOST, HTTP_CLIENT};
use crate::cmd::protocol::CommandError;
use crate::session_manager::SessionManager;

/// Tiempo máximo de una operación de administración (probar, crear, editar, eliminar).
const TIEMPO_MAXIMO_ADMIN: Duration = Duration::from_secs(60);

/// Una cámara tal como la administra el broker. Nunca trae la clave.
#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CamaraAdmin {
    pub id: String,
    pub nombre: String,
    pub host: String,
    pub puerto: u32,
    pub usuario: String,
    pub tiene_password: bool,
    pub rtsp_path: String,
    pub ptz: bool,
    pub habilitada: bool,
    /// Ruta de MediaMTX (video por WebRTC).
    pub ruta: String,
    /// "active" | "connecting" | "offline" (según Shinobi)
    pub estado: Option<String>,
    /// "transmitiendo" | "sin video" (según MediaMTX)
    pub video: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CamarasAdminLista {
    pub camaras: Vec<CamaraAdmin>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct VideoInfo {
    pub codec: Option<String>,
    pub ancho: Option<u32>,
    pub alto: Option<u32>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PruebaRtsp {
    pub ok: bool,
    pub video: Option<VideoInfo>,
    /// "clave" | "timeout" | "rechazada" | "sin_ruta" | "ruta" | "sin_video" | "otro"
    pub codigo: Option<String>,
    pub mensaje: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PruebaApi {
    pub ok: bool,
    pub modelo: Option<String>,
    pub mensaje: Option<String>,
}

/// Resultado de «Probar conexión»: video, clave, modelo y si tiene PTZ.
#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PruebaCamara {
    pub ok: bool,
    pub rtsp: PruebaRtsp,
    pub api: PruebaApi,
    /// `None` si no se pudo saber (no es una Reolink).
    pub ptz: Option<bool>,
}

/// Datos que escribe el administrador. En edición todo es opcional; `password` vacío/ausente = conservar la actual.
#[derive(Serialize, Deserialize, Clone, Debug, Default, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, optional_fields)]
pub struct CamaraEntrada {
    pub nombre: Option<String>,
    pub host: Option<String>,
    pub puerto: Option<u32>,
    pub usuario: Option<String>,
    pub password: Option<String>,
    pub rtsp_path: Option<String>,
    pub ptz: Option<bool>,
    pub habilitada: Option<bool>,
    /// Guardar aunque la prueba de conexión falle.
    pub forzar: Option<bool>,
}

/// Qué pasó al guardar. `resultado`: "ok" | "invalido" | "duplicada" | "prueba_fallida" | "fallo".
#[derive(Serialize, Deserialize, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ResultadoGuardado {
    pub resultado: String,
    pub camara: Option<CamaraAdmin>,
    /// Errores por campo (resultado "invalido" o "duplicada").
    pub errores: Option<HashMap<String, String>>,
    pub prueba: Option<PruebaCamara>,
    pub mensaje: Option<String>,
}

#[derive(Deserialize)]
struct RespuestaGuardado {
    camara: Option<CamaraAdmin>,
    prueba: Option<PruebaCamara>,
}

#[derive(Deserialize)]
struct RespuestaError {
    errores: Option<HashMap<String, String>>,
    prueba: Option<PruebaCamara>,
    message: Option<String>,
    paso: Option<String>,
}

#[derive(Deserialize)]
struct RespuestaPrueba {
    prueba: PruebaCamara,
}

/// Interpreta la respuesta del broker a un alta o edición. Función pura para poder probarla.
fn interpretar_guardado(status: u16, body: &str) -> Result<ResultadoGuardado, CommandError> {
    let vacio = |resultado: &str| ResultadoGuardado { resultado: resultado.into(), camara: None, errores: None, prueba: None, mensaje: None };
    match status {
        200 | 201 => {
            let r: RespuestaGuardado = serde_json::from_str(body)
                .map_err(|e| CommandError::permanent("INVALID_DATA", format!("Respuesta inválida de las cámaras: {e}")))?;
            Ok(ResultadoGuardado { camara: r.camara, prueba: r.prueba, ..vacio("ok") })
        }
        400 | 409 => {
            let e: RespuestaError = serde_json::from_str(body).unwrap_or(RespuestaError { errores: None, prueba: None, message: None, paso: None });
            Ok(ResultadoGuardado { errores: e.errores, ..vacio(if status == 409 { "duplicada" } else { "invalido" }) })
        }
        422 => {
            let e: RespuestaError = serde_json::from_str(body).unwrap_or(RespuestaError { errores: None, prueba: None, message: None, paso: None });
            Ok(ResultadoGuardado { prueba: e.prueba, ..vacio("prueba_fallida") })
        }
        502 => {
            let e: RespuestaError = serde_json::from_str(body).unwrap_or(RespuestaError { errores: None, prueba: None, message: None, paso: None });
            let donde = e.paso.map(|p| format!(" al actualizar {p}")).unwrap_or_default();
            Ok(ResultadoGuardado {
                mensaje: Some(format!("No se pudo guardar{donde}; se deshizo el cambio.{}", e.message.map(|m| format!(" ({m})")).unwrap_or_default())),
                ..vacio("fallo")
            })
        }
        _ => Err(error_de_estado(status, body)),
    }
}

fn error_de_estado(status: u16, body: &str) -> CommandError {
    match status {
        401 => CommandError::permanent("AUTH_FAILED", "Tu sesión expiró. Vuelve a iniciar sesión"),
        403 => CommandError::permanent("AUTH_FAILED", "Solo el administrador puede gestionar las cámaras"),
        404 => CommandError::permanent("NOT_FOUND", "La cámara no existe"),
        429 => CommandError::transient("RATE_LIMITED", "Demasiadas pruebas seguidas: espera un minuto").with_retry_after(30_000),
        _ => CommandError::transient("COMMUNICATION_ERROR", format!("Las cámaras respondieron {status}: {}", body.chars().take(200).collect::<String>())).with_retry_after(3000),
    }
}

async fn access_token(manager: &Arc<dyn SessionManager>) -> Result<String, CommandError> {
    manager
        .get_access_token()
        .await
        .map_err(|e| CommandError::internal("SESSION_ERROR", e.to_string()))?
        .ok_or_else(|| CommandError::permanent("AUTH_REQUIRED", "Debes iniciar sesión"))
}

fn error_de_red(ctx: &str, e: reqwest::Error) -> CommandError {
    let err = if e.is_timeout() {
        CommandError::transient("OPERATION_TIMEOUT", format!("Timeout contactando las cámaras: {e}"))
    } else {
        CommandError::transient("COMMUNICATION_ERROR", format!("Error contactando las cámaras: {e}"))
    };
    err.with_retry_after(3000).with_context(ctx, "broker")
}

/// Manda una petición al broker y devuelve (estado HTTP, cuerpo).
async fn enviar(
    ctx: &str,
    metodo: reqwest::Method,
    ruta: &str,
    cuerpo: Option<serde_json::Value>,
    manager: &Arc<dyn SessionManager>,
) -> Result<(u16, String), CommandError> {
    let token = access_token(manager).await?;
    // El cliente HTTP compartido corta a los 8 s; aquí hay que esperar la prueba de conexión y el cambio en Shinobi/MediaMTX
    // (probar el flujo de alta resolución tarda ~13 s). Si se cortara antes, la app mostraría un error de algo que el servidor sí aplicó.
    let mut peticion = HTTP_CLIENT.request(metodo, format!("{BROKER_HOST}{ruta}")).bearer_auth(&token).timeout(TIEMPO_MAXIMO_ADMIN);
    if let Some(c) = cuerpo {
        peticion = peticion.json(&c);
    }
    let respuesta = peticion.send().await.map_err(|e| error_de_red(ctx, e))?;
    let status = respuesta.status().as_u16();
    let texto = respuesta.text().await.map_err(|e| error_de_red(ctx, e))?;
    Ok((status, texto))
}

/// Cuerpo para el broker: solo los campos presentes; una clave vacía se trata como «sin cambios».
fn cuerpo_de(entrada: &CamaraEntrada) -> serde_json::Value {
    let mut v = serde_json::to_value(entrada).unwrap_or(serde_json::Value::Null);
    if let Some(o) = v.as_object_mut() {
        o.retain(|_, x| !x.is_null());
        if o.get("password").and_then(|p| p.as_str()).map(str::is_empty).unwrap_or(false) {
            o.remove("password");
        }
    }
    v
}

/// Lista las cámaras con su estado. Solo `admin_lab`.
#[tauri::command]
pub async fn camaras_listar(manager: tauri::State<'_, Arc<dyn SessionManager>>) -> Result<CamarasAdminLista, CommandError> {
    let ctx = "camaras_listar";
    let (status, texto) = enviar(ctx, reqwest::Method::GET, "/nvr/camaras", None, manager.inner()).await?;
    if status != 200 {
        return Err(error_de_estado(status, &texto).with_context(ctx, "broker"));
    }
    serde_json::from_str(&texto).map_err(|e| CommandError::permanent("INVALID_DATA", format!("Respuesta inválida de las cámaras: {e}")).with_context(ctx, "broker"))
}

/// «Probar conexión»: comprueba video, clave, modelo y PTZ SIN guardar nada. `id`: probar una cámara existente usando su
/// clave guardada (si no se escribe una nueva).
#[tauri::command]
pub async fn camaras_probar(
    entrada: CamaraEntrada,
    id: Option<String>,
    manager: tauri::State<'_, Arc<dyn SessionManager>>,
) -> Result<ResultadoPrueba, CommandError> {
    let ctx = "camaras_probar";
    let mut cuerpo = cuerpo_de(&entrada);
    if let (Some(o), Some(id)) = (cuerpo.as_object_mut(), id) {
        o.insert("id".into(), serde_json::Value::String(id));
    }
    let (status, texto) = enviar(ctx, reqwest::Method::POST, "/nvr/camaras/probar", Some(cuerpo), manager.inner()).await?;
    match status {
        200 => {
            let r: RespuestaPrueba = serde_json::from_str(&texto)
                .map_err(|e| CommandError::permanent("INVALID_DATA", format!("Respuesta inválida de las cámaras: {e}")).with_context(ctx, "broker"))?;
            Ok(ResultadoPrueba { resultado: "ok".into(), prueba: Some(r.prueba), errores: None })
        }
        400 => {
            let e: RespuestaError = serde_json::from_str(&texto).unwrap_or(RespuestaError { errores: None, prueba: None, message: None, paso: None });
            Ok(ResultadoPrueba { resultado: "invalido".into(), prueba: None, errores: e.errores })
        }
        _ => Err(error_de_estado(status, &texto).with_context(ctx, "broker")),
    }
}

#[derive(Serialize, Deserialize, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ResultadoPrueba {
    /// "ok" | "invalido"
    pub resultado: String,
    pub prueba: Option<PruebaCamara>,
    pub errores: Option<HashMap<String, String>>,
}

/// Crea una cámara (prueba la conexión antes, salvo `forzar`).
#[tauri::command]
pub async fn camaras_crear(
    entrada: CamaraEntrada,
    manager: tauri::State<'_, Arc<dyn SessionManager>>,
) -> Result<ResultadoGuardado, CommandError> {
    let ctx = "camaras_crear";
    let (status, texto) = enviar(ctx, reqwest::Method::POST, "/nvr/camaras", Some(cuerpo_de(&entrada)), manager.inner()).await?;
    interpretar_guardado(status, &texto).map_err(|e| e.with_context(ctx, "broker"))
}

/// Edita una cámara. Solo se mandan los campos que cambian; sin clave = se conserva la actual.
#[tauri::command]
pub async fn camaras_actualizar(
    id: String,
    entrada: CamaraEntrada,
    manager: tauri::State<'_, Arc<dyn SessionManager>>,
) -> Result<ResultadoGuardado, CommandError> {
    let ctx = "camaras_actualizar";
    let ruta = format!("/nvr/camaras/{}", urlencode(&id));
    let (status, texto) = enviar(ctx, reqwest::Method::PUT, &ruta, Some(cuerpo_de(&entrada)), manager.inner()).await?;
    interpretar_guardado(status, &texto).map_err(|e| e.with_context(ctx, &id))
}

/// Elimina una cámara de Shinobi, MediaMTX y el registro.
#[tauri::command]
pub async fn camaras_eliminar(id: String, manager: tauri::State<'_, Arc<dyn SessionManager>>) -> Result<(), CommandError> {
    let ctx = "camaras_eliminar";
    let ruta = format!("/nvr/camaras/{}", urlencode(&id));
    let (status, texto) = enviar(ctx, reqwest::Method::DELETE, &ruta, None, manager.inner()).await?;
    match status {
        200 => Ok(()),
        502 => Err(CommandError::transient("COMMUNICATION_ERROR", "No se pudo eliminar; se deshizo el cambio").with_context(ctx, &id)),
        _ => Err(error_de_estado(status, &texto).with_context(ctx, &id)),
    }
}

/// Codifica un segmento de ruta (los ids de cámara son «CamaraNN», pero no se confía en eso).
fn urlencode(s: &str) -> String {
    s.bytes()
        .map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    // Respuestas con la forma real del broker (infra/broker-camaras/admin.js).

    #[test]
    fn lee_la_lista_sin_claves() {
        let j = r#"{"camaras":[{"id":"Camara05","nombre":"Camara04","host":"172.16.34.13","puerto":554,"usuario":"admin","rtspPath":"/h264Preview_01_sub","ptz":true,"habilitada":true,"ruta":"cam04","creada":"x","modificada":"x","tienePassword":true,"estado":"active","video":"transmitiendo"}]}"#;
        let l: CamarasAdminLista = serde_json::from_str(j).unwrap();
        assert_eq!(l.camaras[0].ruta, "cam04");
        assert!(l.camaras[0].tiene_password);
        assert_eq!(l.camaras[0].estado.as_deref(), Some("active"));
    }

    #[test]
    fn alta_ok() {
        let j = r#"{"camara":{"id":"Camara06","nombre":"Aula 2","host":"172.16.34.20","puerto":554,"usuario":"admin","rtspPath":"/h264Preview_01_sub","ptz":true,"habilitada":true,"ruta":"cam05","tienePassword":true},"prueba":{"ok":true,"rtsp":{"ok":true,"video":{"codec":"h264","ancho":896,"alto":512}},"api":{"ok":true,"modelo":"E1 Pro"},"ptz":true}}"#;
        let r = interpretar_guardado(201, j).unwrap();
        assert_eq!(r.resultado, "ok");
        assert_eq!(r.camara.unwrap().id, "Camara06");
        assert_eq!(r.prueba.unwrap().api.modelo.as_deref(), Some("E1 Pro"));
    }

    #[test]
    fn datos_invalidos_y_duplicada_traen_errores_por_campo() {
        let inv = interpretar_guardado(400, r#"{"error":"datos_invalidos","errores":{"host":"debe ser una IP de red privada","puerto":"puerto entre 1 y 65535"}}"#).unwrap();
        assert_eq!(inv.resultado, "invalido");
        assert_eq!(inv.errores.as_ref().unwrap().len(), 2);
        let dup = interpretar_guardado(409, r#"{"error":"duplicada","errores":{"host":"ya existe otra cámara con esa IP y puerto"}}"#).unwrap();
        assert_eq!(dup.resultado, "duplicada");
    }

    #[test]
    fn prueba_fallida_trae_el_motivo() {
        let r = interpretar_guardado(422, r#"{"error":"prueba_fallida","prueba":{"ok":false,"rtsp":{"ok":false,"codigo":"clave","mensaje":"La cámara rechazó el usuario o la contraseña (401)"},"api":{"ok":false},"ptz":null}}"#).unwrap();
        assert_eq!(r.resultado, "prueba_fallida");
        let p = r.prueba.unwrap();
        assert_eq!(p.rtsp.codigo.as_deref(), Some("clave"));
        assert_eq!(p.ptz, None);
    }

    #[test]
    fn fallo_al_aplicar_dice_que_se_deshizo() {
        let r = interpretar_guardado(502, r#"{"error":"aplicar_fallo","paso":"Shinobi","message":"Shinobi no aceptó el monitor"}"#).unwrap();
        assert_eq!(r.resultado, "fallo");
        let m = r.mensaje.unwrap();
        assert!(m.contains("Shinobi") && m.contains("se deshizo"), "{m}");
    }

    #[test]
    fn los_errores_de_sesion_y_permiso_son_errores_del_comando() {
        assert!(interpretar_guardado(401, "{}").is_err());
        assert!(interpretar_guardado(403, "{}").is_err());
        assert!(interpretar_guardado(404, "{}").is_err());
    }

    #[test]
    fn el_cuerpo_omite_lo_vacio_y_la_clave_vacia_significa_sin_cambios() {
        let e = CamaraEntrada { nombre: Some("A".into()), password: Some(String::new()), ptz: Some(true), ..Default::default() };
        let v = cuerpo_de(&e);
        assert_eq!(v["nombre"], "A");
        assert_eq!(v["ptz"], true);
        assert!(v.get("password").is_none() && v.get("host").is_none());
        let con = cuerpo_de(&CamaraEntrada { password: Some("Nueva#1".into()), ..Default::default() });
        assert_eq!(con["password"], "Nueva#1");
    }

    #[test]
    fn el_id_se_codifica_en_la_ruta() {
        assert_eq!(urlencode("Camara05"), "Camara05");
        assert_eq!(urlencode("a/b c"), "a%2Fb%20c");
    }
}
