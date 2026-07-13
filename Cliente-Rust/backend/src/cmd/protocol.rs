//! Protocolo versionado para comandos Tauri (envelope request/response) y
//! `CommandError`, el tipo de error unificado que usan los comandos migrados.
//!
//! ## Historia (REFACTOR #1 / #3)
//! Fase A del REFACTOR #1 introdujo `CommandRequest`/`CommandResponse`. Este
//! módulo absorbe además el `CommandError` que originalmente vivía en
//! `cmd/error.rs` (huérfano, nunca expuesto en `cmd/mod.rs`) para eliminar la
//! coexistencia de dos enums `CommandError` incompatibles (paso 0 de
//! REFACTOR #3, previo a migrar el resto de comandos legado).
//!
//! ## Compatibilidad con el frontend
//! `CommandError` serializa como `{ code, message, retryable, retry_after_ms }`
//! (shape plano, NO tageado por variante). Este es el contrato real que
//! consume `CommandErrorPayload` en `frontend/src/services/command.service.ts`
//! (`CommandClient.invoke` decide reintentar leyendo `error.retryable` y
//! `error.retry_after_ms`). Cualquier cambio en este shape debe mantenerse
//! sincronizado con ese archivo.

use serde::de::Deserializer;
use serde::ser::SerializeStruct;
use serde::{Deserialize, Serialize, Serializer};

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandRequest<T> {
    pub id: String,      // UUID generado en frontend
    pub version: String, // ej "1.0"
    pub payload: T,
    pub timestamp_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum CommandResponse<T> {
    Success {
        id: String,
        version: String,
        data: T,
        elapsed_ms: i64,
    },
    Error {
        id: String,
        version: String,
        error: CommandError,
        retry_after_ms: Option<i64>,
    },
}

impl<T> CommandResponse<T> {
    pub fn success(id: String, version: String, data: T, elapsed_ms: i64) -> Self {
        CommandResponse::Success {
            id,
            version,
            data,
            elapsed_ms,
        }
    }

    pub fn error(
        id: String,
        version: String,
        error: CommandError,
        retry_after_ms: Option<i64>,
    ) -> Self {
        CommandResponse::Error {
            id,
            version,
            error,
            retry_after_ms,
        }
    }
}

// ── CommandError: enum unificado (REFACTOR #3, paso 0) ──────────────────────

/// Categorización interna que determina el comportamiento de reintento.
/// NO se serializa directamente; el frontend solo ve el booleano `retryable`
/// derivado de esta categoría (ver `is_retryable`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ErrorCategory {
    /// Temporal/transitorio (timeout de red, servicio momentáneamente no
    /// disponible) → el frontend reintenta automáticamente.
    Transient,
    /// Permanente/fatal (argumento inválido, fallo de auth, permiso denegado)
    /// → no se reintenta.
    Permanent,
    /// Sesión/autenticación expirada → requiere re-login.
    SessionExpired,
    /// Protocolo/versión incompatible → requiere actualizar el cliente.
    VersionMismatch,
    /// Error interno inesperado (panic, 500, etc.) → se reintenta y se loguea.
    Internal,
}

/// Contexto adicional para debugging/logging. Nunca se serializa al frontend
/// (evita filtrar detalles internos); solo vive en el lado Rust (tracing).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ErrorContext {
    /// Nombre de la operación que falló (ej. "ssh_connect", "sftp_upload").
    pub operation: Option<String>,
    /// Identificador del recurso (ej. "host:192.168.1.1", "file.txt").
    pub resource: Option<String>,
    /// ID de sesión, si aplica.
    pub session_id: Option<String>,
}

/// Error estructurado y categorizado que devuelven los comandos Tauri
/// migrados, en lugar del legado `Result<T, String>`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandError {
    /// Código legible por máquina: "SSH_CONNECTION_FAILED", "SESSION_EXPIRED", etc.
    pub code: String,
    /// Mensaje legible para mostrar al usuario.
    pub message: String,
    /// Categoría que determina el comportamiento de reintento.
    pub category: ErrorCategory,
    /// Contexto adicional (operación, recurso, sesión). No se serializa.
    pub context: Option<ErrorContext>,
    /// Backoff sugerido en milisegundos (usado por el frontend si está presente).
    pub retry_after_ms: Option<u32>,
}

