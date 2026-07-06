//! # `auth::config` — Configuración de Keycloak
//!
//! Lee las variables de entorno necesarias para construir las URLs
//! y los parámetros del cliente OAuth 2.1.
//!
//! ## Variables requeridas (ver `.env.example`)
//! | Variable              | Ejemplo                                      |
//! |-----------------------|----------------------------------------------|
//! | `KEYCLOAK_BASE_URL`   | `http://52.14.162.232/auth`                  |
//! | `KEYCLOAK_REALM`      | `laboratorio-semillero`                      |
//! | `KEYCLOAK_CLIENT_ID`  | `semillero-app`                              |
//! | `OAUTH_REDIRECT_HOST` | `127.0.0.1` (siempre loopback)               |
//!
//! La estructura es de solo lectura y se comparte como estado Tauri.
//! Su implementación completa se realizará en la Fase 2.

// TODO (Fase 2): Implementar KeycloakConfig::from_env() y derivar los
//               endpoints de authorization, token y JWKS a partir de
//               KEYCLOAK_BASE_URL + KEYCLOAK_REALM.
