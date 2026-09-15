use app::cmd::cva_gestures::session::{
    cva_gestures_session_start, CvaGestureSession, CVA_SESSIONS,
};
use app::cmd::streaming::stream::{stream_start, stream_stop};
use tokio::net::TcpListener;

#[tokio::test]
async fn test_cva_concurrent_session_start_race_condition_integration() {
    let session_id = "test-session-concurrent-start-race-integration".to_string();

    let task1 = tokio::spawn(cva_gestures_session_start(
        session_id.clone(),
        "domotica".to_string(),
    ));
    let task2 = tokio::spawn(cva_gestures_session_start(
        session_id.clone(),
        "domotica".to_string(),
    ));

    let (res1, res2) = tokio::join!(task1, task2);
    let r1 = res1.unwrap();
    let r2 = res2.unwrap();

    // No deben responder Ok ambas llamadas concurrentes para el mismo session_id
    let ok_count = [r1.is_ok(), r2.is_ok()].iter().filter(|&&x| x).count();
    assert!(
        ok_count <= 1,
        "No pueden responder Ok ambas llamadas concurrentes para el mismo session_id"
    );

    if let Err(ref e1) = r1 {
        assert!(
            e1.code == "SESSION_EXPIRED"
                || e1.code == "SESSION_ALREADY_ACTIVE"
                || e1.code == "BRIDGE_UNAVAILABLE"
        );
    }
    if let Err(ref e2) = r2 {
        assert!(
            e2.code == "SESSION_EXPIRED"
                || e2.code == "SESSION_ALREADY_ACTIVE"
                || e2.code == "BRIDGE_UNAVAILABLE"
        );
    }
}

#[tokio::test]
async fn test_cva_concurrent_session_start_already_active_race() {
    let session_id = "test-session-already-active-race".to_string();

    // 1. Pre-insertar la sesión activa en CVA_SESSIONS
    {
        let mut map = CVA_SESSIONS.lock().unwrap();
        map.insert(
            session_id.clone(),
            CvaGestureSession {
                session_id: session_id.clone(),
                module_id: "domotica".to_string(),
                bridge_port: 8766,
                active: true,
            },
        );
    }

    // 2. Lanzar 2 llamadas concurrentes
    let task1 = tokio::spawn(cva_gestures_session_start(
        session_id.clone(),
        "domotica".to_string(),
    ));
    let task2 = tokio::spawn(cva_gestures_session_start(
        session_id.clone(),
        "domotica".to_string(),
    ));

    let (res1, res2) = tokio::join!(task1, task2);
    let r1 = res1.unwrap();
    let r2 = res2.unwrap();

    // Ambas llamadas deben recibir SESSION_ALREADY_ACTIVE de manera determinística gracias al lock por session_id
    assert!(r1.is_err());
    assert_eq!(r1.unwrap_err().code, "SESSION_ALREADY_ACTIVE");

    assert!(r2.is_err());
    assert_eq!(r2.unwrap_err().code, "SESSION_ALREADY_ACTIVE");

    // Limpieza
    {
        let mut map = CVA_SESSIONS.lock().unwrap();
        map.remove(&session_id);
    }
}

#[tokio::test]
async fn test_stream_stop_frees_port_immediately_without_sleep() {
    let test_session_id = "test-stream-immediate-port-release".to_string();
    let test_port = 18766;

    // 1. Iniciar stream en el puerto de prueba
    let started_port = stream_start(test_session_id.clone(), 8766, test_port)
        .await
        .expect("stream_start debe iniciar con éxito");
    assert_eq!(started_port, test_port);

    // 2. Confirmar que el TcpListener está escuchando activamente
    let connect_res = tokio::net::TcpStream::connect(format!("127.0.0.1:{test_port}")).await;
    assert!(connect_res.is_ok(), "El listener debe estar escuchando en el puerto {test_port}");

    // 3. Llamar a stream_stop (debe esperar confirmación interna de que el listener se dropeó)
    let stop_res = stream_stop(test_session_id).await;
    assert!(stop_res.is_ok(), "stream_stop debe retornar Ok(())");

    // 4. Inmediatamente después de retornar stream_stop (SIN ningún sleep arbitrario),
    // intentar bindear un nuevo TcpListener en exactamente el mismo puerto.
    // Si el listener anterior continuara vivo en su ventana de sleep residual,
    // esto fallaría con 'address already in use' (os error 10048).
    let immediate_rebind = TcpListener::bind(format!("127.0.0.1:{test_port}")).await;
    assert!(
        immediate_rebind.is_ok(),
        "El puerto {test_port} debe estar liberado inmediatamente tras stream_stop sin ningún sleep: {:?}",
        immediate_rebind.err()
    );
}

