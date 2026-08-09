//! Cola de mensajería interna con backpressure (REFACTOR #5, Fase A).
//!
//! Implementación aislada de Tauri/red: un `VecDeque<MessageEnvelope>`
//! protegido por `parking_lot::Mutex` (ya en `Cargo.toml`, usado en todo el
//! backend — ver `state_core::auth_state`), más un `tokio::sync::Notify`
//! para permitir un `dequeue` asíncrono cuando la cola está vacía.
//!
//! Se eligió `VecDeque` + `Mutex` en vez de `tokio::sync::mpsc` porque la
//! spec de backpressure requiere **inspeccionar y eliminar selectivamente**
//! elementos de baja prioridad ya encolados (drop de `Priority::Low` cuando
//! `len > 1000`), algo que un `mpsc::Sender::send` no permite: una vez
//! enviado un mensaje a un `mpsc`, no hay forma de sacarlo de la cola salvo
//! consumiéndolo por el receptor. Un `VecDeque` da control total sobre el
//! contenido de la cola en el momento del `enqueue`.
//!
//! ## Reglas de backpressure (spec REFACTOR #5)
//! - Límite de cola: 1000 mensajes.
//! - `len > 1000`: al encolar, se descartan mensajes `Priority::Low` ya en
//!   cola (el más antiguo primero) para hacer espacio. `Priority::High`
//!   **nunca** se descarta bajo ninguna circunstancia; si no hay `Low` que
//!   descartar y la cola sigue llena, `High` y `Normal` se encolan igual
//!   (la cola puede crecer temporalmente por encima del límite antes que
//!   perder un mensaje `High`).
//! - `len > 500`: los mensajes `Priority::Normal` se marcan para entrega en
//!   lotes de 50ms (`ThrottleWindow::NORMAL_BATCH`) en vez de inmediata.
//! - `len <= 100`: sin throttling, cualquier prioridad se entrega de
//!   inmediato.
//! - Entre 100 y 500: comportamiento intermedio no throttled explícitamente
//!   por la spec; se trata igual que `<= 100` (sin throttling) hasta cruzar
//!   el umbral de 500. Ver `classify` para el detalle y el reporte de la
//!   tarea para la justificación de esta interpretación.

use std::collections::VecDeque;
use std::time::Duration;

use parking_lot::Mutex;
use tokio::sync::Notify;

use crate::ipc::message::{MessageEnvelope, Priority};

/// Límite duro de la cola. Por encima de este tamaño se empieza a
/// descartar `Priority::Low`.
pub const QUEUE_DROP_LOW_THRESHOLD: usize = 1000;
/// Por encima de este tamaño, `Priority::Normal` se throttlea.
pub const QUEUE_THROTTLE_NORMAL_THRESHOLD: usize = 500;
/// Por debajo (o igual) a este tamaño, no hay throttling de ningún tipo.
pub const QUEUE_NO_THROTTLE_THRESHOLD: usize = 100;
/// Ventana de batching aplicada a `Priority::Normal` cuando la cola supera
/// `QUEUE_THROTTLE_NORMAL_THRESHOLD`.
pub const NORMAL_THROTTLE_WINDOW: Duration = Duration::from_millis(50);

/// Resultado de intentar encolar un `MessageEnvelope`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EnqueueOutcome {
    /// Se encoló para entrega inmediata (cola en estado normal).
    Enqueued,
    /// Se encoló pero debe entregarse respetando la ventana de throttling
    /// (el llamador que hace `dequeue`/batching es responsable de honrar
    /// esta ventana; esta cola solo la reporta).
    EnqueuedThrottled { window: Duration },
    /// El mensaje entrante era `Priority::Low` y la cola ya estaba en (o
    /// por encima) del límite tras liberar espacio: se descartó sin
    /// encolar.
    DroppedLowPriority,
}

