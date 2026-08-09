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
use base64::{engine::general_purpose::STANDARD, Engine as _};
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
        Html(build_success_html())
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

const LOGO_UNIPILOTO: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/../frontend/src/assets/logo-unipiloto.png"));
const ABEJA_UNIPILOTO: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/../frontend/public/abeja1.jpeg"));

fn image_data_uri(mime: &str, bytes: &[u8]) -> String {
    format!("data:{};base64,{}", mime, STANDARD.encode(bytes))
}

fn build_success_html() -> String {
    SUCCESS_HTML_TEMPLATE
        .replace("__LOGO_SRC__", &image_data_uri("image/png", LOGO_UNIPILOTO))
        .replace("__ABEJA_SRC__", &image_data_uri("image/jpeg", ABEJA_UNIPILOTO))
}

const SUCCESS_HTML_TEMPLATE: &str = r#"<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>LaboRemoto — Autenticación Exitosa</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }
    body {
      font-family: 'Open Sans', 'Segoe UI', system-ui, -apple-system, sans-serif;
      color: #1c1c1c;
      background: #f7f2f2;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh;
      padding: 32px;
      overflow: hidden;
    }
    .page-mark {
      position: fixed;
      inset: 0 auto 0 0;
      width: min(28vw, 420px);
      background: #d51f22;
      clip-path: polygon(0 0, 82% 0, 100% 100%, 0 100%);
      z-index: 0;
    }
    .card {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: 290px minmax(320px, 1fr);
      max-width: 900px; width: min(94vw, 900px);
      min-height: 430px;
      background: #ffffff;
      border-radius: 10px 34px 34px 10px;
      box-shadow: 0 30px 90px rgba(88, 22, 22, .16);
      animation: fadeIn .4s ease;
      overflow: hidden;
    }
    .visual-panel {
      position: relative;
      background: linear-gradient(160deg, #a81010 0%, #d51f22 58%, #e8403d 100%);
      padding: 2rem;
      color: #ffffff;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .visual-panel::after {
      content: '';
      position: absolute;
      width: 220px; height: 220px;
      right: -72px; bottom: -72px;
      border: 28px solid rgba(255,255,255,.16);
      border-radius: 999px;
    }
    .brand-logo {
      width: 76px; height: 76px; object-fit: contain;
      background: #ffffff;
      border-radius: 18px;
      padding: 9px;
      box-shadow: 0 16px 34px rgba(0,0,0,.18);
    }
    .visual-copy {
      position: relative;
      z-index: 1;
      max-width: 210px;
    }
    .visual-copy span {
      display: block;
      font-size: .76rem;
      font-weight: 800;
      letter-spacing: .12em;
      text-transform: uppercase;
      opacity: .86;
    }
    .visual-copy strong {
      display: block;
      margin-top: .45rem;
      font-size: 1.55rem;
      line-height: 1.05;
    }
    .content-panel {
      position: relative;
      padding: 3.3rem 4rem;
      display: flex;
      flex-direction: column;
      justify-content: center;
      background:
        linear-gradient(90deg, rgba(213,31,34,.08), transparent 34%),
        #ffffff;
    }
    .content-panel::before {
      content: '';
      position: absolute;
      top: 0; right: 0;
      width: 130px; height: 130px;
      background: #d51f22;
      clip-path: polygon(100% 0, 0 0, 100% 100%);
      opacity: .92;
    }
    .status-label {
      width: max-content;
      margin-bottom: 1.2rem;
      padding: .46rem .78rem;
      border-left: 5px solid #d51f22;
      background: #fff3f3;
      color: #a81010;
      font-size: .78rem;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .bee-wrap {
      position: absolute;
      right: -18px;
      top: -24px;
      width: 86px; height: 86px;
      pointer-events: none;
    }
    .bee {
      width: 86px; height: 86px;
      object-fit: cover;
      mix-blend-mode: multiply;
      filter: drop-shadow(0 12px 18px rgba(168,16,16,.14));
    }
    @keyframes fadeIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:none } }
    .title-lockup {
      position: relative;
      width: max-content;
      max-width: 100%;
      padding-right: 54px;
      margin-bottom: 1rem;
    }
    h1 { color: #a81010; font-size: clamp(2rem, 4vw, 3.2rem); line-height: .95; font-weight: 900; letter-spacing: -.04em; }
    p  { color: #353535; line-height: 1.75; font-size: 1rem; max-width: 420px; }
    .highlight { color: #d51f22; font-weight: 800; }
    @media (max-width: 760px) {
      body { padding: 20px; overflow: auto; }
      .page-mark { width: 100%; height: 180px; inset: 0 0 auto 0; clip-path: polygon(0 0, 100% 0, 100% 68%, 0 100%); }
      .card { grid-template-columns: 1fr; border-radius: 26px; min-height: auto; }
      .visual-panel { min-height: 190px; }
      .content-panel { padding: 2.4rem 1.6rem 2.4rem; }
      .title-lockup { padding-right: 42px; }
      .bee-wrap { right: -16px; top: -20px; width: 68px; height: 68px; }
      .bee { width: 68px; height: 68px; }
    }
  </style>
</head>
<body>
  <div class="page-mark" aria-hidden="true"></div>
  <div class="card">
    <section class="visual-panel">
      <img class="brand-logo" src="__LOGO_SRC__" alt="Universidad Piloto de Colombia">
      <div class="visual-copy">
        <span>Universidad Piloto</span>
        <strong>LaboRemoto</strong>
      </div>
    </section>
    <section class="content-panel">
      <div class="status-label">Acceso confirmado</div>
      <div class="title-lockup">
        <h1>Autenticación<br>exitosa</h1>
        <div class="bee-wrap"><img class="bee" src="__ABEJA_SRC__" alt="Abeja LaboRemoto"></div>
      </div>
      <p>Tu sesión ha sido iniciada correctamente. Puedes <span class="highlight">cerrar esta pestaña</span> y volver a <span class="highlight">LaboRemoto</span>.</p>
    </section>
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
      font-family: 'Open Sans', 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: linear-gradient(135deg, #ffffff 0%, #f4f4f4 55%, #fff1f1 100%);
      color: #1c1c1c;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }}
    .card {{
      background: #ffffff;
      border: 1px solid rgba(213,31,34,0.22);
      border-radius: 24px;
      padding: 2.5rem 3rem;
      text-align: center;
      max-width: 440px; width: 90%;
      box-shadow: 0 24px 70px rgba(168,16,16,.12);
    }}
    .icon {{ font-size: 3rem; margin-bottom: 1rem; }}
    h1 {{ color: #a81010; font-size: 1.4rem; margin-bottom: .75rem; }}
    p  {{ color: #494949; line-height: 1.7; font-size: .9rem; margin-top: .5rem; }}
    code {{
      background: rgba(213,31,34,0.10);
      padding: .15em .45em; border-radius: 4px;
      color: #a81010; font-size: .85em;
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
