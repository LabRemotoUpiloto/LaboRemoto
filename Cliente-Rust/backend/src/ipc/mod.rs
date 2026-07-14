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

    /// Registra un `message_id` como pendiente de ACK y retorna el
    /// `oneshot::Receiver` correspondiente. Uso interno de `wait_for_ack`;
    /// expuesto también para tests que necesiten controlar el timing
    /// manualmente.
    fn register(&self, message_id: impl Into<String>) -> oneshot::Receiver<()> {
        let message_id = message_id.into();
        let (tx, rx) = oneshot::channel();
        self.pending.lock().insert(message_id.clone(), tx);
        tracing::debug!(message_id = %message_id, "ipc: ack registrado, esperando confirmación");
        rx
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
    /// `AckError::Timeout`.
    #[tracing::instrument(skip(self), fields(message_id = %message_id.as_ref()))]
    pub async fn wait_for_ack(
        &self,
        message_id: impl AsRef<str>,
        timeout: Duration,
    ) -> Result<(), AckError> {
        let message_id = message_id.as_ref().to_string();
        let rx = self.register(message_id.clone());

        match tokio::time::timeout(timeout, rx).await {
            Ok(Ok(())) => {
                tracing::debug!(message_id = %message_id, "ipc: ack confirmado dentro de timeout");
                Ok(())
            }
            Ok(Err(_recv_error)) => {
                // El Sender se dropeó sin enviar (ej. limpieza externa).
                self.pending.lock().remove(&message_id);
                tracing::warn!(message_id = %message_id, "ipc: ack cancelado (sender dropeado)");
                Err(AckError::Cancelled { message_id })
            }
            Err(_elapsed) => {
                self.pending.lock().remove(&message_id);
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

    /// Encola un mensaje. Si `require_ack` es `true` en el envelope,
    /// retorna también el `message_id` para que el llamador pueda esperar
    /// confirmación vía `self.acks.wait_for_ack(id, timeout)`.
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
