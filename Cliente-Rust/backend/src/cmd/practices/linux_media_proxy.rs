//! cmd/practices/linux_media_proxy — Puente HTTP local (127.0.0.1) para reproducir
//! en streaming los videos de la práctica de Linux.
//!
//! Antes el video se bajaba COMPLETO por el túnel (`practicas_linux_get_media`), se
//! pasaba a base64 y recién entonces arrancaba: con un curso entero abriendo la
//! práctica a la vez el enlace de la Pi se saturaba y cada alumno esperaba ~1 minuto.
//! Ahora el `<video>` apunta a este puente; el puente le pide a la Pi, por el mismo
//! túnel SSH y con el mismo token bearer, solo los trozos (`Range`) que el reproductor
//! necesita, así que el video arranca en segundos, se puede adelantar y lo que el
//! estudiante no mira nunca se descarga.
//!
//! Seguridad: escucha solo en loopback, en un puerto efímero, y toda URL lleva un
//! token aleatorio generado al arrancar (otro proceso o una página web no pueden
//! adivinarla). El token bearer de la Pi nunca sale de este proceso. Las rutas se
//! validan con una lista blanca estricta (sin `..`, sin caracteres raros).

use std::sync::Arc;

use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, HeaderMap, Response, StatusCode},
    routing::get,
    Router,
};
use once_cell::sync::Lazy;
use tokio::sync::OnceCell;

use crate::cmd::practices::linux_api::{load_config, resolve_base_url};
use crate::cmd::protocol::CommandError;

static CLIENT: Lazy<reqwest::Client> = Lazy::new(reqwest::Client::new);

struct ProxyInfo {
    port: u16,
    token: String,
}

static PROXY: OnceCell<ProxyInfo> = OnceCell::const_new();

/// De dónde salen los bytes: el túnel real hacia la Pi, o un servidor fijo (tests).
#[derive(Clone)]
enum Upstream {
    Tunnel,
    #[cfg(test)]
    Fixed { base: String, bearer: String },
}

struct ProxyState {
    token: String,
    upstream: Upstream,
}

fn valid_practice(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn valid_media_path(p: &str) -> bool {
    !p.is_empty()
        && p.len() <= 200
        && !p.starts_with('/')
        && !p.contains("..")
        && !p.contains("//")
        && p.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '/'))
}

/// Comparación sin cortocircuito (el token va en la URL; evita filtrar por tiempo).
fn tokens_iguales(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b.iter()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn texto(status: StatusCode, msg: &str) -> Response<Body> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(Body::from(msg.to_string()))
        .unwrap_or_else(|_| Response::new(Body::empty()))
}

async fn resolver(up: &Upstream) -> Result<(String, String), String> {
    match up {
        Upstream::Tunnel => {
            let config = load_config().map_err(|e| e.to_string())?;
            let base = resolve_base_url(&config).await.map_err(|e| e.to_string())?;
            Ok((base, config.token))
        }
        #[cfg(test)]
        Upstream::Fixed { base, bearer } => Ok((base.clone(), bearer.clone())),
    }
}

