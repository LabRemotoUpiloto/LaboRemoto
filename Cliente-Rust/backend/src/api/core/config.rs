use std::env;

#[derive(Clone, Debug)]
pub struct ApiConfig {
    pub enabled: bool,
    pub host: String,
    pub port: u16,
    pub token: String,
    pub allowed_local_roots: Vec<String>,
}

impl ApiConfig {
    pub fn from_env() -> Self {
        let enabled = env::var("REST_API_ENABLED")
            .ok()
            .and_then(|v| v.parse::<bool>().ok())
            .unwrap_or(false);

        let host = env::var("REST_API_HOST")
            .unwrap_or_else(|_| "127.0.0.1".to_string());

        let port = env::var("REST_API_PORT")
            .ok()
            .and_then(|v| v.parse::<u16>().ok())
            .unwrap_or(8787);

        let token = env::var("REST_API_TOKEN")
            .unwrap_or_else(|_| String::new());

        let allowed_local_roots = env::var("REST_ALLOWED_LOCAL_ROOTS")
            .unwrap_or_else(|_| String::new())
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        Self { enabled, host, port, token, allowed_local_roots }
    }
}
