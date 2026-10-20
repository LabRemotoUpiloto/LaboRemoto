//! cmd/broker_client — boilerplate común para hablar con los brokers de la Pi
//! (NVR, Moodle, sesiones, dispositivos): todos autentican con el access_token
//! de Keycloak de la sesión activa y comparten el mismo cliente HTTP
//! (`cmd::nvr::shinobi::HTTP_CLIENT`) contra `BROKER_HOST`. Antes cada módulo
//! reimplementaba a mano "sacar el token + GET + bearer_auth + mapear error
//! de red"; esto lo centraliza para que cada módulo solo aporte su propia
//! interpretación de errores de dominio (`map_err`).

use std::sync::Arc;

use reqwest::StatusCode;

use crate::cmd::protocol::CommandError;
use crate::session_manager::SessionManager;

pub(crate) use crate::cmd::nvr::shinobi::{BROKER_HOST, HTTP_CLIENT};

/// Token de acceso de la sesión activa, o `AUTH_REQUIRED` si no hay sesión iniciada.
pub(crate) async fn access_token(manager: &Arc<dyn SessionManager>) -> Result<String, CommandError> {
    manager
        .get_access_token()
        .await
        .map_err(|e| CommandError::internal("SESSION_ERROR", e.to_string()))?
        .ok_or_else(|| CommandError::permanent("AUTH_REQUIRED", "Debes iniciar sesión"))
}

/// Traduce un error de red/timeout de reqwest a un `CommandError` transitorio.
/// `que` describe qué se estaba contactando (p. ej. "los cursos", "el registro de sesiones"), para el mensaje.
pub(crate) fn error_de_red(ctx: &str, que: &str, e: reqwest::Error) -> CommandError {
    let err = if e.is_timeout() {
        CommandError::transient("OPERATION_TIMEOUT", format!("Timeout contactando {que}: {e}"))
    } else {
        CommandError::transient("COMMUNICATION_ERROR", format!("Error contactando {que}: {e}"))
    };
    err.with_retry_after(3000).with_context(ctx, "broker")
}

/// GET autenticado contra el broker: saca el token, arma la URL con `BROKER_HOST`,
/// y devuelve el status + cuerpo como texto. La interpretación de errores de
/// dominio (401/403/404/etc.) y el parseo del cuerpo quedan del lado del caller
/// (cada broker tiene su propio shape de error).
pub(crate) async fn get_text(
    ctx: &str,
    que: &str,
    ruta: &str,
    manager: &Arc<dyn SessionManager>,
) -> Result<(StatusCode, String), CommandError> {
    let token = access_token(manager).await?;
    let response = HTTP_CLIENT
        .get(format!("{BROKER_HOST}{ruta}"))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| error_de_red(ctx, que, e))?;
    let status = response.status();
    let text = response.text().await.map_err(|e| error_de_red(ctx, que, e))?;
    Ok((status, text))
}

/// `get_text` + parseo a JSON para el caso común (éxito = JSON del tipo esperado,
/// error = `map_err` decide el `CommandError` específico del dominio a partir del
/// status y el cuerpo de la respuesta).
pub(crate) async fn get_json<T, F>(
    ctx: &str,
    que: &str,
    ruta: &str,
    manager: &Arc<dyn SessionManager>,
    map_err: F,
) -> Result<T, CommandError>
where
    T: serde::de::DeserializeOwned,
    F: FnOnce(StatusCode, &str) -> CommandError,
{
    let (status, text) = get_text(ctx, que, ruta, manager).await?;
    if !status.is_success() {
        return Err(map_err(status, &text));
    }
    serde_json::from_str(&text)
        .map_err(|e| CommandError::permanent("INVALID_DATA", format!("Respuesta inválida del broker: {e}")).with_context(ctx, "broker"))
}
