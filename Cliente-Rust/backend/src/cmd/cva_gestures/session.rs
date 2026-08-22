//! cmd/cva_gestures/session.rs — Gestión de sesiones de control por gestos en CVA

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use tokio::net::TcpStream;
use tokio::sync::Mutex as AsyncMutex;
use ts_rs::TS;

use crate::cmd::protocol::CommandError;
use crate::cmd::state::SESSIONS;
use crate::cmd::streaming::stream::{stream_start, stream_stop};
use crate::error::AppError;
use super::bridge::{check_bridge_health, DEFAULT_CVA_BRIDGE_PORT};

/// Información de la sesión activa de control por gestos
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[ts(export)]
pub struct CvaGestureSession {
    pub session_id: String,
    pub module_id: String,
    pub bridge_port: u16,
    pub active: bool,
}

/// Configuración de gestos y muestreo para CVA
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[ts(export)]
pub struct CvaGestureConfig {
    pub enabled: bool,
    pub min_confidence: f32,
    #[serde(default)]
    pub mapping: HashMap<String, String>,
}

/// Registro global en memoria para sesiones CVA activas
pub static CVA_SESSIONS: Lazy<Mutex<HashMap<String, CvaGestureSession>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Registro de conexiones TCP persistentes por sesión CVA hacia el puerto del túnel
pub static CVA_TCP_CONNECTIONS: Lazy<Mutex<HashMap<String, Arc<AsyncMutex<TcpStream>>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Valida y carga la configuración JSON del módulo desde `config/cva-gestures/{module_id}.json`
pub fn validate_module_config(module_id: &str) -> Result<CvaGestureConfig, CommandError> {
    let mut candidate_paths: Vec<PathBuf> = vec![
        PathBuf::from(format!("config/cva-gestures/{module_id}.json")),
        PathBuf::from(format!("../config/cva-gestures/{module_id}.json")),
    ];

    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        let manifest_path = Path::new(&manifest_dir);
        candidate_paths.push(manifest_path.join(format!("config/cva-gestures/{module_id}.json")));
        candidate_paths.push(manifest_path.join(format!("../config/cva-gestures/{module_id}.json")));
    }

    for path in candidate_paths {
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(cfg) = serde_json::from_str::<CvaGestureConfig>(&content) {
                    if !cfg.enabled {
                        return Err(CommandError::permanent(
                            "CONFIG_NOT_FOUND",
                            format!("El módulo '{module_id}' no tiene una configuración válida o está deshabilitado"),
                        ));
                    }
                    return Ok(cfg);
                }
            }
        }
    }

    Err(CommandError::permanent(
        "CONFIG_NOT_FOUND",
        format!("No se encontró o es inválida la configuración para el módulo '{module_id}'"),
    ))
}

#[tauri::command]
pub async fn cva_gestures_session_start(
    session_id: String,
    module_id: String,
) -> Result<CvaGestureSession, CommandError> {
    // 1. Validar que exista la configuración del módulo en `config/cva-gestures/*.json`
    let _config = validate_module_config(&module_id)?;

    // 2. Validar que no exista ya una sesión CVA activa para esta conexión SSH
    {
        let cva_map = CVA_SESSIONS
            .lock()
            .map_err(|_| CommandError::internal("LOCK_POISONED", "CVA_SESSIONS lock poisoned"))?;
        if cva_map.contains_key(&session_id) {
            return Err(CommandError::permanent(
                "SESSION_ALREADY_ACTIVE",
                "Ya existe una sesión de control por gestos activa para esta conexión",
            ));
        }
    }

    // 3. Validar que la sesión SSH principal exista
    {
        let map = SESSIONS
            .lock()
            .map_err(|_| CommandError::internal("LOCK_POISONED", "SESSIONS lock poisoned"))?;
        if !map.contains_key(&session_id) {
            return Err(CommandError::from(AppError::NotFoundSession));
        }
    }

    // 4. Realizar Health Check al bridge en el puerto 8766 de la Pi 5
    check_bridge_health(&session_id, DEFAULT_CVA_BRIDGE_PORT).await?;

    // 5. Iniciar túnel de port forwarding (reutilizando el motor de stream_start)
    let actual_port = match stream_start(session_id.clone(), DEFAULT_CVA_BRIDGE_PORT, DEFAULT_CVA_BRIDGE_PORT).await {
        Ok(port) => port,
        Err(err) => {
            return Err(CommandError::transient(
                "BRIDGE_UNAVAILABLE",
                format!("Falló la apertura del túnel al bridge de CVA: {}", err.message),
            ));
        }
    };

    // 6. Registrar sesión CVA activa
    let cva_session = CvaGestureSession {
        session_id: session_id.clone(),
        module_id,
        bridge_port: actual_port,
        active: true,
    };

    {
        let mut cva_map = CVA_SESSIONS
            .lock()
            .map_err(|_| CommandError::internal("LOCK_POISONED", "CVA_SESSIONS lock poisoned"))?;
        cva_map.insert(session_id, cva_session.clone());
    }

    Ok(cva_session)
}

