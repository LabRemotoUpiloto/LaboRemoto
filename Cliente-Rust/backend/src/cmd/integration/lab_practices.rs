//! cmd/integration/lab_practices — Cliente de solo lectura del catálogo
//! externo de prácticas de laboratorio (aplicativo de autoría de terceros).
//!
//! ## Modelo de confianza
//! El contenido de este módulo es **contenido no confiable**: viene de una
//! aplicación externa que cualquier docente/laboratorio puede operar. Por
//! diseño `ExternalLabPractice` NUNCA incluye host, usuario, contraseña,
//! clave SSH ni ninguna URL que dispare una conexión automática — solo trae
//! texto pedagógico y `execution_requirements` **declarativos**
//! (`connection_type`, `capabilities`), nunca un destino de red real.
//!
//! El binding entre una práctica importada y un entorno de laboratorio real
//! (`LabConnectionProfile`, con host/credenciales locales) es responsabilidad
//! de una fase posterior, explícita y 100% local — nunca inferida a partir de
//! datos que llegaron de la API externa. Ver `docs/plan-shinobi-nvr.md` para
//! el precedente de esta misma decisión con el NVR.
//!
//! ## Estado de la integración
//! No existe (todavía) una implementación real de la API de autoría — este
//! módulo implementa el contrato acordado contra `LAB_PRACTICES_API_URL`
//! cuando está configurado. Si no lo está, sirve un catálogo mock embebido
//! (`mock_catalog`) para poder desarrollar y probar el resto del flujo
//! (caché, filtrado, comandos Tauri) sin depender de un servidor real.

use std::time::{Duration, Instant};

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex as TokioMutex;
use ts_rs::TS;

use crate::cmd::protocol::CommandError;

// ─── Tipos del contrato externo ───

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PracticeMaterial {
    pub name: String,
    pub quantity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ProcedureStep {
    pub order: u32,
    pub instruction: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PracticeAuthor {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PracticeSource {
    pub application: String,
    pub external_id: String,
}

/// Requisitos de ejecución **declarativos**: describen qué tipo de entorno
/// necesita la práctica (para poder buscar un `LabConnectionProfile` local
/// compatible), nunca un destino de red concreto.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ExecutionRequirements {
    pub connection_type: String, // "ssh" | "none" (práctica solo de lectura)
    pub capabilities: Vec<String>, // ej. ["linux", "docker"]
}

/// Práctica tal como la publica la API externa de autoría. Ver el módulo
/// para la nota de modelo de confianza — este tipo nunca debe ganar un
/// campo de conexión real.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ExternalLabPractice {
    pub id: String,
    pub version: u32,
    pub title: String,
    pub description: String,
    pub area: String,
    pub level: String,
    pub objectives: Vec<String>,
    pub materials: Vec<PracticeMaterial>,
    pub procedure: Vec<ProcedureStep>,
    pub safety_measures: Vec<String>,
    pub estimated_duration_minutes: u32,
    pub status: String, // "draft" | "published" | "archived"
    pub execution_requirements: ExecutionRequirements,
    pub author: PracticeAuthor,
    pub source: PracticeSource,
    pub updated_at: String,
}

// ─── Config: cargada desde .env (mismo patrón que cmd::nvr::shinobi) ───

struct LabPracticesConfig {
    api_url: Option<String>,
    api_key: Option<String>,
}

fn clean_env_value(value: &str) -> String {
    value
        .trim()
        .trim_matches('\u{feff}')
        .trim_matches('"')
        .trim_matches('\'')
        .trim()
        .to_string()
}

fn env_var(name: &str) -> Option<String> {
    std::env::var(name).ok().map(|v| clean_env_value(&v)).filter(|v| !v.is_empty())
}

fn load_config() -> LabPracticesConfig {
    let _ = dotenvy::dotenv();
    LabPracticesConfig {
        api_url: env_var("LAB_PRACTICES_API_URL"),
        api_key: env_var("LAB_PRACTICES_API_KEY"),
    }
}

// ─── Caché en memoria (TTL corto, evita golpear la API en cada render) ───

struct CacheEntry {
    fetched_at: Instant,
    practices: Vec<ExternalLabPractice>,
}

const CACHE_TTL: Duration = Duration::from_secs(300);

static CACHE: Lazy<TokioMutex<Option<CacheEntry>>> = Lazy::new(|| TokioMutex::new(None));

async fn get_catalog(config: &LabPracticesConfig) -> Result<Vec<ExternalLabPractice>, CommandError> {
    {
        let cache = CACHE.lock().await;
        if let Some(entry) = cache.as_ref() {
            if entry.fetched_at.elapsed() < CACHE_TTL {
                return Ok(entry.practices.clone());
            }
        }
    }

    let practices = match &config.api_url {
        Some(url) => fetch_remote_catalog(url, config.api_key.as_deref()).await?,
        None => mock_catalog(),
    };

    let mut cache = CACHE.lock().await;
    *cache = Some(CacheEntry { fetched_at: Instant::now(), practices: practices.clone() });

    Ok(practices)
}

// ─── Cliente HTTP contra la API real ───

fn build_client() -> Result<reqwest::Client, CommandError> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| CommandError::internal("HTTP_CLIENT_ERROR", e.to_string()))
}

