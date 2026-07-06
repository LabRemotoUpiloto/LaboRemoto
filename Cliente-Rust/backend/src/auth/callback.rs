//! # `auth::callback` — Servidor Axum Loopback Efímero
//!
//! Implementa los pasos 2–6 del flujo OAuth loopback (AUTH_SPEC §3):
//!
//! 1. Abre `TcpListener::bind("127.0.0.1:0")` → puerto dinámico del SO
//! 2. Levanta un Router Axum mínimo con un único endpoint `GET /callback`
//! 3. Cuando Keycloak redirige al browser con `?code=...`, el handler captura el código
//! 4. El código se envía por un canal `oneshot` al caller
//! 5. El servidor se apaga inmediatamente (el código es de un solo uso)
//!
//! ## Seguridad
//! - **Puerto dinámico**: imposible predecirlo desde el exterior
//! - **Un solo uso**: el `oneshot::Sender` se consume con `.take()`, rechazando duplicados
//! - **Timeout de 5 min**: el servidor se cierra automáticamente si el usuario no completa el login
//! - **Solo loopback**: `127.0.0.1` nunca expone interfaces públicas
//! - **Shutdown inmediato**: tras capturar el código, el servidor cierra con graceful shutdown

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

/// Estado interno compartido entre Axum y el handler del callback.
///
/// Ambos canales están envueltos en `Arc<Mutex<Option<_>>>` para permitir
/// extracción (`.take()`) de un solo uso de forma segura en un contexto async.
#[derive(Clone)]
struct ServerState {
    /// Canal para enviar el código OAuth al caller de `CallbackServer::spawn()`
    code_tx:     Arc<Mutex<Option<oneshot::Sender<String>>>>,
    /// Canal para enviar la señal de shutdown al servidor Axum
    shutdown_tx: Arc<Mutex<Option<oneshot::Sender<()>>>>,
}

// ─────────────────────────────────────────────────────────────────────────────
// CallbackServer
// ─────────────────────────────────────────────────────────────────────────────

/// Servidor HTTP mínimo y efímero que captura el código OAuth de Keycloak.
pub struct CallbackServer;

impl CallbackServer {
    /// Arranca el servidor loopback y retorna `(redirect_uri, code_receiver)`.
    ///
    /// El servidor corre en un task de Tokio en background.
    /// Se apaga solo al recibir el primer código OAuth o al vencer 5 minutos.
    ///
    /// # Retorno
    /// - `redirect_uri`: la URL a registrar en Keycloak como `redirect_uri`
    ///   (ej. `http://127.0.0.1:52341/callback`)
    /// - `Receiver<String>`: canal para `await`ar el código OAuth capturado
    pub async fn spawn() -> Result<(String, oneshot::Receiver<String>), AppError> {
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

        // Canal 1: código OAuth → caller
        let (code_tx, code_rx)         = oneshot::channel::<String>();
        // Canal 2: señal de shutdown → servidor Axum
        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

        let state = ServerState {
            code_tx:     Arc::new(Mutex::new(Some(code_tx))),
            shutdown_tx: Arc::new(Mutex::new(Some(shutdown_tx))),
        };

        let app: Router = Router::new()
            .route("/callback", get(callback_handler))
            .with_state(state);

        // Arrancar el servidor en background
        tokio::spawn(async move {
            let serve = async move {
                axum::serve(listener, app)
                    .with_graceful_shutdown(async move {
                        // El servidor se detiene cuando llega la señal de shutdown
                        let _ = shutdown_rx.await;
                    })
                    .await
            };

            // Timeout de seguridad: 5 minutos (300 s)
            tokio::select! {
                result = serve => {
                    if let Err(e) = result {
                        eprintln!("[AUTH] Error en servidor loopback OAuth: {}", e);
                    }
                }
                _ = tokio::time::sleep(Duration::from_secs(300)) => {
                    eprintln!(
                        "[AUTH] Timeout del servidor loopback OAuth \
                         (5 min sin login). Puerto {} cerrado.", port
                    );
                }
            }

            println!("[AUTH] Servidor loopback cerrado (puerto {}).", port);
        });

        println!(
            "[AUTH] Servidor loopback OAuth escuchando en http://127.0.0.1:{}/callback",
            port
        );

        Ok((redirect_uri, code_rx))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler del callback
// ─────────────────────────────────────────────────────────────────────────────

/// Handler único del servidor loopback.
///
/// Extrae el `?code=` de la URL de redirect de Keycloak.
/// Envía el código por el canal `oneshot` y ordena el shutdown inmediato.
///
/// Si Keycloak envía `?error=...` en lugar de `?code=...`, responde
/// con una página de error y no envía nada por el canal.
async fn callback_handler(
    State(state):  State<ServerState>,
    Query(params): Query<HashMap<String, String>>,
) -> Html<String> {
    if let Some(code) = params.get("code") {
        // ── Éxito: enviar código y apagar servidor ────────────────────────────
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
        // ── Error de Keycloak ─────────────────────────────────────────────────
        let error       = params.get("error").map(|s| s.as_str()).unwrap_or("desconocido");
        let description = params.get("error_description").map(|s| s.as_str()).unwrap_or("");
        eprintln!(
            "[AUTH] Keycloak retornó error en callback: {} — {}",
            error, description
        );
        Html(build_error_html(error, description))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Páginas HTML de respuesta para el navegador
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
      max-width: 440px;
      width: 90%;
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
      max-width: 440px;
      width: 90%;
    }}
    .icon {{ font-size: 3rem; margin-bottom: 1rem; }}
    h1 {{ color: #f44336; font-size: 1.4rem; margin-bottom: .75rem; }}
    p  {{ color: #8888aa; line-height: 1.7; font-size: .9rem; margin-top: .5rem; }}
    code {{
      background: rgba(244,67,54,0.1);
      padding: .15em .45em;
      border-radius: 4px;
      color: #ff8a80;
      font-size: .85em;
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