#[tauri::command]
pub async fn cva_gestures_session_stop(session_id: String) -> Result<(), CommandError> {
    // 1. Validar que la sesión SSH principal exista
    {
        let map = SESSIONS
            .lock()
            .map_err(|_| CommandError::internal("LOCK_POISONED", "SESSIONS lock poisoned"))?;
        if !map.contains_key(&session_id) {
            return Err(CommandError::from(AppError::NotFoundSession));
        }
    }

    // 2. Remover y cerrar conexión TCP persistente si existía
    {
        let mut conn_map = CVA_TCP_CONNECTIONS
            .lock()
            .map_err(|_| CommandError::internal("LOCK_POISONED", "CVA_TCP_CONNECTIONS lock poisoned"))?;
        conn_map.remove(&session_id);
    }

    // 3. Detener el túnel de stream (propagar errores sin silenciar - Principio 4)
    stream_stop(session_id.clone()).await?;

    // 4. Remover de CVA_SESSIONS y CVA_FRAME_STATS
    {
        let mut cva_map = CVA_SESSIONS
            .lock()
            .map_err(|_| CommandError::internal("LOCK_POISONED", "CVA_SESSIONS lock poisoned"))?;
        cva_map.remove(&session_id);
    }
    {
        let mut stats_map = CVA_FRAME_STATS
            .lock()
            .map_err(|_| CommandError::internal("LOCK_POISONED", "CVA_FRAME_STATS lock poisoned"))?;
        stats_map.remove(&session_id);
    }

    Ok(())
}

/// Estadísticas de transmisión de un frame de video analítica
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[ts(export)]
pub struct CvaFrameStats {
    pub bytes_sent: usize,
    pub latency_ms: u64,
    pub total_frames: u64,
    pub fps_real: f32,
}

