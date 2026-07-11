//! # `state_core::auth_state` — Gestor Seguro de Tokens JWT en Memoria
//!
//! Este módulo es el **único custodio** del access_token y refresh_token
//! durante la vida útil de la aplicación.
//!
//! ## Reglas de Seguridad (AUTH_SPEC §4)
//! - El token **NUNCA** se escribe en disco, localStorage ni cookies.
//! - El frontend **NUNCA** recibe el token directamente; solo recibe
//!   metadatos de sesión mediante [`AuthSessionInfo`].
//! - Los tokens se borran automáticamente cuando el proceso termina
//!   (memoria volátil de proceso).
//!
//! ## Diseño de Concurrencia
//! Se utiliza [`parking_lot::RwLock`] (ya en Cargo.toml) para permitir
//! múltiples lectores simultáneos con un escritor exclusivo, minimizando
//! la contención en operaciones de solo lectura (verificar si hay sesión activa).
//!
//! ## Ciclo de Vida del Token
//! ```text
//! AuthState::new()  →  (vacío, sin sesión)
//!     │
//!     ├─ store(bundle)     →  Guarda access + refresh + exp + claims
//!     ├─ get_access_token  →  Some(jwt) si no expiró, None si expiró/ausente
//!     ├─ is_authenticated  →  true si hay token válido no expirado
//!     ├─ session_info      →  AuthSessionInfo (username, user_type, exp_unix)
//!     └─ clear()           →  Limpia toda la sesión (logout)
//! ```

use std::time::{Duration, Instant};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};

// ─────────────────────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────────────────────

/// Tipo de usuario institucional según el campo `user_type` del JWT,
/// mapeado desde el atributo `postalCode` del Active Directory (AUTH_SPEC §2).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum UserType {
    Estudiante,
    Docente,
    /// Fallback para valores inesperados o tokens mal formados.
    #[serde(other)]
    Unknown,
}

impl UserType {
    /// Parsea el string del claim `user_type` del JWT institucional.
    pub fn from_claim(s: &str) -> Self {
        match s {
            "Estudiante" => UserType::Estudiante,
            "Docente"    => UserType::Docente,
            _            => UserType::Unknown,
        }
    }
}

impl std::fmt::Display for UserType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UserType::Estudiante => write!(f, "Estudiante"),
            UserType::Docente    => write!(f, "Docente"),
            UserType::Unknown    => write!(f, "Desconocido"),
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────

/// Paquete de tokens recibido del Token Endpoint de Keycloak.
///
/// Se construye al intercambiar el código de autorización o al renovar
/// el access_token con el refresh_token.
///
/// **NUNCA serializar este struct completo hacia el frontend.**
/// Usar [`AuthSessionInfo`] para todo lo que el frontend necesite ver.
#[derive(Debug, Clone)]
pub struct TokenBundle {
    /// El JWT access_token (RS256, firmado por Keycloak).
    /// Expira en 300 segundos según AUTH_SPEC §2 (`expires_in: 300`).
    pub access_token: String,

    /// El refresh_token (HS256).
    /// Expira en 1800 segundos según AUTH_SPEC §2 (`refresh_expires_in: 1800`).
    pub refresh_token: String,

    /// Instante en que el access_token expira (calculado al recibirlo).
    /// Se usa para `get_access_token()` sin necesidad de parsear el JWT.
    pub access_expires_at: Instant,

    /// Instante en que el refresh_token expira.
    pub refresh_expires_at: Instant,

    /// Claims extraídos del JWT en el momento del store.
    /// Evita re-parsear el token en cada consulta.
    pub claims: StoredClaims,
}

/// Subset de claims del JWT institucional relevantes para la aplicación.
///
/// Se extrae una sola vez al hacer `AuthState::store()` para evitar
/// re-parsear el token en cada consulta de estado de sesión.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredClaims {
    /// UUID del usuario en Keycloak (`sub`).
    pub sub: String,
    /// Login institucional (ej. `david-carreno1`).
    pub preferred_username: String,
    /// Nombre completo (ej. `DAVID ALEJANDRO CARREÑO PARRA`).
    pub name: String,
    /// Correo institucional (ej. `david-carreno1@upc.edu.co`).
    pub email: String,
    /// Tipo de usuario institucional (`Estudiante` | `Docente`).
    pub user_type: UserType,
    /// Roles normalizados y unificados (ej. ["estudiante", "admin_lab"]).
    pub roles: Vec<String>,
    /// Unix timestamp de expiración del access_token (campo `exp` del JWT).
    pub exp: i64,
    /// ID de sesión de Keycloak (`sid`), útil para logout federado.
    pub sid: String,
}

// ─────────────────────────────────────────────────────────────────────────────

/// Información de sesión segura que SÍ puede enviarse al frontend.
///
/// No contiene tokens. El frontend la usa para mostrar el nombre de usuario
/// en el Sidebar y adaptar la UI según el rol (Estudiante/Docente).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthSessionInfo {
    pub preferred_username: String,
    pub name:               String,
    pub email:              String,
    pub user_type:          UserType,
    pub roles:              Vec<String>,
    /// Unix timestamp de expiración del access_token.
    /// El frontend puede mostrar un countdown o solicitar refresh proactivamente.
    pub exp:                i64,
}

