use axum::{routing::get, Router};

use crate::api::modules::health;

pub fn public_router() -> Router {
    Router::new()
        .route("/api/v1/health", get(health::health_handler))
}

pub fn protected_router() -> Router {
    Router::new()
}
