//! Tests de integración para el protocolo versionado (Fase A del REFACTOR #1)
//! y el `CommandError` unificado (paso 0 del REFACTOR #3).
//!
//! Verifica la (de)serialización de `CommandRequest<T>` / `CommandResponse<T>`
//! y el helper `wrap_result` usados por los comandos migrados en las Fases B/C/D,
//! además del contrato plano `{code, message, retryable, retry_after_ms}` que
//! consume `frontend/src/services/command.service.ts`.

use app::cmd::protocol::{wrap_result, CommandError, CommandRequest, CommandResponse};

#[test]
fn test_command_request_serialization() {
    let req = CommandRequest {
        id: "test-123".to_string(),
        version: "1.0".to_string(),
        payload: serde_json::json!({ "host": "localhost" }),
        timestamp_ms: 1000,
    };

    let json = serde_json::to_string(&req).unwrap();
    assert!(json.contains("test-123"));
    assert!(json.contains("1.0"));
    assert!(json.contains("localhost"));

    let decoded: CommandRequest<serde_json::Value> = serde_json::from_str(&json).unwrap();
    assert_eq!(decoded.id, "test-123");
    assert_eq!(decoded.version, "1.0");
    assert_eq!(decoded.timestamp_ms, 1000);
    assert_eq!(decoded.payload["host"], "localhost");
}

#[test]
fn test_command_response_success() {
    let response: CommandResponse<String> = CommandResponse::Success {
        id: "test-123".to_string(),
        version: "1.0".to_string(),
        data: "ok".to_string(),
        elapsed_ms: 100,
    };

    let json = serde_json::to_string(&response).unwrap();
    assert!(json.contains("\"status\":\"success\""));
    assert!(json.contains("\"data\":\"ok\""));

    let decoded: CommandResponse<String> = serde_json::from_str(&json).unwrap();
    match decoded {
        CommandResponse::Success { data, elapsed_ms, .. } => {
            assert_eq!(data, "ok");
            assert_eq!(elapsed_ms, 100);
        }
        CommandResponse::Error { .. } => panic!("expected Success variant"),
    }
}

#[test]
fn test_command_response_error_serializes_flat_frontend_shape() {
    let response: CommandResponse<String> = CommandResponse::Error {
        id: "test-123".to_string(),
        version: "1.0".to_string(),
        error: CommandError::transient("TIMEOUT", "timeout").with_retry_after(5000),
        retry_after_ms: Some(5000),
    };

    let json = serde_json::to_string(&response).unwrap();
    assert!(json.contains("\"status\":\"error\""));
    assert!(json.contains("\"code\":\"TIMEOUT\""));
    assert!(json.contains("\"retryable\":true"));
    assert!(json.contains("timeout"));

    let decoded: CommandResponse<String> = serde_json::from_str(&json).unwrap();
    match decoded {
        CommandResponse::Error { error, retry_after_ms, .. } => {
            assert_eq!(retry_after_ms, Some(5000));
            assert_eq!(error.code, "TIMEOUT");
            assert!(error.is_retryable());
        }
        CommandResponse::Success { .. } => panic!("expected Error variant"),
    }
}

#[test]
fn test_wrap_result_ok_produces_success() {
    let result: Result<i32, String> = Ok(42);
    let response = wrap_result("id-1".to_string(), "1.0".to_string(), result, 10);

    match response {
        CommandResponse::Success { data, id, version, elapsed_ms } => {
            assert_eq!(data, 42);
            assert_eq!(id, "id-1");
            assert_eq!(version, "1.0");
            assert_eq!(elapsed_ms, 10);
        }
        CommandResponse::Error { .. } => panic!("expected Success variant"),
    }
}

#[test]
fn test_wrap_result_err_categorizes_generic_message_as_internal() {
    let result: Result<i32, String> = Err("boom".to_string());
    let response = wrap_result("id-2".to_string(), "1.0".to_string(), result, 5);

    match response {
        CommandResponse::Error { error, retry_after_ms, .. } => {
            assert_eq!(error.code, "INTERNAL_ERROR");
            assert_eq!(error.message, "boom");
            assert!(error.is_retryable());
            assert_eq!(retry_after_ms, Some(1000));
        }
        CommandResponse::Success { .. } => panic!("expected Error variant"),
    }
}

#[test]
fn test_wrap_result_err_categorizes_timeout_as_transient() {
    let result: Result<i32, String> = Err("connection timeout".to_string());
    let response = wrap_result("id-3".to_string(), "1.0".to_string(), result, 5);

    match response {
        CommandResponse::Error { error, .. } => {
            assert_eq!(error.code, "TIMEOUT");
            assert!(error.is_retryable());
        }
        CommandResponse::Success { .. } => panic!("expected Error variant"),
    }
}

#[test]
fn test_command_error_version_mismatch_serialization() {
    let error = CommandError::version_mismatch("2.0", "1.0");
    let json = serde_json::to_value(&error).unwrap();
    assert_eq!(json["retryable"], false);
    assert!(json["message"].as_str().unwrap().contains("2.0"));
    assert!(json["message"].as_str().unwrap().contains("1.0"));
    assert!(error.is_fatal());
}

#[test]
fn test_command_error_session_expired_serialization() {
    let error = CommandError::session_expired();
    let json = serde_json::to_value(&error).unwrap();
    assert_eq!(json["code"], "SESSION_EXPIRED");
    assert_eq!(json["retryable"], false);
    assert!(error.is_fatal());
}