// ─────────────────────────────────────────────────────────────────────────────
// AuthState — Estado principal gestionado por Tauri
// ─────────────────────────────────────────────────────────────────────────────

/// Estado de autenticación OAuth 2.1 gestionado por el runtime de Tauri.
///
/// Se registra en `lib.rs` con `.manage(AuthState::new())` y se inyecta
/// en comandos y handlers de Axum mediante `tauri::State<AuthState>`.
///
/// Internamente usa `RwLock` para seguridad en concurrencia:
/// - Múltiples hilos pueden leer (`get_access_token`, `is_authenticated`) en paralelo.
/// - Solo un hilo escribe a la vez (`store`, `clear`).
pub struct AuthState {
    inner: RwLock<Option<TokenBundle>>,
    /// Verifier PKCE pendiente: se genera al iniciar el flujo y se consume
    /// al hacer el intercambio de código. Se guarda aquí para evitar
    /// pasarlo por el frontend (AUTH_SPEC §4).
    pending_pkce_verifier: RwLock<Option<String>>,
}

impl AuthState {
    /// Crea un nuevo `AuthState` vacío (sin sesión autenticada).
    pub fn new() -> Self {
        Self {
            inner: RwLock::new(None),
            pending_pkce_verifier: RwLock::new(None),
        }
    }

    // ── Escritura ────────────────────────────────────────────────────────────

    /// Almacena un nuevo paquete de tokens, reemplazando cualquier sesión anterior.
    ///
    /// Llamado por `auth::commands` después de un intercambio exitoso de código
    /// o después de un refresh exitoso.
    pub fn store(&self, bundle: TokenBundle) {
        let mut w = self.inner.write();
        *w = Some(bundle);
    }

    /// Elimina la sesión actual (logout local).
    ///
    /// Nota: no revoca el token en Keycloak. La revocación remota es
    /// responsabilidad de `auth::client::revoke()` antes de llamar a `clear()`.
    pub fn clear(&self) {
        let mut w = self.inner.write();
        *w = None;
    }

    /// Guarda el `code_verifier` PKCE temporalmente durante el flujo de login.
    /// Se consume (y elimina) exactamente una vez en `exchange_code()`.
    pub fn set_pending_verifier(&self, verifier: String) {
        let mut w = self.pending_pkce_verifier.write();
        *w = Some(verifier);
    }

    /// Consume y retorna el `code_verifier` pendiente.
    /// Retorna `None` si no hay flujo de login en curso o ya fue consumido.
    pub fn take_pending_verifier(&self) -> Option<String> {
        let mut w = self.pending_pkce_verifier.write();
        w.take()
    }

    // ── Lectura ──────────────────────────────────────────────────────────────

    /// Retorna el access_token **solo si existe y no ha expirado**.
    ///
    /// Añade un margen de 30 segundos para evitar enviar un token que expirará
    /// durante el tránsito de la petición HTTP.
    pub fn get_access_token(&self) -> Option<String> {
        let r = self.inner.read();
        r.as_ref().and_then(|bundle| {
            let margin = Duration::from_secs(30);
            if bundle.access_expires_at > Instant::now() + margin {
                Some(bundle.access_token.clone())
            } else {
                None
            }
        })
    }

    /// Retorna el refresh_token si existe y no ha expirado.
    /// Usado por `auth::commands::auth_refresh` para renovación silenciosa.
    pub fn get_refresh_token(&self) -> Option<String> {
        let r = self.inner.read();
        r.as_ref().and_then(|bundle| {
            if bundle.refresh_expires_at > Instant::now() {
                Some(bundle.refresh_token.clone())
            } else {
                None
            }
        })
    }

    /// Retorna el refresh_token y el instante de expiración del access_token.
    /// Utilizado por el daemon de renovación en background.
    pub fn get_refresh_info(&self) -> Option<(String, Instant)> {
        let r = self.inner.read();
        r.as_ref().map(|b| (b.refresh_token.clone(), b.access_expires_at))
    }

    /// `true` si hay un access_token válido y no expirado (con margen de 30s).
    pub fn is_authenticated(&self) -> bool {
        self.get_access_token().is_some()
    }

    /// Retorna la información de sesión apta para el frontend.
    ///
    /// Retorna `None` si no hay sesión o si el access_token ya expiró.
    /// El frontend usa esto para mostrar/ocultar el estado de login en el Sidebar.
    pub fn session_info(&self) -> Option<AuthSessionInfo> {
        let r = self.inner.read();
        r.as_ref().and_then(|bundle| {
            // No exponer sesión si el access_token ya venció
            let margin = Duration::from_secs(30);
            if bundle.access_expires_at <= Instant::now() + margin {
                return None;
            }
            Some(AuthSessionInfo {
                preferred_username: bundle.claims.preferred_username.clone(),
                name:               bundle.claims.name.clone(),
                email:              bundle.claims.email.clone(),
                user_type:          bundle.claims.user_type.clone(),
                roles:              bundle.claims.roles.clone(),
                exp:                bundle.claims.exp,
            })
        })
    }