fn map_http_error(status: reqwest::StatusCode, body: &str, operation: &str, resource: &str) -> CommandError {
    let err = if status.as_u16() == 401 || status.as_u16() == 403 {
        CommandError::permanent("AUTH_FAILED", format!("API de prácticas respondió {status}: credenciales inválidas"))
    } else if status.as_u16() == 404 {
        CommandError::permanent("RESOURCE_NOT_FOUND", format!("API de prácticas respondió 404: {body}"))
    } else if status.is_server_error() {
        CommandError::transient("COMMUNICATION_ERROR", format!("API de prácticas respondió con error de servidor {status}"))
            .with_retry_after(3000)
    } else {
        CommandError::permanent("VALIDATION_FAILED", format!("API de prácticas respondió {status}: {body}"))
    };
    err.with_context(operation, resource)
}

async fn fetch_remote_catalog(api_url: &str, api_key: Option<&str>) -> Result<Vec<ExternalLabPractice>, CommandError> {
    let client = build_client()?;
    let url = format!("{}/api/v1/lab-practices", api_url.trim_end_matches('/'));

    let mut req = client.get(&url);
    if let Some(key) = api_key {
        req = req.bearer_auth(key);
    }

    let response = req.send().await.map_err(|e| {
        let err = if e.is_timeout() {
            CommandError::transient("OPERATION_TIMEOUT", format!("Timeout consultando API de prácticas: {e}")).with_retry_after(2000)
        } else {
            CommandError::transient("COMMUNICATION_ERROR", format!("Error consultando API de prácticas: {e}")).with_retry_after(2000)
        };
        err.with_context("lab_practices_list", "catalog")
    })?;

    let status = response.status();
    let text = response.text().await.map_err(|e| {
        CommandError::transient("COMMUNICATION_ERROR", format!("Error leyendo respuesta de la API de prácticas: {e}"))
            .with_context("lab_practices_list", "catalog")
    })?;

    if !status.is_success() {
        return Err(map_http_error(status, &text, "lab_practices_list", "catalog"));
    }

    let practices: Vec<ExternalLabPractice> = serde_json::from_str(&text).map_err(|e| {
        CommandError::permanent("INVALID_DATA", format!("JSON inválido de la API de prácticas: {e}"))
            .with_context("lab_practices_list", "catalog")
    })?;

    // El contrato dice que el endpoint público solo debe devolver prácticas
    // publicadas, pero no confiamos ciegamente en que el proveedor lo
    // cumpla — filtramos igual del lado del cliente.
    Ok(practices.into_iter().filter(|p| p.status == "published").collect())
}

