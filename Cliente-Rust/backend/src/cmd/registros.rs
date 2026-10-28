//! cmd/registros — el registro de la terminal de cada intento de práctica de Linux, guardado en el servidor (Pi4,
//! `infra/broker-sesiones/registros.js`) para que el personal y los docentes lo revisen: antes solo quedaba en el equipo
//! donde se hizo la práctica.
//!
//! Un intento es una práctica abierta en una pestaña. La interfaz lo manda al aprobarla, al cerrarla sin terminar y al cerrar
//! la app (`registros_enviar_intento`), y cada 2 minutos deja una copia en este equipo (`registros_guardar_copia`) por si la
//! app se cuelga o se apaga el computador. Hay UNA copia por intento (se sobrescribe) y se borra cuando el intento llega al
//! servidor; lo que no salió se manda al iniciar sesión (`registros_enviar_pendientes`), solo con la cuenta de la persona que
//! lo hizo (el servidor decide la carpeta por el token: con otra cuenta quedaría en la carpeta equivocada).
//!
//! Al cerrar la ventana principal, `detener_cierre` la retiene y avisa a la interfaz (`app:cerrando`) para que mande los
//! intentos abiertos; la interfaz la cierra con `app_cerrar`, y si no lo hace en `ESPERA_CIERRE`, se cierra igual.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};
use ts_rs::TS;

use crate::cmd::broker_client::{access_token, error_de_red, get_text, BROKER_HOST, HTTP_CLIENT};
use crate::cmd::moodle_cursos::{registro_comprimido, RegistroSesion};
use crate::cmd::protocol::CommandError;
use crate::session_manager::SessionManager;

const QUE: &str = "el registro de prácticas";
/// Lo mismo que guarda el servidor: una copia que no salió en 20 días ya no le sirve a nadie.
const RETENCION_DIAS: i64 = 20;
/// El nginx de AWS no deja pasar cuerpos de más de 1 MB: el registro comprimido (en base64) debe quedar bastante por debajo.
const MAX_GZIP_BASE64: usize = 900_000;
const AVISO_RECORTE: &str = "[LaboRemoto: se omitió el principio de este registro porque era demasiado grande]\r\n";
/// La interfaz tarda hasta ~2 s en pedir los registros y espera 5 s el envío (useRegistrosIntentos): esto le sobra.
const ESPERA_CIERRE: Duration = Duration::from_secs(10);
pub const EVENTO_CERRANDO: &str = "app:cerrando";

static CIERRE_PEDIDO: AtomicBool = AtomicBool::new(false);
static CIERRE_LISTO: AtomicBool = AtomicBool::new(false);

/// Un intento tal como lo arma la interfaz: la práctica, cómo terminó y el buffer crudo de su terminal.
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IntentoPractica {
    /// Id del intento (lo genera la interfaz al abrir la práctica): el servidor reemplaza el archivo de ese intento.
    pub id: String,
    pub practica: String,
    pub practica_nombre: Option<String>,
    /// "terminada" (aprobada) | "sin_terminar" | "app_cerrada"
    pub estado: String,
    /// Cuándo se abrió la práctica (ISO 8601); el nombre del archivo lleva esta hora.
    pub inicio: String,
    /// 0 a 100, si la práctica ya se validó.
    pub nota: Option<f64>,
    pub registro: RegistroSesion,
}

/// Un intento tal como lo devuelve el servidor (lista de «Prácticas de estudiantes»).
#[derive(Serialize, Deserialize, Clone, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct RegistroIntento {
    pub id: String,
    /// Carpeta de la persona en el servidor (su usuario); con `id`, identifica el archivo.
    pub carpeta: String,
    pub usuario: String,
    pub nombre: Option<String>,
    pub practica: String,
    pub practica_nombre: Option<String>,
    /// "terminada" | "sin_terminar" | "app_cerrada"
    pub estado: String,
    pub nota: Option<f64>,
    pub inicio: String,
    pub fin: String,
    #[ts(type = "number")]
    pub bytes: u64,
    /// Nombre del archivo en el servidor (estudiante, práctica y hora).
    pub archivo: String,
}

#[derive(Serialize, Deserialize, Debug, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ListaRegistros {
    pub generado: String,
    pub dias: u32,
    pub retencion_dias: u32,
    pub registros: Vec<RegistroIntento>,
}

/// Lo que se guarda en el equipo mientras el intento no llega: el cuerpo ya listo para mandar y de quién es.
#[derive(Serialize, Deserialize)]
struct Pendiente {
    usuario: String,
    guardado: String,
    cuerpo: serde_json::Value,
}

