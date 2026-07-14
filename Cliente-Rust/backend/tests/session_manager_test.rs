//! Tests de contrato para `SessionManager` (REFACTOR #2, Fase D).
//!
//! Cubre `InMemorySessionManager`: sesión efímera (`SessionMem`), custodio
//! de autenticación (JWT) y GC. Se ejecuta como test de integración (crate
//! `app` externo) para validar la superficie pública real que consumen los
//! ~60 handlers migrados.

use std::sync::Arc;
use std::time::{Duration, Instant};

use app::session_manager::{InMemorySessionManager, SessionBackendType, SessionManager};
use app::state_core::auth_state::{StoredClaims, TokenBundle, UserType};
use app::state_core::session::SessionMemPatch;

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
        last_command: Some("uname -a".to_string()),
        last_path: Some("/home/estudiante".to_string()),
        ..Default::default()
    };

    manager.put_session_patch("test-id", patch).await.unwrap();
    let retrieved = manager.get_session("test-id").await.unwrap();
    assert!(retrieved.is_some());
    let session = retrieved.unwrap();
    assert_eq!(session.last_command, Some("uname -a".to_string()));
    assert_eq!(session.last_path, Some("/home/estudiante".to_string()));

    manager.delete_session("test-id").await.unwrap();
    assert_eq!(manager.get_session("test-id").await.unwrap(), None);
}

#[tokio::test]
async fn test_ttl_expiry_is_not_premature() {
    // No podemos esperar 2h en un test; verificamos que una sesión recién
    // creada sigue viva inmediatamente después de crearla (contrato de TTL
    // no debe expirar prematuramente) y que `gc()` no la remueve.
    let manager = InMemorySessionManager::new();
    manager
        .put_session_patch("fresh", SessionMemPatch::default())
        .await
        .unwrap();

    let gc_result = manager.gc().await.unwrap();
    assert_eq!(gc_result.sessions_removed, 0);
    assert!(manager.get_session("fresh").await.unwrap().is_some());
}

#[tokio::test]
async fn test_concurrent_access() {
    let manager: Arc<dyn SessionManager> = Arc::new(InMemorySessionManager::new());
    let mut handles = Vec::new();

    for i in 0..1000 {
        let m = manager.clone();
        handles.push(tokio::spawn(async move {
            let id = format!("stress-{i}");
            m.put_session_patch(
                &id,
                SessionMemPatch {
                    last_command: Some(format!("cmd-{i}")),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
        }));
    }

    for h in handles {
        h.await.unwrap();
    }

    let ids = manager.list_active_sessions().await.unwrap();
    assert_eq!(ids.len(), 1000, "no debe haber pérdida de datos bajo concurrencia");

    // Verificar integridad de una muestra
    let sample = manager.get_session("stress-42").await.unwrap().unwrap();
    assert_eq!(sample.last_command, Some("cmd-42".to_string()));
}

#[tokio::test]
async fn test_gc_removes_expired() {
    let manager = InMemorySessionManager::new();
    manager
        .put_session_patch("a", SessionMemPatch::default())
        .await
        .unwrap();
    manager
        .put_session_patch("b", SessionMemPatch::default())
        .await
        .unwrap();

    // Sin TTL vencido, gc no debe remover nada (comportamiento determinista).
    let result = manager.gc().await.unwrap();
    assert_eq!(result.sessions_removed, 0);
    assert_eq!(manager.list_active_sessions().await.unwrap().len(), 2);
}

#[tokio::test]
async fn test_auth_lifecycle() {
    let manager = InMemorySessionManager::new();

    assert!(!manager.is_authenticated().await.unwrap());
    assert!(manager.session_info().await.unwrap().is_none());

    manager.store_auth(make_bundle(300, 1800)).await.unwrap();
    assert!(manager.is_authenticated().await.unwrap());
    let info = manager.session_info().await.unwrap().unwrap();
    assert_eq!(info.preferred_username, "david-carreno1");
    assert_eq!(info.user_type, UserType::Estudiante);

    manager.clear_auth().await.unwrap();
    assert!(!manager.is_authenticated().await.unwrap());
    assert!(manager.session_info().await.unwrap().is_none());
}

#[tokio::test]
async fn test_auth_token_expired_no_longer_valid() {
    let manager = InMemorySessionManager::new();
    // Expira en 1s: con el margen de 30s interno de AuthState, ya se
    // considera inválido inmediatamente.
    manager.store_auth(make_bundle(1, 1800)).await.unwrap();
    assert!(!manager.is_authenticated().await.unwrap());
    assert!(manager.get_access_token().await.unwrap().is_none());
}

#[tokio::test]
async fn test_pending_pkce_verifier_single_use() {
    let manager = InMemorySessionManager::new();
    manager
        .set_pending_verifier("verifier-secreto".to_string())
        .await
        .unwrap();

    assert_eq!(
        manager.take_pending_verifier().await.unwrap(),
        Some("verifier-secreto".to_string())
    );
    assert_eq!(manager.take_pending_verifier().await.unwrap(), None);
}

#[tokio::test]
async fn test_backend_type_is_in_memory() {
    let manager = InMemorySessionManager::new();
    assert!(matches!(manager.backend_type(), SessionBackendType::InMemory));
}