impl CommandError {
    /// Error transitorio (el frontend lo reintenta automáticamente).
    pub fn transient(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            category: ErrorCategory::Transient,
            context: None,
            retry_after_ms: None,
        }
    }

    /// Error permanente (no se reintenta).
    pub fn permanent(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            category: ErrorCategory::Permanent,
            context: None,
            retry_after_ms: None,
        }
    }

    /// Sesión expirada: el usuario debe volver a iniciar sesión.
    pub fn session_expired() -> Self {
        Self {
            code: "SESSION_EXPIRED".to_string(),
            message: "Tu sesión ha expirado. Vuelve a iniciar sesión.".to_string(),
            category: ErrorCategory::SessionExpired,
            context: None,
            retry_after_ms: None,
        }
    }

    /// Versión de protocolo incompatible: el cliente debe actualizarse.
    pub fn version_mismatch(required: impl Into<String>, provided: impl Into<String>) -> Self {
        Self {
            code: "VERSION_MISMATCH".to_string(),
            message: format!(
                "Versión de protocolo incompatible. Requerida: {}, recibida: {}",
                required.into(),
                provided.into()
            ),
            category: ErrorCategory::VersionMismatch,
            context: None,
            retry_after_ms: None,
        }
    }

    /// Error interno del servidor (se reintenta y se loguea).
    pub fn internal(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            category: ErrorCategory::Internal,
            context: None,
            retry_after_ms: Some(1000), // Backoff por defecto de 1s
        }
    }

    /// Agrega contexto de debugging a un error existente.
    pub fn with_context(mut self, operation: impl Into<String>, resource: impl Into<String>) -> Self {
        self.context = Some(ErrorContext {
            operation: Some(operation.into()),
            resource: Some(resource.into()),
            session_id: None,
        });
        self
    }

    /// Ajusta el backoff sugerido.
    pub fn with_retry_after(mut self, ms: u32) -> Self {
        self.retry_after_ms = Some(ms);
        self
    }

    /// ¿El frontend debe reintentar este error automáticamente?
    /// Es el valor que se serializa como `retryable`.
    pub fn is_retryable(&self) -> bool {
        matches!(self.category, ErrorCategory::Transient | ErrorCategory::Internal)
    }

    /// ¿Es un error fatal que requiere acción del usuario (re-login, update)?
    pub fn is_fatal(&self) -> bool {
        matches!(
            self.category,
            ErrorCategory::VersionMismatch | ErrorCategory::SessionExpired
        )
    }

}

/// Mensaje genérico enviado al frontend en lugar del mensaje real cuando la
/// categoría es `Internal` (evita filtrar detalles internos, ej. paths,
/// stack traces, mensajes de librerías).
const INTERNAL_ERROR_GENERIC_MESSAGE: &str = "Ocurrió un error interno. Intenta de nuevo.";

/// Serializa como `{ code, message, retryable, retry_after_ms }`: el shape
/// plano que consume `CommandErrorPayload` en el frontend. `category` y
/// `context` se mantienen internos (nunca se envían al cliente).
///
/// La sanitización de errores `Internal` ocurre aquí, no en un método aparte
/// (`sanitize_for_frontend`, ahora eliminado): así ningún caller puede
/// olvidar invocarla antes de serializar. El mensaje original se loguea vía
/// `tracing::error!` antes de reemplazarlo por uno genérico.
impl Serialize for CommandError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let is_internal = matches!(self.category, ErrorCategory::Internal);

        if is_internal {
            tracing::error!(
                code = %self.code,
                message = %self.message,
                category = ?self.category,
                "internal command error details (not sent to frontend)"
            );
        }

        let message_to_send: &str = if is_internal {
            INTERNAL_ERROR_GENERIC_MESSAGE
        } else {
            &self.message
        };

        let mut state = serializer.serialize_struct("CommandError", 4)?;
        state.serialize_field("code", &self.code)?;
        state.serialize_field("message", message_to_send)?;
        state.serialize_field("retryable", &self.is_retryable())?;
        state.serialize_field("retry_after_ms", &self.retry_after_ms)?;
        state.end()
    }
}

/// Deserializa desde el shape plano `{ code, message, retryable, retry_after_ms }`.
/// Solo se necesita para tests de round-trip (el frontend nunca envía
/// `CommandError` de vuelta al backend); reconstruye una categoría binaria
/// (`Transient`/`Permanent`) a partir de `retryable`, perdiendo el detalle
/// fino de categoría original (aceptable: no hay caso de uso real de entrada).
impl<'de> Deserialize<'de> for CommandError {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        struct RawCommandError {
            code: String,
            message: String,
            #[serde(default)]
            retryable: bool,
            #[serde(default)]
            retry_after_ms: Option<u32>,
        }

        let raw = RawCommandError::deserialize(deserializer)?;
        let category = if raw.retryable {
            ErrorCategory::Transient
        } else {
            ErrorCategory::Permanent
        };

        Ok(CommandError {
            code: raw.code,
            message: raw.message,
            category,
            context: None,
            retry_after_ms: raw.retry_after_ms,
        })
    }
}