/// Cómo falló un envío: lo transitorio se vuelve a intentar; lo permanente (el servidor dice que no sirve) se descarta.
#[derive(Debug, PartialEq)]
enum Falla {
    Transitoria(String),
    Permanente(String),
}

fn id_valido(id: &str) -> bool {
    (8..=64).contains(&id.len()) && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn practica_valida(p: &str) -> bool {
    !p.is_empty() && p.len() <= 64 && p.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '.' | '_' | '-'))
}

fn validar(i: &IntentoPractica) -> Result<(), CommandError> {
    let error = |m: &str| Err(CommandError::permanent("VALIDATION_FAILED", m.to_string()).with_context("registros", &i.id));
    if !id_valido(&i.id) { return error("Id de intento inválido"); }
    if !practica_valida(&i.practica) { return error("Id de práctica inválido"); }
    if !matches!(i.estado.as_str(), "terminada" | "sin_terminar" | "app_cerrada") { return error("Estado de intento inválido"); }
    Ok(())
}

/// El registro comprimido, cabiendo en lo que deja pasar el servidor: si no cabe, se descarta la mitad más vieja de la
/// terminal (lo último que hizo el estudiante es lo que más importa) hasta que quepa, y se avisa al principio.
fn registro_que_cabe(r: &RegistroSesion) -> Result<String, CommandError> {
    let mut gz = registro_comprimido(r)?;
    let mut recortado = r.clone();
    while gz.len() > MAX_GZIP_BASE64 && recortado.raw_content.len() > AVISO_RECORTE.len() * 2 {
        let crudo = recortado.raw_content.strip_prefix(AVISO_RECORTE).unwrap_or(&recortado.raw_content);
        let mut corte = crudo.len() / 2;
        while !crudo.is_char_boundary(corte) {
            corte += 1;
        }
        recortado.raw_content = format!("{AVISO_RECORTE}{}", &crudo[corte..]);
        gz = registro_comprimido(&recortado)?;
    }
    Ok(gz)
}

/// El cuerpo para el broker: el HTML completo del registro (el mismo formato del log guardado), comprimido.
fn cuerpo_de(i: &IntentoPractica) -> Result<serde_json::Value, CommandError> {
    Ok(serde_json::json!({
        "id": i.id,
        "practica": i.practica,
        "practicaNombre": i.practica_nombre,
        "estado": i.estado,
        "inicio": i.inicio,
        "fin": i.registro.end_time,
        "nota": i.nota.filter(|n| n.is_finite() && (0.0..=100.0).contains(n)),
        "gzipBase64": registro_que_cabe(&i.registro)?,
    }))
}

/// Qué hacer según la respuesta del broker. 401 es transitorio: el token venció y con uno nuevo sí entra.
fn falla_de(status: u16, texto: &str) -> Falla {
    let detalle = format!("{QUE} respondió {status}: {}", texto.chars().take(200).collect::<String>());
    match status {
        400 | 409 | 413 | 507 => Falla::Permanente(detalle),
        _ => Falla::Transitoria(detalle),
    }
}

async fn enviar(cuerpo: &serde_json::Value, manager: &Arc<dyn SessionManager>) -> Result<(), Falla> {
    let token = access_token(manager).await.map_err(|e| Falla::Transitoria(e.message))?;
    let respuesta = HTTP_CLIENT
        .post(format!("{BROKER_HOST}/nvr/registros"))
        .bearer_auth(&token)
        .json(cuerpo)
        .send()
        .await
        .map_err(|e| Falla::Transitoria(error_de_red("registros", QUE, e).message))?;
    let status = respuesta.status();
    if status.is_success() {
        return Ok(());
    }
    let texto = respuesta.text().await.unwrap_or_default();
    Err(falla_de(status.as_u16(), &texto))
}

async fn usuario_actual(manager: &Arc<dyn SessionManager>) -> Result<String, CommandError> {
    manager
        .session_info()
        .await
        .map_err(|e| CommandError::internal("SESSION_ERROR", e.to_string()))?
        .map(|s| s.preferred_username)
        .ok_or_else(|| CommandError::permanent("AUTH_REQUIRED", "Debes iniciar sesión"))
}

fn carpeta_pendientes(app: &tauri::AppHandle) -> Result<PathBuf, CommandError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| CommandError::internal("CONFIG_MISSING", format!("No se pudo resolver app_data_dir: {e}")))?
        .join("registros-pendientes");
    std::fs::create_dir_all(&dir).map_err(|e| CommandError::transient("IO_ERROR", format!("No se pudo crear la carpeta de pendientes: {e}")))?;
    Ok(dir)
}