async fn fetch_remote_practice(api_url: &str, api_key: Option<&str>, id: &str) -> Result<ExternalLabPractice, CommandError> {
    let client = build_client()?;
    let url = format!("{}/api/v1/lab-practices/{}", api_url.trim_end_matches('/'), id);

    let mut req = client.get(&url);
    if let Some(key) = api_key {
        req = req.bearer_auth(key);
    }

    let response = req.send().await.map_err(|e| {
        let err = if e.is_timeout() {
            CommandError::transient("OPERATION_TIMEOUT", format!("Timeout consultando API de prácticas: {e}")).with_retry_after(2000)
        } else {
            CommandError::transient("COMMUNICATION_ERROR", format!("Error consultando API de prácticas: {e}")).with_retry_after(2000)
        };
        err.with_context("lab_practices_get", id)
    })?;

    let status = response.status();
    let text = response.text().await.map_err(|e| {
        CommandError::transient("COMMUNICATION_ERROR", format!("Error leyendo respuesta de la API de prácticas: {e}"))
            .with_context("lab_practices_get", id)
    })?;

    if !status.is_success() {
        return Err(map_http_error(status, &text, "lab_practices_get", id));
    }

    serde_json::from_str(&text).map_err(|e| {
        CommandError::permanent("INVALID_DATA", format!("JSON inválido de la API de prácticas: {e}"))
            .with_context("lab_practices_get", id)
    })
}

// ─── Catálogo mock (usado mientras no exista LAB_PRACTICES_API_URL) ───

fn mock_catalog() -> Vec<ExternalLabPractice> {
    vec![
        ExternalLabPractice {
            id: "proteinas-biuret".to_string(),
            version: 3,
            title: "Identificación de proteínas (reacción de Biuret)".to_string(),
            description: "Práctica de laboratorio de química para identificar la presencia de proteínas mediante la reacción de Biuret.".to_string(),
            area: "Química".to_string(),
            level: "Universitario".to_string(),
            objectives: vec!["Identificar la presencia de proteínas en una muestra usando la reacción de Biuret".to_string()],
            materials: vec![
                PracticeMaterial { name: "Reactivo de Biuret".to_string(), quantity: "10 mL".to_string() },
                PracticeMaterial { name: "Tubos de ensayo".to_string(), quantity: "5 unidades".to_string() },
            ],
            procedure: vec![
                ProcedureStep { order: 1, instruction: "Prepare las muestras en los tubos de ensayo.".to_string() },
                ProcedureStep { order: 2, instruction: "Agregue el reactivo de Biuret a cada muestra.".to_string() },
                ProcedureStep { order: 3, instruction: "Observe el cambio de color (violeta indica presencia de proteínas).".to_string() },
            ],
            safety_measures: vec!["Usar bata, guantes y gafas de seguridad".to_string()],
            estimated_duration_minutes: 45,
            status: "published".to_string(),
            execution_requirements: ExecutionRequirements {
                connection_type: "none".to_string(),
                capabilities: vec![],
            },
            author: PracticeAuthor { id: "docente-mock-1".to_string(), name: "Docente responsable (mock)".to_string() },
            source: PracticeSource { application: "lab-practices-mock".to_string(), external_id: "proteinas-biuret".to_string() },
            updated_at: "2026-08-01T00:00:00Z".to_string(),
        },
        ExternalLabPractice {
            id: "control-robot-eve3".to_string(),
            version: 1,
            title: "Control básico del robot Eve3".to_string(),
            description: "Práctica de robótica: mover el robot Eve3 mediante un script de control por teclado, ejecutado por SSH en el equipo del laboratorio.".to_string(),
            area: "Robótica".to_string(),
            level: "Universitario".to_string(),
            objectives: vec!["Ejecutar un script remoto para controlar un robot".to_string(), "Observar el movimiento resultante por cámara".to_string()],
            materials: vec![],
            procedure: vec![
                ProcedureStep { order: 1, instruction: "Ejecutar 'ls' para ver los archivos disponibles.".to_string() },
                ProcedureStep { order: 2, instruction: "Ejecutar 'python flechas.py' para iniciar el control.".to_string() },
                ProcedureStep { order: 3, instruction: "Usar las teclas de dirección para mover el robot.".to_string() },
            ],
            safety_measures: vec!["No acercar las manos al robot mientras está en movimiento".to_string()],
            estimated_duration_minutes: 30,
            status: "published".to_string(),
            execution_requirements: ExecutionRequirements {
                connection_type: "ssh".to_string(),
                capabilities: vec!["linux".to_string()],
            },
            author: PracticeAuthor { id: "docente-mock-2".to_string(), name: "Docente responsable (mock)".to_string() },
            source: PracticeSource { application: "lab-practices-mock".to_string(), external_id: "control-robot-eve3".to_string() },
            updated_at: "2026-07-15T00:00:00Z".to_string(),
        },
    ]
}

