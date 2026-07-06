//! # `auth::callback` — Servidor Loopback Efímero (AUTH_SPEC §3, pasos 2–6)
//!
//! Levanta un servidor HTTP temporal en `127.0.0.1:0` (puerto asignado
//! dinámicamente por el OS) para capturar el `?code=` del redirect de Keycloak.
//!
//! ## Ciclo de vida
//! 1. `CallbackServer::spawn()` — abre un `TcpListener::bind("127.0.0.1:0")`,
//!    obtiene el puerto asignado, arranca un Router Axum mínimo con una sola ruta
//!    `GET /callback` y retorna `(redirect_uri, code_receiver)`.
//! 2. El handler captura `?code=` y lo envía por un canal `oneshot`.
//! 3. El servidor se apaga inmediatamente después de recibir el primer código
//!    (el atacante no puede reutilizarlo — OAauth 2.1 §2.1.1).
//!
//! ## Seguridad
//! - Puerto dinámico: imposible predecirlo desde el exterior.
//! - Timeout de 5 minutos: si el usuario no completa el login, el servidor
//!   se cierra automáticamente evitando resource leaks.
//! - Solo responde a `127.0.0.1` (loopback), nunca a interfaces públicas.
//!
//! Su implementación completa se realizará en la Fase 2.

// TODO (Fase 2): Implementar:
//   pub struct CallbackServer;
//   impl CallbackServer {
//       pub async fn spawn() -> AppResult<(String, tokio::sync::oneshot::Receiver<String>)>
//   }