    /// Retorna `true` si el access_token está próximo a vencer (menos de 60s)
    /// pero el refresh_token aún es válido. Señal para renovar proactivamente.
    pub fn needs_refresh(&self) -> bool {
        let r = self.inner.read();
        if let Some(bundle) = r.as_ref() {
            let soon = Duration::from_secs(60);
            let access_expires_soon = bundle.access_expires_at < Instant::now() + soon;
            let refresh_still_valid = bundle.refresh_expires_at > Instant::now();
            access_expires_soon && refresh_still_valid
        } else {
            false
        }
    }
}

impl Default for AuthState {
    fn default() -> Self {
        Self::new()
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests unitarios
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    fn make_bundle(access_secs: u64, refresh_secs: u64) -> TokenBundle {
        TokenBundle {
            access_token:       "eyJ.fake.access".to_string(),
            refresh_token:      "eyJ.fake.refresh".to_string(),
            access_expires_at:  Instant::now() + Duration::from_secs(access_secs),
            refresh_expires_at: Instant::now() + Duration::from_secs(refresh_secs),
            claims: StoredClaims {
                sub:                "d66688b1-e8b7-4c88-97c8-3458be291d89".to_string(),
                preferred_username: "david-carreno1".to_string(),
                name:               "DAVID ALEJANDRO CARREÑO PARRA".to_string(),
                email:              "david-carreno1@upc.edu.co".to_string(),
                user_type:          UserType::Estudiante,
                roles:              vec!["estudiante".to_string()],
                exp:                9999999999,
                sid:                "e9c14877-a4f4-4816-b8b4-45f9ac1756c7".to_string(),
            },
        }
    }

    #[test]
    fn nuevo_estado_no_autenticado() {
        let state = AuthState::new();
        assert!(!state.is_authenticated());
        assert!(state.get_access_token().is_none());
        assert!(state.session_info().is_none());
    }

    #[test]
    fn store_y_recuperar_token_valido() {
        let state = AuthState::new();
        // Token que expira en 300s (sin contar el margen de 30s → 270s netos)
        state.store(make_bundle(300, 1800));
        assert!(state.is_authenticated());
        assert!(state.get_access_token().is_some());
    }

    #[test]
    fn token_expirado_no_devuelve_nada() {
        let state = AuthState::new();
        // Token que "expiró" hace 1s (menos del margen de 30s → tratado como expirado)
        state.store(make_bundle(1, 1800));
        // Con el margen de 30s: 1s < 30s → no es válido
        assert!(!state.is_authenticated());
        assert!(state.get_access_token().is_none());
    }

    #[test]
    fn clear_limpia_sesion() {
        let state = AuthState::new();
        state.store(make_bundle(300, 1800));
        assert!(state.is_authenticated());
        state.clear();
        assert!(!state.is_authenticated());
        assert!(state.session_info().is_none());
    }

    #[test]
    fn session_info_devuelve_claims_correctos() {
        let state = AuthState::new();
        state.store(make_bundle(300, 1800));
        let info = state.session_info().expect("Debería haber sesión activa");
        assert_eq!(info.preferred_username, "david-carreno1");
        assert_eq!(info.user_type, UserType::Estudiante);
        assert_eq!(info.email, "david-carreno1@upc.edu.co");
    }

    #[test]
    fn user_type_parsing_correcto() {
        assert_eq!(UserType::from_claim("Estudiante"), UserType::Estudiante);
        assert_eq!(UserType::from_claim("Docente"),    UserType::Docente);
        assert_eq!(UserType::from_claim("Admin"),      UserType::Unknown);
        assert_eq!(UserType::from_claim(""),           UserType::Unknown);
    }

    #[test]
    fn pkce_verifier_pendiente_se_consume_una_vez() {
        let state = AuthState::new();
        state.set_pending_verifier("mi_verifier_secreto".to_string());
        // Primera llamada: devuelve el verifier
        let v = state.take_pending_verifier();
        assert_eq!(v, Some("mi_verifier_secreto".to_string()));
        // Segunda llamada: ya no hay nada (consumido)
        assert!(state.take_pending_verifier().is_none());
    }

    #[test]
    fn needs_refresh_cuando_access_proxima_a_vencer() {
        let state = AuthState::new();
        // access en 45s (< 60s → needs_refresh), refresh en 1800s
        state.store(make_bundle(45, 1800));
        assert!(state.needs_refresh());
    }

    #[test]
    fn no_needs_refresh_cuando_access_tiene_tiempo() {
        let state = AuthState::new();
        // access en 300s (> 60s → no needs_refresh)
        state.store(make_bundle(300, 1800));
        assert!(!state.needs_refresh());
    }
}
