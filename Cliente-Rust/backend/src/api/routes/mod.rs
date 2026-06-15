use axum::{middleware, routing::{delete, get, post}, Router};

use crate::api::auth;
use crate::api::modules::health;
use crate::api::modules::{ai, hardware, hosts, moodle, practices, sessions, sftp, ssh};

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
        // AI
        .route("/api/v1/ai/status", get(ai::status))
        .route("/api/v1/ai/test-key", post(ai::test_key))
        // Session logs
        .route("/api/v1/session-logs", get(sessions::list_logs))
        .route("/api/v1/session-logs/:session_id", get(sessions::get_log_content))
        .route("/api/v1/session-logs/:session_id", delete(sessions::delete_log))
        // Practices
        .route("/api/v1/practices/categories", get(practices::list_categories))
        .route("/api/v1/practices/config", get(practices::get_config))
        // Moodle
        .route("/api/v1/moodle/sync-assignment", post(moodle::sync_assignment))
        .route("/api/v1/moodle/prepare-grade", post(moodle::prepare_grade))
        .route("/api/v1/moodle/submit-grade", post(moodle::submit_grade))
        // Hardware GPIO
        .route("/api/v1/hardware/gpio/:session_id/pins", get(hardware::gpio_pins))
        .route("/api/v1/hardware/gpio/:session_id/pins/:pin/mode", post(hardware::gpio_set_mode))
        .route("/api/v1/hardware/gpio/:session_id/pins/:pin/pull", post(hardware::gpio_set_pull))
        .route("/api/v1/hardware/gpio/:session_id/pins/:pin/write", post(hardware::gpio_write))
        .route("/api/v1/hardware/gpio/:session_id/pins/:pin/read", get(hardware::gpio_read))
        // Hardware Arduino
        .route("/api/v1/hardware/arduino/:session_id/status", get(hardware::arduino_status))
        .route("/api/v1/hardware/arduino/:session_id/cmd", post(hardware::arduino_send))
        .route("/api/v1/hardware/arduino/:session_id/buffer", get(hardware::arduino_buffer))
        .layer(middleware::from_fn(auth::auth_middleware))
}
