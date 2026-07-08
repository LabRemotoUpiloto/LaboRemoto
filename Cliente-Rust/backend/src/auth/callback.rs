//! # `auth::callback` — Servidor Axum Loopback Efímero con Validación CSRF
//!
//! Implementa los pasos 2–6 del flujo OAuth loopback (AUTH_SPEC §3).
//!
//! ## Cambios en Fase 3
//! - `CallbackServer::spawn(csrf_state: String)` ahora recibe el UUID anti-CSRF
//!   generado en `auth_login_url` y lo valida al recibir el redirect de Keycloak.
//!
//! ## Capas de seguridad implementadas
//! | Mecanismo         | Protege contra                                    |
//! |-------------------|---------------------------------------------------|
//! | Puerto dinámico   | Predicción de redirect_uri por un atacante         |
//! | oneshot (un uso)  | Replay del código OAuth                           |
//! | PKCE (verifier)   | Intercepción del código en el redirect             |
//! | **CSRF state**    | **Cross-Site Request Forgery en el flujo OAuth**   |
//! | Timeout 5 min     | Resource leak si el usuario abandona el login      |
//! | Shutdown inmediato| El servidor no acepta un segundo código            |

use std::{collections::HashMap, sync::Arc, time::Duration};
use axum::{
    extract::{Query, State},
    response::Html,
    routing::get,
    Router,
};
use tokio::{
    net::TcpListener,
    sync::{oneshot, Mutex},
};

use crate::error::AppError;

// ─────────────────────────────────────────────────────────────────────────────
// Estado compartido del servidor
// ─────────────────────────────────────────────────────────────────────────────

/// Estado interno del servidor loopback, compartido entre Axum y el handler.
#[derive(Clone)]
struct ServerState {
    /// Canal para enviar el código OAuth al caller de `CallbackServer::spawn()`.
    code_tx:     Arc<Mutex<Option<oneshot::Sender<String>>>>,
    /// Canal para enviar la señal de shutdown al servidor Axum.
    shutdown_tx: Arc<Mutex<Option<oneshot::Sender<()>>>>,
    /// Valor esperado del parámetro `state` anti-CSRF.
    /// Generado como UUID v4 en `auth_login_url`, enviado a Keycloak,
    /// y validado aquí al recibir el redirect.
    csrf_state:  String,
}

// ─────────────────────────────────────────────────────────────────────────────
// CallbackServer
// ─────────────────────────────────────────────────────────────────────────────

/// Servidor HTTP mínimo y efímero que captura el código OAuth de Keycloak.
pub struct CallbackServer;

impl CallbackServer {
    /// Arranca el servidor loopback con protección CSRF.
    ///
    /// # Parámetros
    /// - `csrf_state`: UUID v4 generado en `auth_login_url`, usado para validar
    ///   que el redirect proviene de Keycloak y no de un sitio malicioso.
    ///
    /// # Retorno
    /// - `redirect_uri`: la URL a registrar como parámetro `redirect_uri` en Keycloak
    /// - `Receiver<String>`: canal para `await`ar el código OAuth capturado
    pub async fn spawn(
        csrf_state: String,
    ) -> Result<(String, oneshot::Receiver<String>), AppError> {
        // Pedir al SO un puerto TCP libre en loopback
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| AppError::Network(format!(
                "No se pudo abrir el servidor loopback OAuth: {}", e
            )))?;

        let port = listener
            .local_addr()
            .map_err(|e| AppError::Network(e.to_string()))?
            .port();

        let redirect_uri = format!("http://127.0.0.1:{}/callback", port);

        let (code_tx, code_rx)         = oneshot::channel::<String>();
        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

        let state = ServerState {
            code_tx:    Arc::new(Mutex::new(Some(code_tx))),
            shutdown_tx: Arc::new(Mutex::new(Some(shutdown_tx))),
            csrf_state,
        };

        let app: Router = Router::new()
            .route("/callback", get(callback_handler))
            .with_state(state);

        tokio::spawn(async move {
            let serve = async move {
                axum::serve(listener, app)
                    .with_graceful_shutdown(async move {
                        let _ = shutdown_rx.await;
                    })
                    .await
            };

            tokio::select! {
                _ = serve => {}
                _ = tokio::time::sleep(Duration::from_secs(300)) => {}
            }
        });