async fn media_handler(
    State(st): State<Arc<ProxyState>>,
    Path((token, practice, path)): Path<(String, String, String)>,
    headers: HeaderMap,
) -> Response<Body> {
    if !tokens_iguales(&token, &st.token) {
        return texto(StatusCode::NOT_FOUND, "no encontrado");
    }
    if !valid_practice(&practice) || !valid_media_path(&path) {
        return texto(StatusCode::BAD_REQUEST, "ruta de media inválida");
    }
    let (base, bearer) = match resolver(&st.upstream).await {
        Ok(v) => v,
        Err(e) => return texto(StatusCode::BAD_GATEWAY, &format!("no se pudo abrir el túnel hacia la Pi: {e}")),
    };

    let url = format!("{base}/practices/{practice}/media/{path}");
    let mut req = CLIENT.get(&url).header("Authorization", format!("Bearer {bearer}"));
    if let Some(r) = headers.get(header::RANGE).and_then(|v| v.to_str().ok()) {
        req = req.header("Range", r);
    }
    let resp = match req.send().await {
        Ok(r) => r,
        Err(e) => return texto(StatusCode::BAD_GATEWAY, &format!("error contactando la Pi: {e}")),
    };

    let mut out = Response::builder().status(StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY));
    for name in ["content-type", "content-length", "content-range", "accept-ranges"] {
        if let Some(v) = resp.headers().get(name).and_then(|v| v.to_str().ok()) {
            out = out.header(name, v);
        }
    }
    // El cuerpo se reenvía por trozos a medida que llega: nada se acumula en memoria, y si el
    // reproductor corta la conexión el stream se descarta y el túnel cierra el canal.
    out.body(Body::from_stream(resp.bytes_stream()))
        .unwrap_or_else(|_| texto(StatusCode::INTERNAL_SERVER_ERROR, "error armando la respuesta"))
}

fn router(state: Arc<ProxyState>) -> Router {
    Router::new().route("/m/:token/:practice/*path", get(media_handler)).with_state(state)
}

async fn ensure_proxy() -> Result<&'static ProxyInfo, CommandError> {
    PROXY
        .get_or_try_init(|| async {
            let token = format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple());
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.map_err(|e| {
                CommandError::permanent("MEDIA_PROXY_ERROR", format!("No se pudo abrir el puente local de video: {e}"))
            })?;
            let port = listener
                .local_addr()
                .map_err(|e| CommandError::permanent("MEDIA_PROXY_ERROR", format!("Puente local de video sin puerto: {e}")))?
                .port();
            let app = router(Arc::new(ProxyState { token: token.clone(), upstream: Upstream::Tunnel }));
            tokio::spawn(async move {
                if let Err(e) = axum::serve(listener, app).await {
                    eprintln!("[linux_media_proxy] el puente local terminó: {e}");
                }
            });
            Ok(ProxyInfo { port, token })
        })
        .await
}

/// URL local (http://127.0.0.1:<puerto>/m/<token>/...) desde la que el `<video>` puede leer
/// el archivo de media de un módulo por streaming. `media_path` es el valor del bloque `media`
/// del `module.json` (ej. `"videos/video-modulo1.mp4"`).
#[tauri::command]
pub async fn practicas_linux_media_url(practice_id: String, media_path: String) -> Result<String, CommandError> {
    if !valid_practice(&practice_id) || !valid_media_path(&media_path) {
        return Err(CommandError::permanent("INVALID_PATH", "Ruta de media inválida"));
    }
    load_config()?; // si falta la configuración del túnel, el error sale acá y no como un video mudo
    let info = ensure_proxy().await?;
    Ok(format!("http://127.0.0.1:{}/m/{}/{}/{}", info.port, info.token, practice_id, media_path))
}

#[cfg(test)]
mod tests {
    use super::*;

    const BEARER: &str = "secreto-de-prueba";

    fn contenido() -> Vec<u8> {
        (0..300_000u32).map(|i| (i % 251) as u8).collect()
    }

    /// Falso servicio de la Pi: exige el bearer y entiende `Range: bytes=a-b` / `a-`.
    async fn falsa_pi(headers: HeaderMap) -> Response<Body> {
        let auth_ok = headers.get(header::AUTHORIZATION).and_then(|v| v.to_str().ok()) == Some(&format!("Bearer {BEARER}"));
        if !auth_ok {
            return texto(StatusCode::UNAUTHORIZED, "no autorizado");
        }
        let data = contenido();
        let size = data.len();
        let rango = headers.get(header::RANGE).and_then(|v| v.to_str().ok()).and_then(|r| r.strip_prefix("bytes=")).map(|s| s.to_string());
        if let Some(r) = rango {
            let (a, b) = r.split_once('-').unwrap();
            let start: usize = a.parse().unwrap();
            let end: usize = if b.is_empty() { size - 1 } else { b.parse::<usize>().unwrap().min(size - 1) };
            return Response::builder()
                .status(StatusCode::PARTIAL_CONTENT)
                .header("content-type", "video/mp4")
                .header("accept-ranges", "bytes")
                .header("content-length", (end - start + 1).to_string())
                .header("content-range", format!("bytes {start}-{end}/{size}"))
                .body(Body::from(data[start..=end].to_vec()))
                .unwrap();
        }
        Response::builder()
            .status(StatusCode::OK)
            .header("content-type", "video/mp4")
            .header("accept-ranges", "bytes")
            .header("content-length", size.to_string())
            .body(Body::from(data))
            .unwrap()
    }