// ── Conversiones desde errores de librería ──────────────────────────────────

impl From<String> for CommandError {
    fn from(msg: String) -> Self {
        Self::permanent("UNKNOWN_ERROR", msg)
    }
}

impl From<&str> for CommandError {
    fn from(msg: &str) -> Self {
        Self::permanent("UNKNOWN_ERROR", msg.to_string())
    }
}

impl From<ssh2::Error> for CommandError {
    fn from(e: ssh2::Error) -> Self {
        // Errores de conexión SSH son típicamente transitorios (red, host
        // no disponible momentáneamente).
        Self::transient("SSH_ERROR", format!("Error de conexión SSH: {}", e))
    }
}

impl From<reqwest::Error> for CommandError {
    fn from(e: reqwest::Error) -> Self {
        if e.is_timeout() || e.is_connect() {
            return Self::transient("NETWORK_TIMEOUT", format!("Error de red: {}", e))
                .with_retry_after(2000);
        }
        if let Some(status) = e.status() {
            if status.as_u16() == 401 || status.as_u16() == 403 {
                return Self::permanent("HTTP_AUTH", format!("Error de autenticación HTTP: {}", e));
            }
            if status.is_server_error() {
                return Self::transient("HTTP_5XX", format!("Error de servidor: {}", e))
                    .with_retry_after(2000);
            }
        }
        Self::internal("HTTP_ERROR", format!("Error HTTP: {}", e))
    }
}

impl From<serde_json::Error> for CommandError {
    fn from(e: serde_json::Error) -> Self {
        Self::permanent("JSON_ERROR", format!("Error de parseo JSON: {}", e))
    }
}

impl From<std::io::Error> for CommandError {
    fn from(e: std::io::Error) -> Self {
        use std::io::ErrorKind::*;
        match e.kind() {
            TimedOut | WouldBlock | Interrupted => {
                Self::transient("IO_TRANSIENT", e.to_string()).with_retry_after(1000)
            }
            NotFound => Self::permanent("NOT_FOUND", e.to_string()),
            PermissionDenied => Self::permanent("PERMISSION_DENIED", e.to_string()),
            _ => Self::internal("IO_ERROR", e.to_string()),
        }
    }
}

impl From<AppError> for CommandError {
    fn from(err: AppError) -> Self {
        match err {
            AppError::NotFoundSession => Self::session_expired(),
            AppError::NotFound(resource) => Self::permanent("NOT_FOUND", format!("No encontrado: {}", resource)),
            AppError::Unauthorized(reason) => Self::permanent("UNAUTHORIZED", reason),
            AppError::Network(msg) => Self::transient("NETWORK", msg),
            AppError::Api(msg) => Self::transient("API", msg),
            AppError::Io(io_err) => Self::from(io_err),
            AppError::EnvVar(msg) => Self::internal("ENV_VAR", msg),
            AppError::Serialization(msg) => Self::permanent("SERIALIZATION", msg),
            AppError::Ssh(msg) => Self::transient("SSH", msg),
            AppError::External(msg) => Self::internal("EXTERNAL_PROCESS", msg),
        }
    }
}

/// Categoriza heurísticamente un mensaje de error legado (`String`) en un
/// `CommandError`. Usado por `wrap_result` para no forzar todo a `Permanent`
/// como hacía la versión anterior del protocolo.
fn categorize_error_message(msg: String) -> CommandError {
    let lower = msg.to_lowercase();

    if lower.contains("timeout") {
        CommandError::transient("TIMEOUT", msg)
    } else if lower.contains("session") {
        CommandError::session_expired()
    } else if lower.contains("auth") || lower.contains("permission") {
        CommandError::permanent("AUTH_ERROR", msg)
    } else if lower.contains("not found") {
        CommandError::permanent("NOT_FOUND", msg)
    } else {
        // Por defecto: error interno (reintentable, se loguea).
        CommandError::internal("INTERNAL_ERROR", msg)
    }
}

/// Envuelve rápidamente un `Result<T, String>` legado en un `CommandResponse<T>`.
/// Útil para las fases B/C/D al migrar comandos existentes sin cambiar su
/// firma pública (`id`, `version`, `elapsed_ms` siguen viniendo del envelope).
pub fn wrap_result<T>(
    id: String,
    version: String,
    result: Result<T, String>,
    elapsed_ms: i64,
) -> CommandResponse<T> {
    match result {
        Ok(data) => CommandResponse::success(id, version, data, elapsed_ms),
        Err(msg) => {
            let error = categorize_error_message(msg);
            let retry_after_ms = error.retry_after_ms.map(|ms| ms as i64);
            CommandResponse::error(id, version, error, retry_after_ms)
        }
    }
}
