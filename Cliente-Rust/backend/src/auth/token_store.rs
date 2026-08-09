//! # `auth::token_store` — Persistencia cifrada del refresh_token
//!
//! Permite retomar la sesión entre reinicios de la app: guarda **solo** el
//! `refresh_token` (nunca el access_token, que vive 5 min y no aporta nada
//! persistido) cifrado en disco con el mismo patrón de `storage.rs` (clave
//! maestra en el llavero del sistema + ChaCha20-Poly1305).
//!
//! `AuthState` sigue siendo el único custodio del access_token en memoria
//! (ver `state_core::auth_state`); este módulo solo resuelve "¿tengo un
//! refresh_token utilizable de una sesión anterior?" al arrancar el proceso.

use anyhow::{anyhow, Context};
use directories::ProjectDirs;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::storage::{decrypt_with_master, encrypt_with_master};

const SESSION_SUBDIR: &str = "session";
const SESSION_FILE: &str = "session.json.enc";

fn session_file_path() -> anyhow::Result<PathBuf> {
    let proj = ProjectDirs::from("com", "example", "ssh-ai-client")
        .context("cannot determine project dir")?;
    let dir = proj.data_dir().join(SESSION_SUBDIR);
    fs::create_dir_all(&dir).context("create session storage dir")?;
    Ok(dir.join(SESSION_FILE))
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Guarda el refresh_token cifrado, reemplazando cualquier sesión persistida anterior.
pub fn save_refresh_token(refresh_token: &str, refresh_expires_at_unix: i64) -> anyhow::Result<()> {
    let path = session_file_path()?;
    let payload = serde_json::json!({
        "refresh_token": refresh_token,
        "refresh_expires_at_unix": refresh_expires_at_unix,
    });
    let blob = encrypt_with_master(&serde_json::to_vec(&payload)?)?;
    fs::write(path, serde_json::to_vec(&blob)?)?;
    Ok(())
}

/// Carga el refresh_token persistido si existe y no ha vencido.
/// Si el archivo existe pero ya venció, lo borra y retorna `None`.
pub fn load_refresh_token() -> anyhow::Result<Option<(String, i64)>> {
    let path = session_file_path()?;
    if !path.exists() {
        return Ok(None);
    }

    let data = fs::read_to_string(&path)?;
    let blob: serde_json::Value = serde_json::from_str(&data)?;
    let plain = decrypt_with_master(&blob)?;
    let payload: serde_json::Value = serde_json::from_slice(&plain)?;

    let refresh_token = payload
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("missing refresh_token in persisted session"))?
        .to_string();
    let refresh_expires_at_unix = payload
        .get("refresh_expires_at_unix")
        .and_then(|v| v.as_i64())
        .ok_or_else(|| anyhow!("missing refresh_expires_at_unix in persisted session"))?;

    if refresh_expires_at_unix <= now_unix() {
        let _ = fs::remove_file(&path);
        return Ok(None);
    }

    Ok(Some((refresh_token, refresh_expires_at_unix)))
}

/// Borra la sesión persistida (logout, o refresh_token rechazado por Keycloak).
pub fn clear_refresh_token() -> anyhow::Result<()> {
    let path = session_file_path()?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}
