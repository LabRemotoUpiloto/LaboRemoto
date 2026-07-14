//! `ipc` — Contrato de mensajería interna Message + ACK + backpressure
//! (REFACTOR #5, Fase A).
//!
//! ## Alcance de esta fase
//! Infraestructura pura, sin wiring: ningún emisor real (`ssh/terminal.rs`,
//! `sftp/transfers.rs`, `ai/*.rs`, `auth/commands.rs`) fue modificado. Este
//! módulo compila como parte del crate pero no es invocado desde ningún
//! comando todavía.
//!
//! ## Estrategia híbrida (decisión ya confirmada)
//! El backend construirá/encolará mensajes internamente vía
//! `Message` + `MessageEnvelope` + `BackpressureChannel` + ACK, pero la
//! entrega real al frontend seguirá usando, por ahora, los nombres de
//! canal Tauri existentes (`ssh_out_{id}`, `sftp_transfer`,
//! `auth://session-ready`, `ai:chunk`, etc.). El mapeo `Message` → nombre de
//! canal legado + `AppHandle::emit` es responsabilidad de una fase
//! posterior (dispatcher), no de esta.
//!
//! ## Piezas
//! - [`message`]: `Message`, `MessageEnvelope`, `Priority`.
//! - [`channel`]: `BackpressureChannel`, la cola bounded priority-aware.
//! - [`AckRegistry`] (este módulo): registro de mensajes `require_ack: true`
//!   pendientes de confirmación, con timeout configurable.

pub mod channel;
pub mod message;

pub use channel::{BackpressureChannel, ChannelError, EnqueueOutcome};
pub use message::{AuthStateKind, Message, MessageEnvelope, Priority};

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use parking_lot::Mutex;
use tokio::sync::oneshot;

/// Timeout por defecto para esperar un ACK, si el llamador no especifica uno.
pub const DEFAULT_ACK_TIMEOUT: Duration = Duration::from_secs(5);

/// Error retornado al esperar confirmación (ACK) de un mensaje.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum AckError {
    /// No se recibió el ACK dentro del timeout configurado.
    #[error("timeout esperando ACK del mensaje {message_id}")]
    Timeout { message_id: String },
    /// El registro fue descartado antes de recibir el ACK (ej. el proceso
    /// que debía confirmarlo se cayó).
    #[error("el canal de ACK del mensaje {message_id} se cerró sin confirmar")]
    Cancelled { message_id: String },
    /// Ya existía un registro pendiente para ese `message_id`. Registrar dos
    /// veces el mismo id sobrescribiría silenciosamente al primer `Sender`
    /// (ver REFACTOR #5 Fase A, fix de doble registro): en vez de eso se
    /// rechaza explícitamente el segundo intento.
    #[error("ya existe un registro de ACK pendiente para el mensaje {message_id}")]
    DuplicateRegistration { message_id: String },
}

/// Guard RAII que garantiza la limpieza de la entrada de `pending` sin
/// importar el camino de salida de `wait_for_ack` (éxito, timeout, o
/// cancelación externa del future que lo ejecuta, p. ej. `tokio::select!`
/// con otra rama ganando, `JoinHandle::abort()`, o el drop de una sesión
/// SSH/SFTP). Sin este guard, un `oneshot::Sender` quedaría huérfano en el
/// `HashMap` para siempre si el future de `wait_for_ack` se dropea antes de
/// llegar a sus ramas internas de limpieza (memory leak).
struct AckGuard {
    registry: Arc<Mutex<HashMap<String, oneshot::Sender<()>>>>,
    message_id: String,
    /// `true` cuando la limpieza ya fue realizada por el camino feliz
    /// (`ack()` ya removió la entrada); evita que el `Drop` remueva una
    /// entrada que pertenece a un registro posterior con el mismo id.
    completed: bool,
}

impl AckGuard {
    fn mark_completed(&mut self) {
        self.completed = true;
    }
}

impl Drop for AckGuard {
    fn drop(&mut self) {
        if !self.completed {
            self.registry.lock().remove(&self.message_id);
        }
    }
}