    async fn levantar() -> (String, String) {
        let pi = Router::new().route("/practices/:id/media/*path", get(falsa_pi));
        let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let pi_port = l.local_addr().unwrap().port();
        tokio::spawn(async move { axum::serve(l, pi).await.unwrap() });

        let token = "tokendeprueba".to_string();
        let st = Arc::new(ProxyState {
            token: token.clone(),
            upstream: Upstream::Fixed { base: format!("http://127.0.0.1:{pi_port}"), bearer: BEARER.to_string() },
        });
        let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let proxy_port = l.local_addr().unwrap().port();
        tokio::spawn(async move { axum::serve(l, router(st)).await.unwrap() });
        (format!("http://127.0.0.1:{proxy_port}"), token)
    }

    #[tokio::test]
    async fn entrega_el_archivo_completo_y_por_rangos() {
        let (base, token) = levantar().await;
        let datos = contenido();
        let url = format!("{base}/m/{token}/linux-m1/videos/v.mp4");

        let r = reqwest::get(&url).await.unwrap();
        assert_eq!(r.status().as_u16(), 200);
        assert_eq!(r.headers()["accept-ranges"], "bytes");
        assert_eq!(r.bytes().await.unwrap().to_vec(), datos);

        let c = reqwest::Client::new();
        let r = c.get(&url).header("Range", "bytes=1000-1999").send().await.unwrap();
        assert_eq!(r.status().as_u16(), 206);
        assert_eq!(r.headers()["content-range"], "bytes 1000-1999/300000");
        assert_eq!(r.bytes().await.unwrap().to_vec(), datos[1000..2000].to_vec());

        let r = c.get(&url).header("Range", "bytes=299000-").send().await.unwrap();
        assert_eq!(r.status().as_u16(), 206);
        assert_eq!(r.bytes().await.unwrap().to_vec(), datos[299000..].to_vec());
    }

    #[tokio::test]
    async fn rechaza_token_malo_y_rutas_peligrosas() {
        let (base, token) = levantar().await;
        let c = reqwest::Client::new();
        assert_eq!(c.get(format!("{base}/m/otro-token/linux-m1/videos/v.mp4")).send().await.unwrap().status().as_u16(), 404);
        assert_eq!(c.get(format!("{base}/m/{token}/linux-m1/a%2e%2e/b.mp4")).send().await.unwrap().status().as_u16(), 400);
        assert_eq!(c.get(format!("{base}/m/{token}/linux-m1/videos/v%20x.mp4")).send().await.unwrap().status().as_u16(), 400);
        assert_eq!(c.get(format!("{base}/m/{token}/lin%3Bux/videos/v.mp4")).send().await.unwrap().status().as_u16(), 400);
    }

    #[test]
    fn validadores_de_ruta() {
        assert!(valid_practice("linux-m1") && !valid_practice("") && !valid_practice("a/b") && !valid_practice("a b"));
        assert!(valid_media_path("videos/video-modulo1.mp4") && valid_media_path("diagrams/nano_atajos.png"));
        assert!(!valid_media_path("../x") && !valid_media_path("/x") && !valid_media_path("a//b") && !valid_media_path("a b") && !valid_media_path("a\\b"));
        assert!(tokens_iguales("abc", "abc") && !tokens_iguales("abc", "abd") && !tokens_iguales("abc", "ab"));
    }
}
