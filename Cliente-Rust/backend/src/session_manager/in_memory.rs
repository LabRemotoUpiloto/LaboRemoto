//! `InMemorySessionManager` — backend por defecto (proceso único, sin
//! persistencia ni compartición entre instancias).
//!
//! Internamente compone (no reescribe) la lógica ya probada de
//! `state_core::session::AppState` (HashMap + TTL para `SessionMem`) y
//! `state_core::auth_state::AuthState` (custodio del JWT). Esto preserva el
//! comportamiento exacto que ya cubren los tests unitarios de esos módulos.

use std::time::Instant;

use super::{GcResult, SessionBackendType, SessionError, SessionManager};
use crate::state_core::auth_state::{AuthSessionInfo, AuthState, TokenBundle};
use crate::state_core::session::{AppState, SessionMem, SessionMemPatch};

pub struct InMemorySessionManager {
    sessions: AppState,
    auth: AuthState,
}

impl InMemorySessionManager {
    pub fn new() -> Self {
        Self {
            sessions: AppState::new(),
            auth: AuthState::new(),
        }
    }
}

impl Default for InMemorySessionManager {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl SessionManager for InMemorySessionManager {
    async fn put_session_patch(&self, session_id: &str, patch: SessionMemPatch) -> Result<(), SessionError> {
        self.sessions.put_patch(session_id, patch);
        Ok(())
    }

    async fn get_session(&self, session_id: &str) -> Result<Option<SessionMem>, SessionError> {
        Ok(self.sessions.get(session_id))
    }

    async fn delete_session(&self, session_id: &str) -> Result<(), SessionError> {
        self.sessions.clear(session_id);
        Ok(())
    }

    async fn list_active_sessions(&self) -> Result<Vec<String>, SessionError> {
        Ok(self.sessions.list_ids())
    }

    async fn store_auth(&self, bundle: TokenBundle) -> Result<(), SessionError> {
        self.auth.store(bundle);
        Ok(())
    }

    async fn clear_auth(&self) -> Result<(), SessionError> {
        self.auth.clear();
        Ok(())
    }

    async fn get_access_token(&self) -> Result<Option<String>, SessionError> {
        Ok(self.auth.get_access_token())
    }

    async fn get_refresh_token(&self) -> Result<Option<String>, SessionError> {
        Ok(self.auth.get_refresh_token())
    }

    async fn get_refresh_info(&self) -> Result<Option<(String, Instant)>, SessionError> {
        Ok(self.auth.get_refresh_info())
    }

    async fn is_authenticated(&self) -> Result<bool, SessionError> {
        Ok(self.auth.is_authenticated())
    }

    async fn session_info(&self) -> Result<Option<AuthSessionInfo>, SessionError> {
        Ok(self.auth.session_info())
    }

    async fn needs_refresh(&self) -> Result<bool, SessionError> {
        Ok(self.auth.needs_refresh())
    }

    async fn set_pending_verifier(&self, verifier: String) -> Result<(), SessionError> {
        self.auth.set_pending_verifier(verifier);
        Ok(())
    }

    async fn take_pending_verifier(&self) -> Result<Option<String>, SessionError> {
        Ok(self.auth.take_pending_verifier())
    }

    async fn gc(&self) -> Result<GcResult, SessionError> {
        let before = self.sessions.len();
        self.sessions.gc();
        let after = self.sessions.len();
        Ok(GcResult {
            sessions_removed: before.saturating_sub(after),
            bytes_freed: 0,
        })
    }

