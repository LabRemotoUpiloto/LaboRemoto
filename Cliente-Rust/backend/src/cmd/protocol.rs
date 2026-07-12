//! Protocolo versionado para comandos Tauri (envelope request/response).
//!
//! Fase A del REFACTOR #1: define los tipos base `CommandRequest` /
//! `CommandResponse` que futuras fases usarán para envolver los comandos
//! existentes de forma incremental, sin romper compatibilidad.

use serde::{Deserialize, Serialize};

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CommandError {
    Transient { msg: String },
    Permanent { msg: String },
    SessionExpired,
    VersionMismatch { required: String, provided: String },
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

/// Envuelve rápidamente un `Result<T, String>` legado en un `CommandResponse<T>`.
/// Útil para las fases B/C/D futuras al migrar comandos existentes.
pub fn wrap_result<T>(
    id: String,
    version: String,
    result: Result<T, String>,
    elapsed_ms: i64,
) -> CommandResponse<T> {
    match result {
        Ok(data) => CommandResponse::success(id, version, data, elapsed_ms),
        Err(msg) => CommandResponse::error(id, version, CommandError::Permanent { msg }, None),
    }
}