/// El archivo de un intento (el id ya se validó: solo letras, números y guiones).
fn ruta_pendiente(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.json"))
}

/// Escribe la copia de un intento encima de la anterior, sin dejarla a medias.
fn guardar_pendiente(dir: &Path, id: &str, p: &Pendiente) -> Result<(), CommandError> {
    let ruta = ruta_pendiente(dir, id);
    let tmp = ruta.with_extension("json.tmp");
    let texto = serde_json::to_vec(p).map_err(|e| CommandError::internal("SERIALIZATION_ERROR", e.to_string()))?;
    std::fs::write(&tmp, texto)
        .and_then(|_| std::fs::rename(&tmp, &ruta))
        .map_err(|e| CommandError::transient("IO_ERROR", format!("No se pudo guardar la copia del registro: {e}")))
}

fn ahora_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// Cuerpo listo para mandar (comprimir un registro grande no debe bloquear el runtime async).
async fn preparar(intento: IntentoPractica) -> Result<serde_json::Value, CommandError> {
    validar(&intento)?;
    tokio::task::spawn_blocking(move || cuerpo_de(&intento))
        .await
        .map_err(|e| CommandError::internal("TASK_JOIN_ERROR", e.to_string()))?
}

/// Deja (o actualiza) la copia del intento en este equipo, sin mandarla. La interfaz la llama cada 2 minutos.
#[tauri::command]
pub async fn registros_guardar_copia(
    intento: IntentoPractica,
    app: tauri::AppHandle,
    manager: tauri::State<'_, Arc<dyn SessionManager>>,
) -> Result<(), CommandError> {
    let usuario = usuario_actual(manager.inner()).await?;
    let id = intento.id.clone();
    let cuerpo = preparar(intento).await?;
    let dir = carpeta_pendientes(&app)?;
    guardar_pendiente(&dir, &id, &Pendiente { usuario, guardado: ahora_iso(), cuerpo })
}

/// Manda el intento al servidor. Devuelve "enviado", "pendiente" (no salió: queda la copia para después) o "rechazado"
/// (el servidor dijo que no sirve, p. ej. demasiado grande: se descarta).
#[tauri::command]
pub async fn registros_enviar_intento(
    intento: IntentoPractica,
    app: tauri::AppHandle,
    manager: tauri::State<'_, Arc<dyn SessionManager>>,
) -> Result<String, CommandError> {
    let usuario = usuario_actual(manager.inner()).await?;
    let id = intento.id.clone();
    let cuerpo = preparar(intento).await?;
    let dir = carpeta_pendientes(&app)?;
    match enviar(&cuerpo, manager.inner()).await {
        Ok(()) => {
            let _ = std::fs::remove_file(ruta_pendiente(&dir, &id));
            Ok("enviado".into())
        }
        Err(Falla::Permanente(motivo)) => {
            tracing::warn!("[registros] el servidor rechazó el intento {id}: {motivo}");
            let _ = std::fs::remove_file(ruta_pendiente(&dir, &id));
            Ok("rechazado".into())
        }
        Err(Falla::Transitoria(motivo)) => {
            tracing::info!("[registros] el intento {id} queda pendiente: {motivo}");
            guardar_pendiente(&dir, &id, &Pendiente { usuario, guardado: ahora_iso(), cuerpo })?;
            Ok("pendiente".into())
        }
    }
}

/// Manda las copias que quedaron en este equipo y son de la persona con sesión iniciada. Las de más de 20 días se borran
/// (de cualquiera). Devuelve cuántas llegaron.
#[tauri::command]
pub async fn registros_enviar_pendientes(
    app: tauri::AppHandle,
    manager: tauri::State<'_, Arc<dyn SessionManager>>,
) -> Result<u32, CommandError> {
    let usuario = usuario_actual(manager.inner()).await?;
    let dir = carpeta_pendientes(&app)?;
    let limite = chrono::Utc::now() - chrono::Duration::days(RETENCION_DIAS);
    let mut enviados = 0;
    let entradas = std::fs::read_dir(&dir).map_err(|e| CommandError::transient("IO_ERROR", e.to_string()))?;
    for ruta in entradas.flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|x| x == "json")) {
        let Some(p) = std::fs::read(&ruta).ok().and_then(|b| serde_json::from_slice::<Pendiente>(&b).ok()) else {
            let _ = std::fs::remove_file(&ruta); // dañada: no se puede mandar
            continue;
        };
        let vencida = chrono::DateTime::parse_from_rfc3339(&p.guardado).map(|t| t < limite).unwrap_or(true);
        if vencida {
            let _ = std::fs::remove_file(&ruta);
            continue;
        }
        if p.usuario != usuario {
            continue;
        }
        match enviar(&p.cuerpo, manager.inner()).await {
            Ok(()) => {
                enviados += 1;
                let _ = std::fs::remove_file(&ruta);
            }
            Err(Falla::Permanente(motivo)) => {
                tracing::warn!("[registros] el servidor rechazó una copia pendiente: {motivo}");
                let _ = std::fs::remove_file(&ruta);
            }
            Err(Falla::Transitoria(_)) => break, // sin red: las demás tampoco van a salir ahora
        }
    }
    Ok(enviados)
}

