//! `RedisSessionManager` — esqueleto para un backend compartido entre
//! instancias (despliegues multi-proceso / multi-nodo).
//!
//! **Estado:** no implementado. Todas las operaciones retornan
//! `SessionError::Internal("Redis backend not implemented yet")`.
//! Se deja como stub para que el trait `SessionManager` ya tenga un segundo
//! implementador y así detectar en compilación cualquier acoplamiento
//! accidental a `InMemorySessionManager` en el resto del código.

use std::time::Instant;

use super::{GcResult, SessionBackendType, SessionError, SessionManager};
use crate::state_core::auth_state::{AuthSessionInfo, TokenBundle};
use crate::state_core::session::{SessionMem, SessionMemPatch};

const NOT_IMPLEMENTED: &str = "Redis backend not implemented yet";

pub struct RedisSessionManager {
    url: String,
    // TODO(sprint futuro): pool de conexiones redis (p.ej. `deadpool-redis`).
}

impl RedisSessionManager {
    pub fn new(url: impl Into<String>) -> Self {
        Self { url: url.into() }
    }
}

#[async_trait::async_trait]
impl SessionManager for RedisSessionManager {
    async fn put_session_patch(&self, _session_id: &str, _patch: SessionMemPatch) -> Result<(), SessionError> {
        Err(SessionError::Internal(NOT_IMPLEMENTED.to_string()))
    }

    async fn get_session(&self, _session_id: &str) -> Result<Option<SessionMem>, SessionError> {
        Err(SessionError::Internal(NOT_IMPLEMENTED.to_string()))
    }

    async fn delete_session(&self, _session_id: &str) -> Result<(), SessionError> {
        Err(SessionError::Internal(NOT_IMPLEMENTED.to_string()))
    }

    async fn list_active_sessions(&self) -> Result<Vec<String>, SessionError> {
        Err(SessionError::Internal(NOT_IMPLEMENTED.to_string()))
    }

    async fn store_auth(&self, _bundle: TokenBundle) -> Result<(), SessionError> {
        Err(SessionError::Internal(NOT_IMPLEMENTED.to_string()))
    }

    async fn clear_auth(&self) -> Result<(), SessionError> {
        Err(SessionError::Internal(NOT_IMPLEMENTED.to_string()))
    }

    async fn get_access_token(&self) -> Result<Option<String>, SessionError> {
        Err(SessionError::Internal(NOT_IMPLEMENTED.to_string()))
    }

    async fn get_refresh_token(&self) -> Result<Option<String>, SessionError> {
        Err(SessionError::Internal(NOT_IMPLEMENTED.to_string()))
    }

    async fn get_refresh_info(&self) -> Result<Option<(String, Instant)>, SessionError> {
        Err(SessionError::Internal(NOT_IMPLEMENTED.to_string()))
    }

    async fn is_authenticated(&self) -> Result<bool, SessionError> {
        Err(SessionError::Internal(NOT_IMPLEMENTED.to_string()))
    }

    async fn session_info(&self) -> Result<Option<AuthSessionInfo>, SessionError> {
        Err(SessionError::Internal(NOT_IMPLEMENTED.to_string()))
    }

    async fn needs_refresh(&self) -> Result<bool, SessionError> {
        Err(SessionError::Internal(NOT_IMPLEMENTED.to_string()))
    }

    async fn set_pending_verifier(&self, _verifier: String) -> Result<(), SessionError> {
        Err(SessionError::Internal(NOT_IMPLEMENTED.to_string()))
    }

    async fn take_pending_verifier(&self) -> Result<Option<String>, SessionError> {
        Err(SessionError::Internal(NOT_IMPLEMENTED.to_string()))
    }

    async fn gc(&self) -> Result<GcResult, SessionError> {
        Err(SessionError::Internal(NOT_IMPLEMENTED.to_string()))
    }

    fn backend_type(&self) -> SessionBackendType {
        SessionBackendType::Redis { url: self.url.clone() }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_redis_stub_returns_not_implemented() {
        let manager = RedisSessionManager::new("redis://localhost:6379");
        let err = manager.get_session("any").await.unwrap_err();
        assert_eq!(err, SessionError::Internal(NOT_IMPLEMENTED.to_string()));

        matches!(manager.backend_type(), SessionBackendType::Redis { .. });
    }
}
