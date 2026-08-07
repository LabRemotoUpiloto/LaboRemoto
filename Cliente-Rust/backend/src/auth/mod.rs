//! # Módulo de Autenticación OAuth 2.1 — Keycloak
//!
//! Implementa el flujo Authorization Code + PKCE (RFC 7636 / RFC 8252)
//! para aplicaciones de escritorio nativas.
//!
//! ## Submódulos
//! - [`config`]   — Configuración de Keycloak leída desde `.env`
//! - [`client`]   — Cliente HTTP: intercambio de código, refresh, revocación
//! - [`pkce`]     — Generación y validación de `code_verifier` / `code_challenge`
//! - [`jwt`]      — Validación de firma RS256 y extracción de `JwtClaims` institucionales
//! - [`callback`] — Servidor Axum efímero que captura el `?code=` del redirect loopback
//! - [`commands`] — Comandos Tauri expuestos al frontend (auth_login_url, auth_status, auth_logout)
//!
//! ## Regla de oro (AUTH_SPEC §4)
//! El token JWT **jamás** abandona la memoria de este proceso.
//! `state_core::AuthState` es el único custodio; el frontend solo recibe
//! metadatos de sesión (username, user_type, exp).

pub mod config;
pub mod client;
pub mod pkce;
pub mod jwt;
pub mod callback;
pub mod commands;
pub mod token_store;
