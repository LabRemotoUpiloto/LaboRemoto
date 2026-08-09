//! Tests de categorización de `CommandError` (paso 0 del REFACTOR #3).
//!
//! Verifica que el enum unificado (5 categorías + `ErrorContext`) se
//! comporta correctamente y serializa el shape plano
//! `{code, message, retryable, retry_after_ms}` que consume
//! `frontend/src/services/command.service.ts`.

use app::cmd::protocol::CommandError;

#[test]
fn test_transient_should_retry() {
    let err = CommandError::transient("NETWORK_TIMEOUT", "timeout");
    assert!(err.is_retryable());
    assert!(!err.is_fatal());
}

#[test]
fn test_permanent_should_not_retry() {
    let err = CommandError::permanent("INVALID_ARG", "bad argument");
    assert!(!err.is_retryable());
    assert!(!err.is_fatal());
}

#[test]
fn test_session_expired_is_fatal() {
    let err = CommandError::session_expired();
    assert!(err.is_fatal());
    assert!(!err.is_retryable());
    assert_eq!(err.code, "SESSION_EXPIRED");
}

#[test]
fn test_version_mismatch_is_fatal() {
    let err = CommandError::version_mismatch("2.0", "1.0");
    assert!(err.is_fatal());
    assert!(!err.is_retryable());
    assert_eq!(err.code, "VERSION_MISMATCH");
}

#[test]
fn test_internal_should_retry_and_has_default_backoff() {
    let err = CommandError::internal("PANIC", "unexpected");
    assert!(err.is_retryable());
    assert_eq!(err.retry_after_ms, Some(1000));
}

#[test]
fn test_ssh2_error_maps_to_transient() {
    // ssh2::Error::new no está expuesto públicamente en todas las versiones,
    // así que probamos vía el path realista: un error IO transitorio, que es
    // la fuente más común de errores ssh2 en este backend.
    let io_err = std::io::Error::new(std::io::ErrorKind::TimedOut, "ssh timeout");
    let err: CommandError = io_err.into();
    assert!(err.is_retryable());
}

#[test]
fn test_wrap_result_categorizes_timeout() {
    use app::cmd::protocol::{wrap_result, CommandResponse};

    let result: Result<(), String> = Err("operation timeout".to_string());
    let response = wrap_result("id".to_string(), "1.0".to_string(), result, 1);

    match response {
        CommandResponse::Error { error, .. } => {
            assert_eq!(error.code, "TIMEOUT");
            assert!(error.is_retryable());
        }
        CommandResponse::Success { .. } => panic!("expected Error variant"),
    }
}

#[test]
fn test_context_preserved() {
    let err = CommandError::permanent("SFTP_UPLOAD_FAILED", "disk full")
        .with_context("sftp_upload", "file.txt");

    let ctx = err.context.clone().expect("context should be set");
    assert_eq!(ctx.operation.as_deref(), Some("sftp_upload"));
    assert_eq!(ctx.resource.as_deref(), Some("file.txt"));

    // El contexto nunca se serializa al frontend (no debe aparecer en el JSON).
    let json = serde_json::to_value(&err).unwrap();
    assert!(json.get("context").is_none());
    assert!(json.get("operation").is_none());
}

#[test]
fn test_serialize_sanitizes_internal_error_details() {
    // La sanitización ahora ocurre automáticamente en `Serialize`, no en un
    // método aparte que un caller podría olvidar invocar.
    let err = CommandError::internal("DB_PANIC", "thread panicked at row 42: null pointer");
    let json = serde_json::to_value(&err).unwrap();
    assert_eq!(json["message"], "Ocurrió un error interno. Intenta de nuevo.");
    assert!(!json["message"].as_str().unwrap().contains("null pointer"));
}

#[test]
fn test_serialize_leaves_non_internal_message_untouched() {
    let err = CommandError::permanent("NOT_FOUND", "file.txt not found");
    let json = serde_json::to_value(&err).unwrap();
    assert_eq!(json["message"], "file.txt not found");
}

#[tracing_test::traced_test]
#[test]
fn test_serialize_logs_original_internal_message_before_sanitizing() {
    let err = CommandError::internal("DB_PANIC", "thread panicked at row 42: null pointer");
    let _json = serde_json::to_value(&err).unwrap();

    // El mensaje original (con detalles internos) se logueó vía
    // `tracing::error!` antes de ser reemplazado por el genérico en el JSON.
    assert!(logs_contain("DB_PANIC"));
    assert!(logs_contain("null pointer"));
}

#[tracing_test::traced_test]
#[test]
fn test_serialize_does_not_log_non_internal_errors() {
    let err = CommandError::permanent("NOT_FOUND", "file.txt not found");
    let _json = serde_json::to_value(&err).unwrap();

    assert!(!logs_contain("file.txt not found"));
}