fn error_de_lectura(status: u16, texto: &str) -> CommandError {
    match status {
        401 => CommandError::permanent("AUTH_FAILED", "Tu sesión expiró. Vuelve a iniciar sesión"),
        403 => CommandError::permanent("AUTH_FAILED", "No tienes permiso para ver los registros de los estudiantes"),
        404 => CommandError::permanent("NOT_FOUND", "Ese registro ya no está en el servidor"),
        _ => CommandError::transient("COMMUNICATION_ERROR", format!("{QUE} respondió {status}: {}", texto.chars().take(200).collect::<String>()))
            .with_retry_after(3000),
    }
}

/// Los intentos de los últimos `dias` días (máximo 20). Solo admin_lab, semillerista y docente (lo exige el servidor).
#[tauri::command]
pub async fn registros_listar(dias: Option<u32>, manager: tauri::State<'_, Arc<dyn SessionManager>>) -> Result<ListaRegistros, CommandError> {
    let ctx = "registros_listar";
    let dias = dias.unwrap_or(RETENCION_DIAS as u32).clamp(1, RETENCION_DIAS as u32);
    let (status, texto) = get_text(ctx, QUE, &format!("/nvr/registros?dias={dias}"), manager.inner()).await?;
    if !status.is_success() {
        return Err(error_de_lectura(status.as_u16(), &texto).with_context(ctx, "broker"));
    }
    serde_json::from_str(&texto)
        .map_err(|e| CommandError::permanent("INVALID_DATA", format!("Respuesta inválida del broker: {e}")).with_context(ctx, "broker"))
}

/// El HTML de un intento, para verlo o guardarlo.
#[tauri::command]
pub async fn registros_archivo(carpeta: String, id: String, manager: tauri::State<'_, Arc<dyn SessionManager>>) -> Result<String, CommandError> {
    let ctx = "registros_archivo";
    let carpeta_ok = !carpeta.is_empty()
        && carpeta.len() <= 64
        && carpeta.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '.' | '_' | '-'));
    if !carpeta_ok || !id_valido(&id) {
        return Err(CommandError::permanent("VALIDATION_FAILED", "Registro inválido").with_context(ctx, &id));
    }
    let (status, texto) = get_text(ctx, QUE, &format!("/nvr/registros/archivo?carpeta={carpeta}&id={id}"), manager.inner()).await?;
    if !status.is_success() {
        return Err(error_de_lectura(status.as_u16(), &texto).with_context(ctx, "broker"));
    }
    Ok(texto)
}

/// Llamada desde `on_window_event` al pedir cerrar una ventana: `true` si hay que retener el cierre (la ventana principal,
/// la primera vez). Avisa a la interfaz y, si no cierra sola en `ESPERA_CIERRE`, la cierra igual: nadie queda atrapado.
pub fn detener_cierre(ventana: &tauri::Window) -> bool {
    if ventana.label() != "main" || CIERRE_LISTO.load(Ordering::SeqCst) {
        return false;
    }
    if !CIERRE_PEDIDO.swap(true, Ordering::SeqCst) {
        let _ = ventana.emit(EVENTO_CERRANDO, ());
        let v = ventana.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(ESPERA_CIERRE).await;
            if !CIERRE_LISTO.swap(true, Ordering::SeqCst) {
                tracing::warn!("[registros] la interfaz no cerró a tiempo: se cierra la ventana igual");
                let _ = v.destroy();
            }
        });
    }
    true
}

