//! Test de integración: flujo de una sesión SSH usando `SessionManager`
//! (REFACTOR #2, Fase D).
//!
//! Nota de alcance: los comandos Tauri (`ssh_connect`, `ssh_disconnect`, etc.)
//! requieren un `tauri::AppHandle` real/mockeado que este proyecto no
//! instrumenta todavía (no hay dependencia de `tauri = { features = ["test"] }`).
//! Este test valida el mismo ciclo de vida que esos comandos ejecutan sobre
//! el `SessionManager` (limpiar la memoria efímera al conectar, poblarla
//! durante la sesión, y liberarla al desconectar), reproduciendo exactamente
//! las llamadas que `cmd::ssh::terminal::ssh_connect_impl` /
//! `ssh_disconnect_impl` hacen sobre el store único.

use std::sync::Arc;

use app::session_manager::{InMemorySessionManager, SessionManager};
use app::state_core::session::SessionMemPatch;

#[tokio::test]
async fn test_ssh_session_flow() {
    let manager: Arc<dyn SessionManager> = Arc::new(InMemorySessionManager::new());
    let session_id = "ssh-flow-test-id".to_string();

    // 1. `ssh_connect_impl` limpia cualquier residuo antes de conectar.
    manager.delete_session(&session_id).await.unwrap();
    assert!(manager.get_session(&session_id).await.unwrap().is_none());

    // 2. Durante la sesión, el terminal/IA registran contexto (cwd, último comando).
    manager
        .put_session_patch(
            &session_id,
            SessionMemPatch {
                env_cwd: Some("/home/estudiante".to_string()),
                last_command: Some("ls -la".to_string()),
                last_stdout_tail: Some("total 0\ndrwxr-xr-x ...".to_string()),
                last_exit_code: Some(0),
                ..Default::default()
            },
        )
        .await
        .unwrap();

    // 3. Verificar que la sesión existe en el manager con el contexto esperado.
    let active = manager.list_active_sessions().await.unwrap();
    assert!(active.contains(&session_id));

    let stored = manager.get_session(&session_id).await.unwrap().unwrap();
    assert_eq!(stored.env_cwd, Some("/home/estudiante".to_string()));
    assert_eq!(stored.last_command, Some("ls -la".to_string()));
    assert_eq!(stored.last_exit_code, Some(0));

    // 4. `ssh_disconnect_impl` libera la sesión al desconectar.
    manager.delete_session(&session_id).await.unwrap();

    // 5. Verificar limpieza: la sesión ya no existe.
    assert!(manager.get_session(&session_id).await.unwrap().is_none());
    assert!(!manager
        .list_active_sessions()
        .await
        .unwrap()
        .contains(&session_id));
}

#[tokio::test]
async fn test_auth_flow_login_then_logout() {
    use app::state_core::auth_state::{StoredClaims, TokenBundle, UserType};
    use std::time::{Duration, Instant};

    let manager: Arc<dyn SessionManager> = Arc::new(InMemorySessionManager::new());

    // 1. Inicio de login: se guarda el verifier PKCE pendiente.
    manager
        .set_pending_verifier("pkce-verifier-abc".to_string())
        .await
        .unwrap();

    // 2. Callback OAuth: se consume el verifier (una sola vez) y se emite el bundle.
    let verifier = manager.take_pending_verifier().await.unwrap();
    assert_eq!(verifier, Some("pkce-verifier-abc".to_string()));

    let bundle = TokenBundle {
        access_token: "eyJ.fake.access".to_string(),
        refresh_token: "eyJ.fake.refresh".to_string(),
        access_expires_at: Instant::now() + Duration::from_secs(300),
        refresh_expires_at: Instant::now() + Duration::from_secs(1800),
        claims: StoredClaims {
            sub: "sub-123".to_string(),
            preferred_username: "estudiante1".to_string(),
            name: "Estudiante Uno".to_string(),
            email: "estudiante1@upc.edu.co".to_string(),
            user_type: UserType::Estudiante,
            roles: vec!["estudiante".to_string()],
            exp: 9999999999,
            sid: "sid-123".to_string(),
        },
    };
    manager.store_auth(bundle).await.unwrap();

    // 3. La sesión queda activa y visible para el frontend.
    assert!(manager.is_authenticated().await.unwrap());
    let info = manager.session_info().await.unwrap().unwrap();
    assert_eq!(info.preferred_username, "estudiante1");

    // 4. Logout: se limpia el custodio de auth.
    manager.clear_auth().await.unwrap();
    assert!(!manager.is_authenticated().await.unwrap());
    assert!(manager.session_info().await.unwrap().is_none());
}