        Ok((redirect_uri, code_rx))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler del callback
// ─────────────────────────────────────────────────────────────────────────────

/// Handler único del servidor loopback.
///
/// ## Validaciones realizadas (orden de prioridad)
/// 1. **CSRF state**: compara `?state=` con `ServerState::csrf_state`.
///    Un mismatch indica un ataque CSRF o una petición obsoleta.
/// 2. **Código presente**: verifica que Keycloak envió `?code=` (no `?error=`).
async fn callback_handler(
    State(state):  State<ServerState>,
    Query(params): Query<HashMap<String, String>>,
) -> Html<String> {
    // ── 1. Validación CSRF ────────────────────────────────────────────────────
    let received_state = params.get("state").map(|s| s.as_str()).unwrap_or("");
    if received_state != state.csrf_state {
        return Html(build_error_html(
            "invalid_state",
            "La solicitud de login no es válida o ya expiró. \
             Por favor, inicia el proceso de autenticación de nuevo.",
        ));
    }

    // ── 2. Procesar código o error de Keycloak ────────────────────────────────
    if let Some(code) = params.get("code") {
        // Éxito: enviar código y apagar servidor
        {
            let mut guard = state.code_tx.lock().await;
            if let Some(tx) = guard.take() {
                let _ = tx.send(code.clone());
            }
        }
        {
            let mut guard = state.shutdown_tx.lock().await;
            if let Some(tx) = guard.take() {
                let _ = tx.send(());
            }
        }
        Html(SUCCESS_HTML.to_string())
    } else {
        // Error reportado por Keycloak (ej. usuario canceló el login)
        let error       = params.get("error").map(|s| s.as_str()).unwrap_or("desconocido");
        let description = params.get("error_description").map(|s| s.as_str()).unwrap_or("");
        Html(build_error_html(error, description))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML de respuesta para el navegador
// ─────────────────────────────────────────────────────────────────────────────

const SUCCESS_HTML: &str = r#"<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>LaboRemoto — Autenticación Exitosa</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: #0f0f1a;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #1a1a2e;
      border: 1px solid rgba(76,175,80,0.3);
      border-radius: 16px;
      padding: 2.5rem 3rem;
      text-align: center;
      max-width: 440px; width: 90%;
      box-shadow: 0 0 60px rgba(76,175,80,0.08);
      animation: fadeIn .4s ease;
    }
    @keyframes fadeIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:none } }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { color: #4caf50; font-size: 1.4rem; margin-bottom: .75rem; font-weight: 600; }
    p  { color: #8888aa; line-height: 1.7; font-size: .9rem; }
    .highlight { color: #c8c8ff; font-weight: 500; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h1>Autenticación exitosa</h1>
    <p>Tu sesión ha sido iniciada correctamente.<br>
       Puedes <span class="highlight">cerrar esta pestaña</span>
       y volver a <span class="highlight">LaboRemoto</span>.</p>
  </div>
</body>
</html>"#;

fn build_error_html(error: &str, description: &str) -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>LaboRemoto — Error de Autenticación</title>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0 }}
    body {{
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: #0f0f1a;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh;
    }}
    .card {{
      background: #1a1a2e;
      border: 1px solid rgba(244,67,54,0.3);
      border-radius: 16px;
      padding: 2.5rem 3rem;
      text-align: center;
      max-width: 440px; width: 90%;
    }}
    .icon {{ font-size: 3rem; margin-bottom: 1rem; }}
    h1 {{ color: #f44336; font-size: 1.4rem; margin-bottom: .75rem; }}
    p  {{ color: #8888aa; line-height: 1.7; font-size: .9rem; margin-top: .5rem; }}
    code {{
      background: rgba(244,67,54,0.1);
      padding: .15em .45em; border-radius: 4px;
      color: #ff8a80; font-size: .85em;
    }}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✕</div>
    <h1>Error de autenticación</h1>
    <p>Keycloak reportó: <code>{error}</code></p>
    <p>{description}</p>
    <p>Cierra esta pestaña e intenta de nuevo en <strong>LaboRemoto</strong>.</p>
  </div>
</body>
</html>"#
    )
}
