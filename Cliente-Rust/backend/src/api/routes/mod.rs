use axum::{middleware, routing::{delete, get, post}, Router};

use crate::api::auth;
use crate::api::modules::health;
use crate::api::modules::{hosts, sftp, ssh};

pub fn public_router() -> Router {
    Router::new()
        .route("/api/v1/health", get(health::health_handler))
}

pub fn protected_router() -> Router {
    Router::new()
        // Hosts
        .route("/api/v1/hosts", get(hosts::list_hosts))
        .route("/api/v1/hosts", post(hosts::create_host))
        .route("/api/v1/hosts/:id", get(hosts::get_host))
        .route("/api/v1/hosts/:id", delete(hosts::delete_host))
        // SSH sessions
        .route("/api/v1/ssh/sessions", post(ssh::create_session))
        .route("/api/v1/ssh/sessions/:id", get(ssh::get_session))
        .route("/api/v1/ssh/sessions/:id", delete(ssh::delete_session))
        // SFTP
        .route("/api/v1/sftp/:session_id/list", get(sftp::list))
        .route("/api/v1/sftp/:session_id/home", get(sftp::home))
        .layer(middleware::from_fn(auth::auth_middleware))
}