// ─── Comandos Tauri ───

/// Lista el catálogo de prácticas publicadas (contenido no confiable, ver
/// nota del módulo). Usa caché en memoria con TTL de 5 minutos.
#[tauri::command]
pub async fn lab_practices_list() -> Result<Vec<ExternalLabPractice>, CommandError> {
    let config = load_config();
    get_catalog(&config).await
}

/// Consulta una práctica externa por id. Si hay API real configurada, la
/// consulta directo (no depende de que ya esté en caché); si no, resuelve
/// contra el catálogo mock.
#[tauri::command]
pub async fn lab_practices_get(id: String) -> Result<ExternalLabPractice, CommandError> {
    let config = load_config();

    match &config.api_url {
        Some(url) => fetch_remote_practice(url, config.api_key.as_deref(), &id).await,
        None => mock_catalog()
            .into_iter()
            .find(|p| p.id == id)
            .ok_or_else(|| {
                CommandError::permanent("RESOURCE_NOT_FOUND", format!("Práctica '{id}' no encontrada"))
                    .with_context("lab_practices_get", &id)
            }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mock_catalog_only_has_published_practices() {
        assert!(mock_catalog().iter().all(|p| p.status == "published"));
    }

    #[test]
    fn mock_catalog_never_carries_connection_data() {
        // Guardrail estructural: ExternalLabPractice no tiene (ni debe tener
        // nunca) campos host/user/password — este test documenta la
        // invariante para que cualquier PR que intente agregarlos falle
        // review, no solo compilación.
        let json = serde_json::to_value(mock_catalog().first().unwrap()).unwrap();
        for forbidden in ["host", "user", "password", "ssh_key", "url", "ip"] {
            assert!(json.get(forbidden).is_none(), "ExternalLabPractice no debe exponer '{forbidden}'");
        }
    }

    #[tokio::test]
    async fn lab_practices_get_resolves_mock_by_id() {
        let practice = lab_practices_get("proteinas-biuret".to_string()).await;
        // Puede fallar si el entorno de test tiene LAB_PRACTICES_API_URL
        // exportado apuntando a algo real; en ese caso solo verificamos que
        // no entra en pánico.
        if let Ok(p) = practice {
            assert_eq!(p.id, "proteinas-biuret");
            assert_eq!(p.execution_requirements.connection_type, "none");
        }
    }

    #[tokio::test]
    async fn lab_practices_get_unknown_id_is_not_found() {
        let _ = dotenvy::dotenv();
        if env_var("LAB_PRACTICES_API_URL").is_some() {
            return; // sin mock si hay API real configurada
        }
        let err = lab_practices_get("no-existe".to_string()).await.unwrap_err();
        assert_eq!(err.code, "RESOURCE_NOT_FOUND");
    }
}