/// Registro de mensajes `require_ack: true` en espera de confirmación.
///
/// Cada `register` crea un par `oneshot`; el emisor se queda con el
/// `Receiver` (vía `wait_for_ack`) y este registro guarda el `Sender`,
/// indexado por `message_id`, hasta que:
/// - `ack(message_id)` lo dispara (caso éxito), o
/// - el `Receiver` hace timeout y el registro se limpia (caso timeout).
#[derive(Clone, Default)]
pub struct AckRegistry {
    pending: Arc<Mutex<HashMap<String, oneshot::Sender<()>>>>,
}

impl AckRegistry {
    pub fn new() -> Self {
        Self {
            pending: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Cuántos ACKs están actualmente pendientes de confirmación.
    pub fn pending_count(&self) -> usize {
        self.pending.lock().len()
    }

    /// Registra un `message_id` como pendiente de ACK y retorna un
    /// [`AckGuard`] (limpieza RAII) junto con el `oneshot::Receiver`
    /// correspondiente. Uso interno de `wait_for_ack`; expuesto también
    /// para tests que necesiten controlar el timing manualmente.
    ///
    /// Retorna `Err(AckError::DuplicateRegistration)` si ya había un
    /// registro pendiente para ese `message_id`, en vez de sobrescribir
    /// silenciosamente al `Sender` anterior (lo cual dejaría al primer
    /// llamador colgado con un `Cancelled` espurio y podría hacer que el
    /// segundo llamador nunca reciba su ACK real).
    fn register(
        &self,
        message_id: impl Into<String>,
    ) -> Result<(AckGuard, oneshot::Receiver<()>), AckError> {
        let message_id = message_id.into();
        let (tx, rx) = oneshot::channel();

        let mut pending = self.pending.lock();
        if pending.contains_key(&message_id) {
            return Err(AckError::DuplicateRegistration { message_id });
        }
        pending.insert(message_id.clone(), tx);
        drop(pending);

        tracing::debug!(message_id = %message_id, "ipc: ack registrado, esperando confirmación");
        let guard = AckGuard {
            registry: self.pending.clone(),
            message_id: message_id.clone(),
            completed: false,
        };
        Ok((guard, rx))
    }

    /// Confirma un mensaje pendiente. Retorna `true` si había un registro
    /// esperando ese `message_id` (y lo consume); `false` si no existía
    /// (ya confirmado, ya expiró, o nunca requirió ACK).
    pub fn ack(&self, message_id: &str) -> bool {
        let sender = self.pending.lock().remove(message_id);
        match sender {
            Some(tx) => {
                let sent = tx.send(()).is_ok();
                tracing::debug!(message_id = %message_id, delivered = sent, "ipc: ack recibido");
                sent
            }
            None => {
                tracing::debug!(message_id = %message_id, "ipc: ack recibido para mensaje no registrado (tardío o desconocido)");
                false
            }
        }
    }

    /// Registra el `message_id` del envelope y espera su ACK hasta
    /// `timeout`. Si el timeout se cumple primero, limpia el registro
    /// (evita fugas de memoria en `pending`) y retorna
    /// `AckError::Timeout`. Retorna `AckError::DuplicateRegistration` si ya
    /// había otro `wait_for_ack` en curso para el mismo `message_id`.
    ///
    /// La limpieza de `pending` está garantizada por un guard RAII
    /// (`AckGuard`) que vive durante toda la ejecución de esta función: si
    /// el future es cancelado o dropeado externamente antes de llegar a
    /// cualquiera de las ramas de abajo (ej. `tokio::select!` con otra rama
    /// ganando, o `JoinHandle::abort()`), la entrada igual se remueve del
    /// `HashMap` al destruirse el guard, evitando un leak permanente.
    #[tracing::instrument(skip(self), fields(message_id = %message_id.as_ref()))]
    pub async fn wait_for_ack(
        &self,
        message_id: impl AsRef<str>,
        timeout: Duration,
    ) -> Result<(), AckError> {
        let message_id = message_id.as_ref().to_string();
        let (mut guard, rx) = self.register(message_id.clone())?;

        match tokio::time::timeout(timeout, rx).await {
            Ok(Ok(())) => {
                tracing::debug!(message_id = %message_id, "ipc: ack confirmado dentro de timeout");
                // `ack()` ya removió la entrada del map; evitamos que el
                // guard intente removerla de nuevo (podría pertenecer a un
                // registro posterior con el mismo id).
                guard.mark_completed();
                Ok(())
            }
            Ok(Err(_recv_error)) => {
                // El Sender se dropeó sin enviar (ej. limpieza externa).
                // El guard limpia `pending` al salir de scope.
                tracing::warn!(message_id = %message_id, "ipc: ack cancelado (sender dropeado)");
                Err(AckError::Cancelled { message_id })
            }
            Err(_elapsed) => {
                // El guard limpia `pending` al salir de scope.
                tracing::warn!(message_id = %message_id, "ipc: timeout esperando ack");
                Err(AckError::Timeout { message_id })
            }
        }
    }

    /// Espera el ACK del `message_id` del envelope usando
    /// `DEFAULT_ACK_TIMEOUT`. Atajo conveniente sobre `wait_for_ack`.
    pub async fn wait_for_envelope_ack(&self, envelope: &MessageEnvelope) -> Result<(), AckError> {
        self.wait_for_ack(&envelope.id, DEFAULT_ACK_TIMEOUT).await
    }
}

/// Punto de entrada combinado: cola con backpressure + registro de ACK.
/// Agrupa las dos piezas que un futuro dispatcher (fase B) necesitará
/// inyectar como estado de Tauri (`.manage(IpcHub::new())`).
#[derive(Clone)]
pub struct IpcHub {
    pub channel: Arc<BackpressureChannel>,
    pub acks: AckRegistry,
}

impl IpcHub {
    pub fn new() -> Self {
        Self {
            channel: Arc::new(BackpressureChannel::new()),
            acks: AckRegistry::new(),
        }
    }

    /// Encola un mensaje y retorna el resultado del encolado
    /// (`EnqueueOutcome`), no el `message_id`.
    ///
    /// `envelope` se mueve por valor (queda consumido por esta llamada). Si
    /// `require_ack` es `true` en el envelope y el llamador necesita esperar
    /// la confirmación después de encolar, debe clonar `envelope.id` **antes**
    /// de invocar `enqueue`, por ejemplo:
    ///
    /// ```ignore
    /// let id = envelope.id.clone();
    /// let outcome = hub.enqueue(envelope);
    /// // ... más adelante, en otra tarea:
    /// hub.acks.wait_for_ack(id, DEFAULT_ACK_TIMEOUT).await
    /// ```
    #[tracing::instrument(skip(self, envelope), fields(message_id = %envelope.id, priority = ?envelope.priority, require_ack = envelope.require_ack))]
    pub fn enqueue(&self, envelope: MessageEnvelope) -> EnqueueOutcome {
        tracing::debug!("ipc: encolando mensaje");
        self.channel.enqueue(envelope)
    }
}

impl Default for IpcHub {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn ack_success_when_confirmed_before_timeout() {
        let registry = AckRegistry::new();
        let registry_clone = registry.clone();

        let wait_handle = tokio::spawn(async move {
            registry_clone
                .wait_for_ack("msg-1", Duration::from_millis(500))
                .await
        });

        // Deja que `wait_for_ack` registre el receiver antes de confirmar.
        tokio::time::sleep(Duration::from_millis(20)).await;
        assert!(registry.ack("msg-1"));

        let result = wait_handle.await.expect("no debe hacer panic");
        assert_eq!(result, Ok(()));
    }

    #[tokio::test]
    async fn ack_times_out_when_never_confirmed() {
        let registry = AckRegistry::new();
        let result = registry
            .wait_for_ack("msg-timeout", Duration::from_millis(50))
            .await;

        assert_eq!(
            result,
            Err(AckError::Timeout {
                message_id: "msg-timeout".to_string()
            })
        );
        // El registro se limpia tras el timeout: no debe quedar pendiente.
        assert_eq!(registry.pending_count(), 0);
    }

    #[tokio::test]
    async fn ack_for_unknown_message_id_is_noop() {
        let registry = AckRegistry::new();
        assert!(!registry.ack("nunca-registrado"));
    }

    #[tokio::test]
    async fn ack_registry_cleans_up_after_successful_ack() {
        let registry = AckRegistry::new();
        let registry_clone = registry.clone();

        let wait_handle = tokio::spawn(async move {
            registry_clone
                .wait_for_ack("msg-cleanup", Duration::from_millis(500))
                .await
        });
        tokio::time::sleep(Duration::from_millis(20)).await;
        registry.ack("msg-cleanup");
        wait_handle.await.expect("no debe hacer panic").unwrap();

        assert_eq!(registry.pending_count(), 0);
    }

    #[tokio::test]
    async fn wait_for_ack_cleans_up_when_future_is_aborted_before_completion() {
        // Reproduce el escenario del leak: el future de `wait_for_ack` es
        // cancelado (via `JoinHandle::abort()`) antes de llegar a cualquiera
        // de sus ramas internas de limpieza (éxito/timeout/cancelled). El
        // `AckGuard` debe garantizar que la entrada se remueva igual.
        let registry = AckRegistry::new();
        let registry_clone = registry.clone();

        let wait_handle = tokio::spawn(async move {
            registry_clone
                .wait_for_ack("msg-aborted", Duration::from_secs(30))
                .await
        });

        // Deja que `wait_for_ack` alcance a registrarse en el map.
        tokio::time::sleep(Duration::from_millis(20)).await;
        assert_eq!(registry.pending_count(), 1);

        // Cancela el future a mitad de camino, sin que se ejecute ninguna
        // rama de limpieza dentro de `wait_for_ack`.
        wait_handle.abort();
        let _ = wait_handle.await;

        // Espera breve para dar tiempo al drop/cleanup a propagarse.
        tokio::time::sleep(Duration::from_millis(20)).await;

        assert_eq!(
            registry.pending_count(),
            0,
            "el guard RAII debe limpiar `pending` aunque el future se aborte externamente"
        );
    }

    #[tokio::test]
    async fn wait_for_ack_rejects_duplicate_registration_for_same_message_id() {
        // Dos `wait_for_ack` concurrentes para el mismo `message_id`: el
        // segundo debe recibir un error explícito de duplicado en vez de
        // sobrescribir silenciosamente al primer `Sender`.
        let registry = AckRegistry::new();
        let registry_first = registry.clone();

        // El primero se queda "colgado" (nunca se confirma ni expira dentro
        // de la ventana del test) para simular la condición de carrera.
        let first_handle = tokio::spawn(async move {
            registry_first
                .wait_for_ack("msg-duplicate", Duration::from_secs(30))
                .await
        });

        tokio::time::sleep(Duration::from_millis(20)).await;
        assert_eq!(registry.pending_count(), 1);

        // El segundo intento, mismo message_id, debe fallar explícitamente.
        let second_result = registry
            .wait_for_ack("msg-duplicate", Duration::from_millis(50))
            .await;

        assert_eq!(
            second_result,
            Err(AckError::DuplicateRegistration {
                message_id: "msg-duplicate".to_string()
            })
        );

        // El primer registro sigue intacto (no fue pisado por el segundo
        // intento).
        assert_eq!(registry.pending_count(), 1);
        assert!(registry.ack("msg-duplicate"));

        let first_result = first_handle.await.expect("no debe hacer panic");
        assert_eq!(first_result, Ok(()));
        assert_eq!(registry.pending_count(), 0);
    }

    #[tokio::test]
    async fn ipc_hub_enqueue_delegates_to_channel() {
        let hub = IpcHub::new();
        let envelope = MessageEnvelope::new(
            Message::ChatOutput {
                session_id: "s".into(),
                text: "hola".into(),
            },
            Priority::High,
            false,
        );

        let outcome = hub.enqueue(envelope);
        assert_eq!(outcome, EnqueueOutcome::Enqueued);
        assert_eq!(hub.channel.len(), 1);
    }

    #[tokio::test]
    async fn ipc_hub_wait_for_envelope_ack_success() {
        let hub = IpcHub::new();
        let envelope = MessageEnvelope::new(
            Message::TerminalOutput {
                session_id: "s".into(),
                data: "ls\n".into(),
            },
            Priority::High,
            true,
        );
        let id = envelope.id.clone();
        let acks = hub.acks.clone();

        let wait_handle =
            tokio::spawn(async move { hub.acks.wait_for_envelope_ack(&envelope).await });
        tokio::time::sleep(Duration::from_millis(20)).await;
        acks.ack(&id);

        let result = wait_handle.await.expect("no debe hacer panic");
        assert_eq!(result, Ok(()));
    }
}
