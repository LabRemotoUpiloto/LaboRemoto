use axum::Router;
use tower_http::cors::CorsLayer;

use crate::api::config::ApiConfig;
use crate::api::routes;

pub async fn start(config: ApiConfig) {
    let app = build_router(config.clone());

    let addr = format!("{}:{}", config.host, config.port);
    let listener = match tokio::net::TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[API] Error al bindear {addr}: {e}");
            return;
        }
    };

    println!("[API] REST activa en http://{addr}");

    if let Err(e) = axum::serve(listener, app).await {
        eprintln!("[API] Error en el servidor: {e}");
    }
}

fn build_router(config: ApiConfig) -> Router {
    let cors = CorsLayer::permissive();

    let app = Router::new()
        .merge(routes::public_router())
        .merge(routes::protected_router())
        .layer(cors)
        .layer(axum::Extension(config));

    app
}