/// Error retornado por operaciones que pueden fallar (hoy solo reservado
/// para futuras extensiones; `enqueue` no falla, siempre retorna un
/// `EnqueueOutcome` — se mantiene el tipo para no romper la firma pública
/// si en el futuro se agregan fallos, ej. canal cerrado).
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ChannelError {
    #[error("el canal fue cerrado")]
    Closed,
}

/// Cola bounded con backpressure priority-aware.
pub struct BackpressureChannel {
    inner: Mutex<VecDeque<MessageEnvelope>>,
    notify: Notify,
}

impl BackpressureChannel {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(VecDeque::new()),
            notify: Notify::new(),
        }
    }

    /// Cantidad de mensajes actualmente en cola.
    pub fn len(&self) -> usize {
        self.inner.lock().len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Encola un envelope aplicando las reglas de backpressure.
    /// Nunca descarta `Priority::High`.
    pub fn enqueue(&self, envelope: MessageEnvelope) -> EnqueueOutcome {
        let mut queue = self.inner.lock();

        if queue.len() > QUEUE_DROP_LOW_THRESHOLD {
            if envelope.priority == Priority::Low {
                tracing::debug!(
                    message_id = %envelope.id,
                    queue_len = queue.len(),
                    "ipc: dropping Low priority message, queue over capacity"
                );
                return EnqueueOutcome::DroppedLowPriority;
            }
            // No hay espacio "sano", pero no es Low: intentamos liberar
            // espacio descartando el Low más antiguo en cola, si existe.
            if let Some(pos) = queue.iter().position(|e| e.priority == Priority::Low) {
                let evicted = queue.remove(pos);
                if let Some(evicted) = evicted {
                    tracing::debug!(
                        message_id = %evicted.id,
                        "ipc: evicting queued Low priority message to make room"
                    );
                }
            }
            // Si no había ningún Low que evictar, se deja crecer la cola:
            // High/Normal jamás se descartan.
        }

        let queue_len_before_push = queue.len();
        let priority = envelope.priority;
        queue.push_back(envelope);
        drop(queue);
        self.notify.notify_one();

        if priority == Priority::Normal && queue_len_before_push > QUEUE_THROTTLE_NORMAL_THRESHOLD {
            EnqueueOutcome::EnqueuedThrottled {
                window: NORMAL_THROTTLE_WINDOW,
            }
        } else {
            EnqueueOutcome::Enqueued
        }
    }

    /// Saca el siguiente mensaje de la cola (FIFO), sin bloquear.
    pub fn try_dequeue(&self) -> Option<MessageEnvelope> {
        self.inner.lock().pop_front()
    }

    /// Saca el siguiente mensaje, esperando asíncronamente si la cola está
    /// vacía.
    pub async fn dequeue(&self) -> MessageEnvelope {
        loop {
            if let Some(envelope) = self.try_dequeue() {
                return envelope;
            }
            self.notify.notified().await;
        }
    }

    /// Indica si, dado el tamaño actual de la cola, un mensaje `Normal`
    /// debería entregarse throttled. Expuesto para que consumidores (ej.
    /// el futuro dispatcher de fase B) puedan consultar el estado sin
    /// tener que encolar un mensaje de prueba.
    pub fn should_throttle_normal(&self) -> bool {
        self.len() > QUEUE_THROTTLE_NORMAL_THRESHOLD
    }
}

impl Default for BackpressureChannel {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ipc::message::Message;

    fn envelope(priority: Priority) -> MessageEnvelope {
        MessageEnvelope::new(
            Message::ChatOutput {
                session_id: "s".into(),
                text: "x".into(),
            },
            priority,
            false,
        )
    }

    fn fill(channel: &BackpressureChannel, count: usize, priority: Priority) {
        for _ in 0..count {
            channel.enqueue(envelope(priority));
        }
    }

