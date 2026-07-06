//! # `auth::commands` — Comandos Tauri del Módulo de Autenticación
//!
//! Expone al frontend los puntos de entrada del flujo OAuth 2.1 mediante
//! Tauri `invoke()`. El frontend NUNCA manipula el token directamente
//! (AUTH_SPEC §4).
//!
//! ## Comandos planificados
//!
//! | Comando Tauri         | Descripción                                                       |
//! |-----------------------|-------------------------------------------------------------------|
//! | `auth_login_url`      | Inicia el flujo: genera PKCE, levanta CallbackServer, retorna URL |
//! | `auth_exchange_code`  | Interno (no expuesto al frontend; lo llama el callback handler)   |
//! | `auth_status`         | Retorna `AuthSessionInfo` (username, user_type, exp) o `None`     |
//! | `auth_logout`         | Revoca el token en Keycloak y limpia `AuthState`                  |
//! | `auth_refresh`        | Renueva el access_token silenciosamente usando el refresh_token   |
//!
//! Su implementación completa se realizará en la Fase 2.

// TODO (Fase 2): Registrar los comandos en lib.rs dentro de generate_handler![]
//   #[tauri::command] pub async fn auth_login_url(...) -> Result<String, String>
//   #[tauri::command] pub async fn auth_status(...) -> Option<AuthSessionInfo>
//   #[tauri::command] pub async fn auth_logout(...) -> Result<(), String>
//   #[tauri::command] pub async fn auth_refresh(...) -> Result<(), String>
