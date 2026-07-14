use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;

use crate::cmd::protocol::{CommandError, ErrorCategory};

#[derive(Debug, Serialize)]
pub struct ApiErrorBody {
    pub code: String,
    pub message: String,
}

#[derive(Debug)]
pub struct ApiError {
    pub status: StatusCode,
    pub code: String,
    pub message: String,
}

impl ApiError {
    pub fn bad_request(msg: impl Into<String>) -> Self {
        Self { status: StatusCode::BAD_REQUEST, code: "BAD_REQUEST".into(), message: msg.into() }
    }
    pub fn unauthorized(msg: impl Into<String>) -> Self {
        Self { status: StatusCode::UNAUTHORIZED, code: "UNAUTHORIZED".into(), message: msg.into() }
    }
    pub fn forbidden(msg: impl Into<String>) -> Self {
        Self { status: StatusCode::FORBIDDEN, code: "FORBIDDEN".into(), message: msg.into() }
    }
    pub fn not_found(msg: impl Into<String>) -> Self {
        Self { status: StatusCode::NOT_FOUND, code: "NOT_FOUND".into(), message: msg.into() }
    }
    pub fn conflict(msg: impl Into<String>) -> Self {
        Self { status: StatusCode::CONFLICT, code: "CONFLICT".into(), message: msg.into() }
    }
    pub fn internal(msg: impl Into<String>) -> Self {
        Self { status: StatusCode::INTERNAL_SERVER_ERROR, code: "INTERNAL_ERROR".into(), message: msg.into() }
    }
}

/// Convierte un `CommandError` (usado por los comandos `cmd/*` migrados) en
/// un `ApiError` HTTP, preservando código/mensaje y derivando el status a
/// partir de la categoría del error en vez de colapsar todo a 500 como hacía
/// el `map_err(|_| ApiError::not_found(...))` previo.
impl From<CommandError> for ApiError {
    fn from(err: CommandError) -> Self {
        let status = match err.category {
            ErrorCategory::SessionExpired => StatusCode::UNAUTHORIZED,
            ErrorCategory::Permanent if err.code == "RESOURCE_NOT_FOUND" => StatusCode::NOT_FOUND,
            ErrorCategory::Permanent if err.code == "ACCESS_DENIED" => StatusCode::FORBIDDEN,
            ErrorCategory::Permanent | ErrorCategory::VersionMismatch => StatusCode::BAD_REQUEST,
            ErrorCategory::Transient | ErrorCategory::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        };
        Self {
            status,
            code: err.code,
            message: err.message,
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = serde_json::json!({ "error": { "code": self.code, "message": self.message } });
        (self.status, Json(body)).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resource_not_found_maps_to_404() {
        let cmd_err = CommandError::permanent("RESOURCE_NOT_FOUND", "Log no encontrado");
        let api_err: ApiError = cmd_err.into();
        assert_eq!(api_err.status, StatusCode::NOT_FOUND);
        assert_eq!(api_err.code, "RESOURCE_NOT_FOUND");
    }

    #[test]
    fn access_denied_maps_to_403() {
        let cmd_err = CommandError::permanent("ACCESS_DENIED", "no autorizado");
        let api_err: ApiError = cmd_err.into();
        assert_eq!(api_err.status, StatusCode::FORBIDDEN);
        assert_eq!(api_err.code, "ACCESS_DENIED");
    }

    #[test]
    fn other_permanent_errors_map_to_400() {
        let cmd_err = CommandError::permanent("INVALID_FORMAT", "bad input");
        let api_err: ApiError = cmd_err.into();
        assert_eq!(api_err.status, StatusCode::BAD_REQUEST);
    }

    #[test]
    fn session_expired_maps_to_401() {
        let cmd_err = CommandError::session_expired();
        let api_err: ApiError = cmd_err.into();
        assert_eq!(api_err.status, StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn transient_and_internal_errors_map_to_500() {
        let transient: ApiError = CommandError::transient("IO_ERROR", "disk hiccup").into();
        assert_eq!(transient.status, StatusCode::INTERNAL_SERVER_ERROR);

        let internal: ApiError = CommandError::internal("PANIC", "unexpected").into();
        assert_eq!(internal.status, StatusCode::INTERNAL_SERVER_ERROR);
    }
}