    #[test]
    fn enqueue_below_all_thresholds_is_not_throttled() {
        let channel = BackpressureChannel::new();
        fill(&channel, 10, Priority::Normal);
        let outcome = channel.enqueue(envelope(Priority::Normal));
        assert_eq!(outcome, EnqueueOutcome::Enqueued);
    }

    #[test]
    fn normal_priority_throttled_above_500() {
        let channel = BackpressureChannel::new();
        fill(&channel, 501, Priority::Normal);
        let outcome = channel.enqueue(envelope(Priority::Normal));
        assert_eq!(
            outcome,
            EnqueueOutcome::EnqueuedThrottled {
                window: NORMAL_THROTTLE_WINDOW
            }
        );
    }

    #[test]
    fn high_priority_never_throttled_even_above_500() {
        let channel = BackpressureChannel::new();
        fill(&channel, 600, Priority::Normal);
        let outcome = channel.enqueue(envelope(Priority::High));
        assert_eq!(outcome, EnqueueOutcome::Enqueued);
    }

    #[test]
    fn low_priority_dropped_when_queue_over_1000() {
        let channel = BackpressureChannel::new();
        fill(&channel, 1001, Priority::Normal);
        let outcome = channel.enqueue(envelope(Priority::Low));
        assert_eq!(outcome, EnqueueOutcome::DroppedLowPriority);
    }

    #[test]
    fn high_priority_never_dropped_even_when_queue_full_of_normal() {
        let channel = BackpressureChannel::new();
        fill(&channel, 1500, Priority::Normal);
        let outcome = channel.enqueue(envelope(Priority::High));
        assert_ne!(outcome, EnqueueOutcome::DroppedLowPriority);
        // Se debe poder recuperar: el mensaje High realmente quedó en cola.
        assert_eq!(channel.len(), 1501);
    }

    #[test]
    fn queued_low_priority_evicted_to_make_room_for_high() {
        let channel = BackpressureChannel::new();
        fill(&channel, 1001, Priority::Low);
        let len_before = channel.len();
        let outcome = channel.enqueue(envelope(Priority::High));
        assert_eq!(outcome, EnqueueOutcome::Enqueued);
        // Un Low fue evictado y el High fue agregado: tamaño neto igual.
        assert_eq!(channel.len(), len_before);
    }

    #[test]
    fn high_priority_never_dropped_across_many_low_fills() {
        let channel = BackpressureChannel::new();
        // Satura la cola exclusivamente con Low, muy por encima del límite.
        fill(&channel, 5000, Priority::Low);
        for _ in 0..50 {
            let outcome = channel.enqueue(envelope(Priority::High));
            assert_ne!(outcome, EnqueueOutcome::DroppedLowPriority);
        }
    }

    #[test]
    fn dequeue_is_fifo() {
        let channel = BackpressureChannel::new();
        let first = envelope(Priority::High);
        let first_id = first.id.clone();
        channel.enqueue(first);
        channel.enqueue(envelope(Priority::Normal));

        let dequeued = channel.try_dequeue().expect("debe haber un mensaje");
        assert_eq!(dequeued.id, first_id);
    }

    #[tokio::test]
    async fn async_dequeue_waits_for_message() {
        let channel = std::sync::Arc::new(BackpressureChannel::new());
        let channel_clone = channel.clone();

        let handle = tokio::spawn(async move { channel_clone.dequeue().await });

        // Deja que la tarea llegue al `.await` antes de encolar.
        tokio::task::yield_now().await;
        channel.enqueue(envelope(Priority::Normal));

        let result = tokio::time::timeout(Duration::from_secs(1), handle)
            .await
            .expect("no debe hacer timeout")
            .expect("la tarea no debe hacer panic");
        assert!(matches!(result.message, Message::ChatOutput { .. }));
    }

    #[test]
    fn should_throttle_normal_reflects_queue_length() {
        let channel = BackpressureChannel::new();
        assert!(!channel.should_throttle_normal());
        fill(&channel, 501, Priority::Normal);
        assert!(channel.should_throttle_normal());
    }
}