    fn backend_type(&self) -> SessionBackendType {
        SessionBackendType::InMemory
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state_core::auth_state::{StoredClaims, UserType};
    use std::time::Duration;

    fn make_bundle(access_secs: u64, refresh_secs: u64) -> TokenBundle {
        TokenBundle {
            access_token: "eyJ.fake.access".to_string(),
            refresh_token: "eyJ.fake.refresh".to_string(),
            access_expires_at: Instant::now() + Duration::from_secs(access_secs),
            refresh_expires_at: Instant::now() + Duration::from_secs(refresh_secs),
            claims: StoredClaims {
                sub: "d66688b1-e8b7-4c88-97c8-3458be291d89".to_string(),
                preferred_username: "david-carreno1".to_string(),
                name: "DAVID ALEJANDRO CARREÑO PARRA".to_string(),
                email: "david-carreno1@upc.edu.co".to_string(),
                user_type: UserType::Estudiante,
                roles: vec!["estudiante".to_string()],
                exp: 9999999999,
                sid: "e9c14877-a4f4-4816-b8b4-45f9ac1756c7".to_string(),
            },
        }
    }

    #[tokio::test]
    async fn test_put_get_delete_session() {
        let manager = InMemorySessionManager::new();
        let patch = SessionMemPatch {
            last_command: Some("ls -la".to_string()),
            ..Default::default()
        };

        manager.put_session_patch("test-id", patch).await.unwrap();
        let retrieved = manager.get_session("test-id").await.unwrap();
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().last_command, Some("ls -la".to_string()));

        manager.delete_session("test-id").await.unwrap();
        assert_eq!(manager.get_session("test-id").await.unwrap(), None);
    }

    #[tokio::test]
    async fn test_list_active_sessions() {
        let manager = InMemorySessionManager::new();
        manager.put_session_patch("a", SessionMemPatch::default()).await.unwrap();
        manager.put_session_patch("b", SessionMemPatch::default()).await.unwrap();

        let mut ids = manager.list_active_sessions().await.unwrap();
        ids.sort();
        assert_eq!(ids, vec!["a".to_string(), "b".to_string()]);
    }

    #[tokio::test]
    async fn test_gc_removes_expired() {
        let manager = InMemorySessionManager::new();
        manager.put_session_patch("only", SessionMemPatch::default()).await.unwrap();

        // Nada expiró todavía (TTL de 2h): gc no debería remover nada.
        let result = manager.gc().await.unwrap();
        assert_eq!(result.sessions_removed, 0);
        assert!(manager.get_session("only").await.unwrap().is_some());
    }

    #[tokio::test]
    async fn test_concurrent_access() {
        use std::sync::Arc;
        let manager: Arc<dyn SessionManager> = Arc::new(InMemorySessionManager::new());
        let mut handles = Vec::new();

        for i in 0..200 {
            let m = manager.clone();
            handles.push(tokio::spawn(async move {
                let id = format!("session-{i}");
                m.put_session_patch(&id, SessionMemPatch {
                    last_command: Some(format!("cmd-{i}")),
                    ..Default::default()
                }).await.unwrap();
                let got = m.get_session(&id).await.unwrap();
                assert!(got.is_some());
            }));
        }

        for h in handles {
            h.await.unwrap();
        }

        let ids = manager.list_active_sessions().await.unwrap();
        assert_eq!(ids.len(), 200);
    }

    #[tokio::test]
    async fn test_auth_store_and_get_access_token() {
        let manager = InMemorySessionManager::new();
        assert!(!manager.is_authenticated().await.unwrap());

        manager.store_auth(make_bundle(300, 1800)).await.unwrap();
        assert!(manager.is_authenticated().await.unwrap());
        assert!(manager.get_access_token().await.unwrap().is_some());

        manager.clear_auth().await.unwrap();
        assert!(!manager.is_authenticated().await.unwrap());
    }

    #[tokio::test]
    async fn test_pending_verifier_single_use() {
        let manager = InMemorySessionManager::new();
        manager.set_pending_verifier("verifier-secreto".to_string()).await.unwrap();
        assert_eq!(
            manager.take_pending_verifier().await.unwrap(),
            Some("verifier-secreto".to_string())
        );
        assert_eq!(manager.take_pending_verifier().await.unwrap(), None);
    }

    fn _assert_backend_type(manager: &InMemorySessionManager) {
        matches!(manager.backend_type(), SessionBackendType::InMemory);
    }
}
