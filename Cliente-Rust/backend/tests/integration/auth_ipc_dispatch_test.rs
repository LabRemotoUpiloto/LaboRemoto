//! Test de integración: pipeline `Message → MessageEnvelope → IpcHub →
//! dispatcher → app.emit()` para el piloto de auth (REFACTOR #5, Fase B).
//!
//! No usa un frontend real: usa `tauri::test::mock_app()` (feature `test`
//! de la crate `tauri`, habilitada solo en `[dev-dependencies]`) para
//! obtener un `AppHandle` real capaz de emitir/escuchar eventos sin
//! necesitar una ventana. Verifica que, para los tres estados de auth, el
//! dispatcher emite exactamente al mismo nombre de canal Tauri legado que
//! el frontend (`store/auth.ts`) ya escucha hoy, con el payload intacto.
//!
//! ## Nota de entorno (best-effort)
//! En Windows, `tauri::test::MockRuntime` sigue enlazando en tiempo de
//! ejecución contra las dependencias nativas de `wry`/WebView2 (aunque no
//! abra una ventana real). En entornos headless sin el WebView2 Runtime
//! instalado, el binario de este test puede fallar a nivel de proceso con
//! `STATUS_ENTRYPOINT_NOT_FOUND` **antes** de ejecutar ningún assert — esto
//! no indica un bug en el código bajo prueba (verificado por separado con
//! `cargo check`/`cargo test --lib`, que sí pasan sin este runtime). La
//! cobertura equivalente y garantizada de correr en cualquier entorno está
//! en `ipc::tests::full_pipeline_enqueue_then_dequeue_maps_to_correct_legacy_event`
//! y los tests de `map_auth_message_to_legacy_event` (mismo módulo), que
//! ejercitan toda la lógica de mapeo sin depender de un `AppHandle` real.
//! Este archivo queda como verificación adicional para máquinas de
//! desarrollo/CI con WebView2 Runtime disponible (ya un prerequisito del
//! proyecto para compilar/ejecutar la app Tauri real).

use std::sync::{Arc, Mutex};
use std::time::Duration;

use app::ipc::{
    AuthStateKind, IpcHub, Message, MessageEnvelope, Priority, EVENT_AUTH_ERROR,
    EVENT_AUTH_LOGGED_OUT, EVENT_AUTH_SESSION_READY,
};
use tauri::Listener;

/// Espera hasta `timeout` a que `received` contenga un valor, sondeando en
/// intervalos cortos (el dispatcher corre en una tarea de background, así
/// que no hay garantía de que ya haya procesado el mensaje justo tras
/// `enqueue`).
async fn wait_for<T: Clone>(received: &Mutex<Option<T>>, timeout: Duration) -> Option<T> {
    let start = std::time::Instant::now();
    loop {
        if let Some(v) = received.lock().unwrap().clone() {
            return Some(v);
        }
        if start.elapsed() > timeout {
            return None;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
}

#[tokio::test]
async fn auth_state_change_session_ready_dispatches_to_legacy_event_with_same_payload() {
    let app = tauri::test::mock_app();
    let handle = app.handle().clone();

    let hub = IpcHub::new();
    hub.spawn_dispatcher(handle.clone());

    let received: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let received_clone = received.clone();
    handle.listen(EVENT_AUTH_SESSION_READY, move |event| {
        *received_clone.lock().unwrap() = Some(event.payload().to_string());
    });

    // Mismo shape que `AuthSessionInfo` (ver `state_core::AuthSessionInfo`),
    // el payload exacto que `store/auth.ts` espera en `auth://session-ready`.
    let payload = serde_json::json!({
        "preferred_username": "alice",
        "name": "Alice Estudiante",
        "email": "alice@example.com",
        "user_type": "estudiante",
        "roles": ["estudiante"],
        "exp": 1999999999,
    });

    let envelope = MessageEnvelope::new(
        Message::AuthStateChange {
            session_id: "alice".into(),
            new_state: AuthStateKind::SessionReady,
            payload: payload.clone(),
        },
        Priority::High,
        false,
    );
    hub.enqueue(envelope);

    let got = wait_for(&received, Duration::from_secs(2))
        .await
        .expect("el dispatcher debe emitir auth://session-ready");
    let got_value: serde_json::Value = serde_json::from_str(&got).expect("payload debe ser JSON válido");
    assert_eq!(got_value, payload, "el payload emitido debe ser idéntico al encolado");
}

#[tokio::test]
async fn auth_state_change_logged_out_dispatches_to_legacy_event_with_null_payload() {
    let app = tauri::test::mock_app();
    let handle = app.handle().clone();

    let hub = IpcHub::new();
    hub.spawn_dispatcher(handle.clone());

    let received: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let received_clone = received.clone();
    handle.listen(EVENT_AUTH_LOGGED_OUT, move |event| {
        *received_clone.lock().unwrap() = Some(event.payload().to_string());
    });

    let envelope = MessageEnvelope::new(
        Message::AuthStateChange {
            session_id: "local".into(),
            new_state: AuthStateKind::LoggedOut,
            payload: serde_json::Value::Null,
        },
        Priority::High,
        false,
    );
    hub.enqueue(envelope);

    let got = wait_for(&received, Duration::from_secs(2))
        .await
        .expect("el dispatcher debe emitir auth://logged-out");
    let got_value: serde_json::Value = serde_json::from_str(&got).expect("payload debe ser JSON válido");
    assert_eq!(got_value, serde_json::Value::Null);
}

#[tokio::test]
async fn auth_state_change_error_dispatches_to_legacy_event_with_string_payload() {
    let app = tauri::test::mock_app();
    let handle = app.handle().clone();

    let hub = IpcHub::new();
    hub.spawn_dispatcher(handle.clone());

    let received: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let received_clone = received.clone();
    handle.listen(EVENT_AUTH_ERROR, move |event| {
        *received_clone.lock().unwrap() = Some(event.payload().to_string());
    });

    let envelope = MessageEnvelope::new(
        Message::AuthStateChange {
            session_id: "unknown".into(),
            new_state: AuthStateKind::Error,
            payload: serde_json::Value::String("Timeout: el login tardó demasiado".into()),
        },
        Priority::High,
        false,
    );
    hub.enqueue(envelope);

    let got = wait_for(&received, Duration::from_secs(2))
        .await
        .expect("el dispatcher debe emitir auth://error");
    let got_value: serde_json::Value = serde_json::from_str(&got).expect("payload debe ser JSON válido");
    assert_eq!(got_value, serde_json::Value::String("Timeout: el login tardó demasiado".into()));
}