#[test]
fn test_serializes_flat_frontend_shape() {
    let err = CommandError::transient("NET_TIMEOUT", "net timeout").with_retry_after(1500);
    let json = serde_json::to_value(&err).unwrap();
    assert_eq!(json["code"], "NET_TIMEOUT");
    assert_eq!(json["retryable"], true);
    assert_eq!(json["retry_after_ms"], 1500);
    assert!(json["message"].is_string());
    // "category" no debe filtrarse al frontend.
    assert!(json.get("category").is_none());
}

#[test]
fn test_permission_denied_io_error_is_permanent() {
    let io_err = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "denied");
    let err: CommandError = io_err.into();
    assert!(!err.is_retryable());
    assert_eq!(err.code, "PERMISSION_DENIED");
}

// ── Cobertura real de `From<reqwest::Error>` ────────────────────────────────
//
// Los tests anteriores probaban la heurística equivalente vía `io::Error`
// porque `reqwest::Error` no expone un constructor público. Aquí levantamos
// servidores TCP locales mínimos (sin dependencias externas ni red real) para
// forzar cada rama del `match` en `From<reqwest::Error>`.

#[tokio::test]
async fn test_reqwest_connection_error_is_transient() {
    // Reservar un puerto libre y liberarlo inmediatamente: nadie escucha ahí,
    // así que la conexión es rechazada de forma determinista y local.
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
    let addr = listener.local_addr().expect("local_addr");
    drop(listener);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .expect("client");
    let result = client.get(format!("http://{addr}")).send().await;
    let reqwest_err = result.expect_err("expected connection error");
    // En algunos entornos (notablemente Windows) conectar a un puerto local
    // cerrado no produce un rechazo inmediato sino que expira el timeout del
    // cliente; `From<reqwest::Error>` trata ambos casos igual
    // (`is_connect() || is_timeout()` → transient), así que aceptamos
    // cualquiera de los dos aquí.
    assert!(reqwest_err.is_connect() || reqwest_err.is_timeout());

    let err: CommandError = reqwest_err.into();
    assert!(err.is_retryable());
    assert_eq!(err.code, "NETWORK_TIMEOUT");
}

#[tokio::test]
async fn test_reqwest_timeout_is_transient() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
    let addr = listener.local_addr().expect("local_addr");

    // Acepta la conexión pero nunca responde, forzando al cliente a agotar
    // su timeout.
    std::thread::spawn(move || {
        if let Ok((mut stream, _)) = listener.accept() {
            use std::io::Read;
            let mut buf = [0u8; 1024];
            let _ = stream.read(&mut buf);
            std::thread::sleep(std::time::Duration::from_secs(5));
        }
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(100))
        .build()
        .expect("client");
    let result = client.get(format!("http://{addr}")).send().await;
    let reqwest_err = result.expect_err("expected timeout error");
    assert!(reqwest_err.is_timeout());

    let err: CommandError = reqwest_err.into();
    assert!(err.is_retryable());
    assert_eq!(err.code, "NETWORK_TIMEOUT");
}

#[tokio::test]
async fn test_reqwest_401_status_is_permanent() {
    let err = reqwest_error_with_status(401).await;

    let command_err: CommandError = err.into();
    assert!(!command_err.is_retryable());
    assert_eq!(command_err.code, "HTTP_AUTH");
}

#[tokio::test]
async fn test_reqwest_5xx_status_is_transient() {
    let err = reqwest_error_with_status(500).await;

    let command_err: CommandError = err.into();
    assert!(command_err.is_retryable());
    assert_eq!(command_err.code, "HTTP_5XX");
}

#[tokio::test]
async fn test_reqwest_404_status_falls_back_to_internal() {
    // Ni auth (401/403) ni 5xx: cae en la rama por defecto (`Internal`), que
    // el frontend también reintenta pero sanitiza el mensaje al serializar.
    let err = reqwest_error_with_status(404).await;

    let command_err: CommandError = err.into();
    assert!(command_err.is_retryable());
    assert_eq!(command_err.code, "HTTP_ERROR");
}

/// Levanta un servidor TCP local mínimo que responde con `status` y devuelve
/// el `reqwest::Error` producido por `Response::error_for_status()`.
async fn reqwest_error_with_status(status: u16) -> reqwest::Error {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
    let addr = listener.local_addr().expect("local_addr");

    std::thread::spawn(move || {
        if let Ok((mut stream, _)) = listener.accept() {
            use std::io::{Read, Write};
            let mut buf = [0u8; 1024];
            let _ = stream.read(&mut buf);
            let response = format!(
                "HTTP/1.1 {status} status\r\ncontent-length: 0\r\nconnection: close\r\n\r\n"
            );
            let _ = stream.write_all(response.as_bytes());
        }
    });

    let client = reqwest::Client::new();
    let response = client
        .get(format!("http://{addr}"))
        .send()
        .await
        .expect("expected a response, not a transport error");
    response
        .error_for_status()
        .expect_err("expected error status")
}
