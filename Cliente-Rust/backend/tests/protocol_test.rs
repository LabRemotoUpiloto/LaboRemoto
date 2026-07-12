//! Tests de integración para el protocolo versionado (Fase A/F del REFACTOR #1).
//!
//! Verifica la (de)serialización de `CommandRequest<T>` / `CommandResponse<T>`
//! y el helper `wrap_result` usados por los comandos migrados en las Fases B/C/D.

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
fn test_command_response_error() {
    let response: CommandResponse<String> = CommandResponse::Error {
        id: "test-123".to_string(),
        version: "1.0".to_string(),
        error: CommandError::Transient { msg: "timeout".to_string() },
        retry_after_ms: Some(5000),
    };

    let json = serde_json::to_string(&response).unwrap();
    assert!(json.contains("\"status\":\"error\""));
    assert!(json.contains("\"kind\":\"transient\""));
    assert!(json.contains("timeout"));

    let decoded: CommandResponse<String> = serde_json::from_str(&json).unwrap();
    match decoded {
        CommandResponse::Error { error, retry_after_ms, .. } => {
            assert_eq!(retry_after_ms, Some(5000));
            match error {
                CommandError::Transient { msg } => assert_eq!(msg, "timeout"),
                other => panic!("expected Transient error, got {:?}", other),
            }
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
fn test_wrap_result_err_produces_permanent_error() {
    let result: Result<i32, String> = Err("boom".to_string());
    let response = wrap_result("id-2".to_string(), "1.0".to_string(), result, 5);

    match response {
        CommandResponse::Error { error, retry_after_ms, .. } => {
            assert_eq!(retry_after_ms, None);
            match error {
                CommandError::Permanent { msg } => assert_eq!(msg, "boom"),
                other => panic!("expected Permanent error, got {:?}", other),
            }
        }
        CommandResponse::Success { .. } => panic!("expected Error variant"),
    }
}

#[test]
fn test_command_error_version_mismatch_serialization() {
    let error = CommandError::VersionMismatch {
        required: "2.0".to_string(),
        provided: "1.0".to_string(),
    };
    let json = serde_json::to_string(&error).unwrap();
    assert!(json.contains("\"kind\":\"version_mismatch\""));
    assert!(json.contains("2.0"));
    assert!(json.contains("1.0"));
}

#[test]
fn test_command_error_session_expired_serialization() {
    let error = CommandError::SessionExpired;
    let json = serde_json::to_string(&error).unwrap();
    assert!(json.contains("\"kind\":\"session_expired\""));
}
