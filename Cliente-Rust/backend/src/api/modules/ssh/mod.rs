use std::sync::{Arc, Mutex};
use std::sync::atomic::AtomicBool;
use std::collections::VecDeque;
use axum::{Json, extract::Path};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::api::error::ApiError;
use crate::cmd::state::SESSIONS;
use crate::ssh_core::client::Session;

#[derive(Deserialize)]
pub struct CreateSessionRequest {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub cols: Option<u32>,
    pub rows: Option<u32>,
}

#[derive(Serialize)]
pub struct CreateSessionResponse {
    pub session_id: String,
    pub status: String,
}

#[derive(Serialize)]
pub struct SessionInfoResponse {
    pub session_id: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub status: String,
}

pub async fn create_session(
    Json(payload): Json<CreateSessionRequest>,
) -> Result<Json<CreateSessionResponse>, ApiError> {
    let cols = payload.cols.unwrap_or(120);
    let rows = payload.rows.unwrap_or(32);

    let (session, rx_out) = Session::connect_password(
        &payload.host, payload.port, &payload.user, &payload.password, cols, rows
    )
    .await
    .map_err(|e| ApiError::bad_request(format!("Error SSH: {e}")))?;

    let id = Uuid::new_v4().to_string();
    let id_spawn = id.clone();

    {
        let mut map = SESSIONS.lock().map_err(|_| ApiError::internal("Error de bloqueo"))?;
        map.insert(id.clone(), crate::cmd::state::SessionExt {
            term: session,
            host: payload.host.clone(),
            port: payload.port,
            user: payload.user.clone(),
            password: payload.password.clone(),
            sftp_cached: None,
            out_buffer: Arc::new(Mutex::new(Some(String::new()))),
            ui_ready: Arc::new(AtomicBool::new(true)),
            current_dir: None,
            vnc_session: None,
            stream_stop_flag: None,
            stream_local_port: None,
            terminal_buf: Arc::new(Mutex::new(VecDeque::with_capacity(300))),
        });
    }

    // Recibir salida en background (descartamos para REST, el buffer circular retiene lo último)
    tokio::spawn(async move {
        let mut rx = rx_out;
        while let Some(buf) = rx.recv().await {
            let s = String::from_utf8_lossy(&buf).into_owned();
            if let Ok(map) = SESSIONS.lock() {
                if let Some(sess) = map.get(&id_spawn) {
                    if let Ok(mut q) = sess.terminal_buf.lock() {
                        if q.len() >= 300 { q.pop_front(); }
                        q.push_back(s);
                    }
                }
            }
        }
    });

    Ok(Json(CreateSessionResponse {
        session_id: id,
        status: "connected".into(),
    }))
}

pub async fn get_session(Path(id): Path<String>) -> Result<Json<SessionInfoResponse>, ApiError> {
    let map = SESSIONS.lock().map_err(|_| ApiError::internal("Error de bloqueo"))?;
    let sess = map.get(&id).ok_or_else(|| ApiError::not_found("Sesión no encontrada"))?;
    Ok(Json(SessionInfoResponse {
        session_id: id,
        host: sess.host.clone(),
        port: sess.port,
        user: sess.user.clone(),
        status: "active".into(),
    }))
}

pub async fn delete_session(Path(id): Path<String>) -> Result<Json<serde_json::Value>, ApiError> {
    let session = {
        let mut map = SESSIONS.lock().map_err(|_| ApiError::internal("Error de bloqueo"))?;
        map.remove(&id).ok_or_else(|| ApiError::not_found("Sesión no encontrada"))?
    };
    let _ = session.term.tx.send(crate::ssh_core::client::ChanCmd::Close);
    Ok(Json(serde_json::json!({ "status": "disconnected", "session_id": id })))
}