pub static CVA_FRAME_STATS: Lazy<Mutex<HashMap<String, (u64, std::time::Instant)>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Transmite un frame de video (JPEG en base64) por la conexión TCP persistente del túnel SSH
#[tauri::command]
pub async fn cva_gestures_send_frame(
    session_id: String,
    frame_base64: String,
) -> Result<CvaFrameStats, CommandError> {
    let start_time = std::time::Instant::now();

    // 1. Validar que la sesión CVA esté registrada y activa
    let bridge_port = {
        let cva_map = CVA_SESSIONS
            .lock()
            .map_err(|_| CommandError::internal("LOCK_POISONED", "CVA_SESSIONS lock poisoned"))?;
        let sess = cva_map
            .get(&session_id)
            .ok_or_else(|| CommandError::permanent("SESSION_NOT_ACTIVE", "No hay sesión CVA activa"))?;
        sess.bridge_port
    };

    // 2. Decodificar frame base64 a bytes JPEG
    use base64::Engine;
    let frame_bytes = match base64::engine::general_purpose::STANDARD.decode(&frame_base64) {
        Ok(bytes) => bytes,
        Err(_) => {
            base64::engine::general_purpose::URL_SAFE
                .decode(&frame_base64)
                .map_err(|e| CommandError::permanent("INVALID_FRAME_DATA", format!("Base64 inválido: {e}")))?
        }
    };
    let bytes_sent = frame_bytes.len();

    // 3. Obtener o establecer la conexión TCP persistente sobre el puerto del túnel SSH
    let existing_stream = {
        let conn_map = CVA_TCP_CONNECTIONS
            .lock()
            .map_err(|_| CommandError::internal("LOCK_POISONED", "CVA_TCP_CONNECTIONS lock poisoned"))?;
        conn_map.get(&session_id).cloned()
    };

    let stream_arc = match existing_stream {
        Some(arc) => arc,
        None => {
            let addr = format!("127.0.0.1:{bridge_port}");
            let stream = TcpStream::connect(&addr).await.map_err(|e| {
                CommandError::transient(
                    "BRIDGE_UNAVAILABLE",
                    format!("Falló la conexión TCP persistente al puerto {bridge_port} del túnel CVA: {e}"),
                )
            })?;
            let arc = Arc::new(AsyncMutex::new(stream));

            let mut conn_map = CVA_TCP_CONNECTIONS
                .lock()
                .map_err(|_| CommandError::internal("LOCK_POISONED", "CVA_TCP_CONNECTIONS lock poisoned"))?;
            conn_map.insert(session_id.clone(), arc.clone());
            arc
        }
    };

    // 4. Escribir frame en el socket persistente (longitud + payload bytes) y propagar errores
    {
        let mut stream_guard = stream_arc.lock().await;
        use tokio::io::AsyncWriteExt;
        let len_bytes = (bytes_sent as u32).to_be_bytes();

        if let Err(e) = stream_guard.write_all(&len_bytes).await {
            let _ = CVA_TCP_CONNECTIONS.lock().map(|mut m| m.remove(&session_id));
            return Err(CommandError::transient(
                "TRANSMISSION_ERROR",
                format!("Error al escribir cabecera de frame en el túnel CVA: {e}"),
            ));
        }

        if let Err(e) = stream_guard.write_all(&frame_bytes).await {
            let _ = CVA_TCP_CONNECTIONS.lock().map(|mut m| m.remove(&session_id));
            return Err(CommandError::transient(
                "TRANSMISSION_ERROR",
                format!("Error al escribir payload de frame en el túnel CVA: {e}"),
            ));
        }

        if let Err(e) = stream_guard.flush().await {
            let _ = CVA_TCP_CONNECTIONS.lock().map(|mut m| m.remove(&session_id));
            return Err(CommandError::transient(
                "TRANSMISSION_ERROR",
                format!("Error al hacer flush de frame en el túnel CVA: {e}"),
            ));
        }
    }

    // 5. Actualizar estadísticas y métricas de rendimiento
    let latency_ms = start_time.elapsed().as_millis() as u64;

    let (total_frames, fps_real) = {
        let mut stats_map = CVA_FRAME_STATS
            .lock()
            .map_err(|_| CommandError::internal("LOCK_POISONED", "CVA_FRAME_STATS lock poisoned"))?;

        let entry = stats_map.entry(session_id.clone()).or_insert((0, std::time::Instant::now()));
        entry.0 += 1;
        let count = entry.0;
        let elapsed_secs = entry.1.elapsed().as_secs_f32();
        let fps = if elapsed_secs > 0.0 { count as f32 / elapsed_secs } else { 0.0 };
        (count, fps)
    };

    Ok(CvaFrameStats {
        bytes_sent,
        latency_ms,
        total_frames,
        fps_real,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cva_gesture_session_ts_export() {
        let sess = CvaGestureSession {
            session_id: "test-uuid-123".to_string(),
            module_id: "domotica".to_string(),
            bridge_port: 8766,
            active: true,
        };

        let json = serde_json::to_string(&sess).unwrap();
        assert!(json.contains("domotica"));
        assert!(json.contains("8766"));
    }

    #[test]
    fn test_cva_gesture_config_ts_export() {
        let config = CvaGestureConfig {
            enabled: true,
            min_confidence: 0.75,
            mapping: HashMap::new(),
        };

        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("enabled"));
        assert!(json.contains("0.75"));
    }

    #[test]
    fn test_validate_module_config_valid_modules() {
        let domotica = validate_module_config("domotica");
        assert!(domotica.is_ok(), "Config domotica.json debe existir y ser válida");
        let cfg = domotica.unwrap();
        assert!(cfg.enabled);
        assert_eq!(cfg.min_confidence, 0.75);

        let robot = validate_module_config("robot");
        assert!(robot.is_ok(), "Config robot.json debe existir y ser válida");
        let cfg_robot = robot.unwrap();
        assert!(cfg_robot.enabled);
    }

    #[test]
    fn test_validate_module_config_missing_file() {
        let res = validate_module_config("modulo_inexistente_999");
        assert!(res.is_err());
        let err = res.err().unwrap();
        assert_eq!(err.code, "CONFIG_NOT_FOUND");
    }

    fn get_cva_config_test_dir() -> PathBuf {
        if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
            let path = Path::new(&manifest_dir).join("../config/cva-gestures");
            if path.exists() {
                return path;
            }
        }
        let rel_path = PathBuf::from("config/cva-gestures");
        if rel_path.exists() {
            return rel_path;
        }
        PathBuf::from("../config/cva-gestures")
    }

    #[test]
    fn test_validate_module_config_disabled_module() {
        let config_dir = get_cva_config_test_dir();
        let disabled_file = config_dir.join("disabled_test_fixture.json");
        let _ = std::fs::write(&disabled_file, r#"{"enabled": false, "min_confidence": 0.5, "mapping": {}}"#);

        let res = validate_module_config("disabled_test_fixture");
        let _ = std::fs::remove_file(&disabled_file);

        assert!(res.is_err());
        let err = res.err().unwrap();
        assert_eq!(err.code, "CONFIG_NOT_FOUND");
        assert!(err.message.contains("deshabilitado"));
    }

    #[test]
    fn test_validate_module_config_invalid_json() {
        let config_dir = get_cva_config_test_dir();
        let invalid_file = config_dir.join("invalid_json_test_fixture.json");
        let _ = std::fs::write(&invalid_file, r#"{"enabled": true, invalid_json_syntax...}"#);

        let res = validate_module_config("invalid_json_test_fixture");
        let _ = std::fs::remove_file(&invalid_file);

        assert!(res.is_err());
        let err = res.err().unwrap();
        assert_eq!(err.code, "CONFIG_NOT_FOUND");
        assert!(err.message.contains("No se encontró o es inválida"));
    }

    #[tokio::test]
    async fn test_cva_start_session_not_found_error() {
        let res = cva_gestures_session_start("sess-inexistente-123".to_string(), "domotica".to_string()).await;
        assert!(res.is_err());
        let err = res.err().unwrap();
        assert_eq!(err.code, "SESSION_EXPIRED");
    }

    #[tokio::test]
    async fn test_cva_start_invalid_module_config_error() {
        let res = cva_gestures_session_start("sess-any".to_string(), "modulo_inexistente_abc".to_string()).await;
        assert!(res.is_err());
        let err = res.err().unwrap();
        assert_eq!(err.code, "CONFIG_NOT_FOUND");
    }

    #[tokio::test]
    async fn test_cva_start_session_already_active_error() {
        let session_id = "test-session-already-active".to_string();

        // Insertar manualmente una sesión en CVA_SESSIONS para simular que ya está activa
        {
            let mut cva_map = CVA_SESSIONS.lock().unwrap();
            cva_map.insert(
                session_id.clone(),
                CvaGestureSession {
                    session_id: session_id.clone(),
                    module_id: "domotica".to_string(),
                    bridge_port: 8766,
                    active: true,
                },
            );
        }

        let res = cva_gestures_session_start(session_id.clone(), "domotica".to_string()).await;
        assert!(res.is_err());
        let err = res.err().unwrap();
        assert_eq!(err.code, "SESSION_ALREADY_ACTIVE");

        // Limpiar después de la prueba
        {
            let mut cva_map = CVA_SESSIONS.lock().unwrap();
            cva_map.remove(&session_id);
        }
    }

    #[tokio::test]
    async fn test_cva_stop_session_not_found_error() {
        let res = cva_gestures_session_stop("sess-inexistente-stop".to_string()).await;
        assert!(res.is_err());
        let err = res.err().unwrap();
        assert_eq!(err.code, "SESSION_EXPIRED");
    }

    #[tokio::test]
    async fn test_cva_send_frame_no_session_error() {
        let res = cva_gestures_send_frame("sess-inexistente-frame".to_string(), "aGVsbG8=".to_string()).await;
        assert!(res.is_err());
        let err = res.err().unwrap();
        assert_eq!(err.code, "SESSION_NOT_ACTIVE");
    }

    #[tokio::test]
    async fn test_cva_send_frame_invalid_base64_error() {
        let session_id = "test-session-send-frame-invalid".to_string();
        {
            let mut cva_map = CVA_SESSIONS.lock().unwrap();
            cva_map.insert(
                session_id.clone(),
                CvaGestureSession {
                    session_id: session_id.clone(),
                    module_id: "domotica".to_string(),
                    bridge_port: 8766,
                    active: true,
                },
            );
        }

        let res = cva_gestures_send_frame(session_id.clone(), "!!!invalid-base64!!!".to_string()).await;

        {
            let mut cva_map = CVA_SESSIONS.lock().unwrap();
            cva_map.remove(&session_id);
        }

        assert!(res.is_err());
        let err = res.err().unwrap();
        assert_eq!(err.code, "INVALID_FRAME_DATA");
    }

    #[tokio::test]
    async fn test_cva_send_frame_success_with_real_listener() {
        // 1. Crear un TcpListener local en un puerto efímero libre
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let test_port = listener.local_addr().unwrap().port();

        let session_id = "test-session-send-frame-real-listener".to_string();

        // 2. Registrar la sesión CVA apuntando a test_port
        {
            let mut cva_map = CVA_SESSIONS.lock().unwrap();
            cva_map.insert(
                session_id.clone(),
                CvaGestureSession {
                    session_id: session_id.clone(),
                    module_id: "domotica".to_string(),
                    bridge_port: test_port,
                    active: true,
                },
            );
        }

        // 3. Task en background que acepta el socket y recibe los bytes
        let rx_handle = tokio::spawn(async move {
            use tokio::io::AsyncReadExt;
            let (mut socket, _) = listener.accept().await.unwrap();

            // Leer longitud 4-bytes u32
            let mut len_buf = [0u8; 4];
            socket.read_exact(&mut len_buf).await.unwrap();
            let frame_len = u32::from_be_bytes(len_buf) as usize;

            // Leer payload bytes
            let mut payload = vec![0u8; frame_len];
            socket.read_exact(&mut payload).await.unwrap();

            (frame_len, payload)
        });

        // "aGVsbG8=" = "hello" (5 bytes)
        let res = cva_gestures_send_frame(session_id.clone(), "aGVsbG8=".to_string()).await;

        // 4. Esperar que el listener haya recibido los datos reales
        let (rx_len, rx_payload) = rx_handle.await.unwrap();

        // Limpieza
        {
            let mut cva_map = CVA_SESSIONS.lock().unwrap();
            cva_map.remove(&session_id);
            let mut conn_map = CVA_TCP_CONNECTIONS.lock().unwrap();
            conn_map.remove(&session_id);
            let mut stats_map = CVA_FRAME_STATS.lock().unwrap();
            stats_map.remove(&session_id);
        }

        // Verificaciones
        assert!(res.is_ok());
        let stats = res.unwrap();
        assert_eq!(stats.bytes_sent, 5);
        assert_eq!(stats.total_frames, 1);
        assert_eq!(rx_len, 5);
        assert_eq!(rx_payload, b"hello");
    }
}