/// La interfaz ya mandó (o guardó) los intentos abiertos: cierra la ventana de verdad.
#[tauri::command]
pub fn app_cerrar(window: tauri::Window) -> Result<(), CommandError> {
    CIERRE_LISTO.store(true, Ordering::SeqCst);
    window.destroy().map_err(|e| CommandError::internal("WINDOW_ERROR", e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn intento(id: &str, practica: &str, estado: &str) -> IntentoPractica {
        IntentoPractica {
            id: id.into(), practica: practica.into(), practica_nombre: Some("Primeros pasos".into()), estado: estado.into(),
            inicio: "2026-10-28T19:00:00Z".into(), nota: Some(150.0),
            registro: RegistroSesion {
                session_id: "s1".into(), user: "ana".into(), host: "pi".into(), port: 22,
                start_time: "2026-10-28T19:00:00Z".into(), end_time: "2026-10-28T19:20:00Z".into(),
                raw_content: "ana@pi:~ $ pwd\r\n/home/ana\r\n".into(),
            },
        }
    }

    #[test]
    fn el_cuerpo_lleva_el_registro_comprimido_y_descarta_una_nota_fuera_de_rango() {
        let c = cuerpo_de(&intento("intento-0001", "linux-m1", "terminada")).unwrap();
        assert_eq!(c["fin"], "2026-10-28T19:20:00Z");
        assert_eq!(c["practicaNombre"], "Primeros pasos");
        assert!(c["nota"].is_null());
        assert!(c["gzipBase64"].as_str().is_some_and(|s| !s.is_empty()));
    }

    #[test]
    fn un_registro_enorme_se_recorta_por_el_principio_hasta_caber_y_lo_avisa() {
        use base64::Engine;
        use std::io::Read;
        // texto que casi no se comprime: ~3 MB de caracteres pseudoaleatorios, con una marca al final
        let mut x: u64 = 7;
        let mut crudo: String = (0..3_000_000).map(|_| { x = x.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407); (b'!' + (x >> 58) as u8 % 90) as char }).collect();
        crudo.push_str("ULTIMO-COMANDO");
        let mut i = intento("intento-0001", "linux-m1", "terminada");
        i.registro.raw_content = crudo;
        let gz = registro_que_cabe(&i.registro).unwrap();
        assert!(gz.len() <= MAX_GZIP_BASE64);
        let mut html = String::new();
        flate2::read::GzDecoder::new(&base64::engine::general_purpose::STANDARD.decode(gz).unwrap()[..]).read_to_string(&mut html).unwrap();
        assert!(html.contains("ULTIMO-COMANDO"), "lo más reciente se conserva");
        assert!(html.contains("se omitió el principio"));
        // uno normal no se toca
        let normal = intento("intento-0002", "linux-m1", "terminada");
        assert_eq!(registro_que_cabe(&normal.registro).unwrap(), registro_comprimido(&normal.registro).unwrap());
    }

    #[test]
    fn valida_id_practica_y_estado_antes_de_tocar_el_disco() {
        assert!(validar(&intento("intento-0001", "linux-m1", "sin_terminar")).is_ok());
        assert!(validar(&intento("../../x", "linux-m1", "terminada")).is_err());
        assert!(validar(&intento("corto", "linux-m1", "terminada")).is_err());
        assert!(validar(&intento("intento-0001", "Linux M1", "terminada")).is_err());
        assert!(validar(&intento("intento-0001", "linux-m1", "borrada")).is_err());
    }

    #[test]
    fn lo_que_el_servidor_rechaza_no_se_reintenta_y_lo_demas_si() {
        assert!(matches!(falla_de(413, ""), Falla::Permanente(_)));
        assert!(matches!(falla_de(400, "{}"), Falla::Permanente(_)));
        assert!(matches!(falla_de(401, ""), Falla::Transitoria(_)));
        assert!(matches!(falla_de(503, ""), Falla::Transitoria(_)));
    }

    #[test]
    fn la_copia_de_un_intento_se_sobrescribe_en_vez_de_acumularse() {
        let dir = std::env::temp_dir().join(format!("registros-pendientes-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        for vez in 0..3 {
            let p = Pendiente { usuario: "ana".into(), guardado: ahora_iso(), cuerpo: serde_json::json!({ "vez": vez }) };
            guardar_pendiente(&dir, "intento-0001", &p).unwrap();
        }
        let archivos: Vec<_> = std::fs::read_dir(&dir).unwrap().flatten().collect();
        assert_eq!(archivos.len(), 1);
        let p: Pendiente = serde_json::from_slice(&std::fs::read(archivos[0].path()).unwrap()).unwrap();
        assert_eq!(p.cuerpo["vez"], 2);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
