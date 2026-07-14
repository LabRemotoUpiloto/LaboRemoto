//! Tipos del contrato de mensajería interna (REFACTOR #5, Fase A).
//!
//! `Message` modela los eventos de dominio que hoy el backend emite
//! directamente vía `AppHandle::emit` con nombres de canal ad-hoc
//! (`ssh_out_{id}`, `sftp_transfer`, `auth://session-ready`, `ai:chunk`, ...).
//! Esta fase NO reemplaza esos emisores; solo introduce el tipo con el que,
//! en fases posteriores, se podrá construir/encolar esos mismos eventos de
//! forma uniforme antes de traducirlos al nombre de canal Tauri legado
//! (estrategia híbrida: transporte legado, contrato interno nuevo).
//!
//! ## `AuthStateKind`
//! El proyecto no tiene hoy un enum para representar el "nuevo estado" de
//! autenticación: `auth/commands.rs` emite tres canales distintos
//! (`auth://session-ready`, `auth://logged-out`, `auth://error`) con
//! payloads heterogéneos. Para no perder esa distinción al modelar
//! `AuthStateChange` como un `Message`, se introduce aquí `AuthStateKind`
//! (en vez de `new_state: String` libre) como la forma tipada de esos tres
//! estados. Ver el reporte de la tarea para más contexto de esta decisión.

use serde::{Deserialize, Serialize};

/// Estado de autenticación al que transiciona la sesión. Espeja los tres
/// canales legados usados hoy en `auth::commands`
/// (`EVENT_SESSION_READY` / `"auth://logged-out"` / `EVENT_AUTH_ERROR`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthStateKind {
    SessionReady,
    LoggedOut,
    Error,
}

/// Eventos de dominio que el backend puede necesitar entregar al frontend
/// en tiempo real. Cada variante corresponde (hoy) a uno o más canales
/// Tauri legados; ver el módulo `ipc` para el mapeo de entrega híbrida.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Message {
    /// Salida de una terminal SSH (hoy: `ssh_out_{session_id}`).
    TerminalOutput { session_id: String, data: String },
    /// Progreso de una transferencia SFTP (hoy: canal `sftp_transfer`,
    /// payload `{"type":"progress", ...}`).
    SftpProgress {
        session_id: String,
        bytes: u64,
        total: u64,
    },
    /// Cambio de estado de autenticación (hoy: `auth://session-ready`,
    /// `auth://logged-out`, `auth://error`).
    AuthStateChange {
        session_id: String,
        new_state: AuthStateKind,
    },
    /// Notificación de error genérica, con la misma forma que
    /// `CommandError` (`code`/`message`/`retryable`) para mantener
    /// consistencia con `cmd::protocol` (ver REFACTOR #3).
    ErrorNotification {
        code: String,
        message: String,
        retryable: bool,
    },
    /// Salida de texto del chat IA (hoy: `ai:chunk`).
    ChatOutput { session_id: String, text: String },
}

/// Prioridad de entrega de un mensaje. Determina el comportamiento de
/// backpressure en `ipc::channel::BackpressureChannel`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Priority {
    High,
    Normal,
    Low,
}

/// Envoltorio de transporte de un `Message`, con identidad propia para
/// tracing/ACK y la prioridad/necesidad de confirmación con la que debe
/// tratarlo la cola.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MessageEnvelope {
    /// UUID v4 generado al construir el envelope. Se usa para correlacionar
    /// logs de tracing y para el registro de ACK (`ipc::AckRegistry`).
    pub id: String,
    pub message: Message,
    pub priority: Priority,
    pub require_ack: bool,
}

impl MessageEnvelope {
    /// Construye un envelope nuevo con un `id` UUID v4 fresco.
    pub fn new(message: Message, priority: Priority, require_ack: bool) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            message,
            priority,
            require_ack,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roundtrip<T>(value: &T)
    where
        T: Serialize + for<'de> Deserialize<'de> + PartialEq + std::fmt::Debug,
    {
        let json = serde_json::to_string(value).expect("serialize");
        let back: T = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(*value, back);
    }

    #[test]
    fn priority_roundtrip_all_variants() {
        roundtrip(&Priority::High);
        roundtrip(&Priority::Normal);
        roundtrip(&Priority::Low);
    }

    #[test]
    fn priority_serializes_as_snake_case() {
        let json = serde_json::to_string(&Priority::High).unwrap();
        assert_eq!(json, "\"high\"");
    }

    #[test]
    fn auth_state_kind_roundtrip_all_variants() {
        roundtrip(&AuthStateKind::SessionReady);
        roundtrip(&AuthStateKind::LoggedOut);
        roundtrip(&AuthStateKind::Error);
    }

    #[test]
    fn message_terminal_output_roundtrip() {
        let msg = Message::TerminalOutput {
            session_id: "sess-1".into(),
            data: "hello\r\n".into(),
        };
        roundtrip(&msg);
    }

    #[test]
    fn message_sftp_progress_roundtrip() {
        let msg = Message::SftpProgress {
            session_id: "sess-1".into(),
            bytes: 1024,
            total: 4096,
        };
        roundtrip(&msg);
    }

    #[test]
    fn message_auth_state_change_roundtrip() {
        let msg = Message::AuthStateChange {
            session_id: "sess-1".into(),
            new_state: AuthStateKind::SessionReady,
        };
        roundtrip(&msg);
    }

    #[test]
    fn message_error_notification_roundtrip() {
        let msg = Message::ErrorNotification {
            code: "SSH_ERROR".into(),
            message: "Conexión perdida".into(),
            retryable: true,
        };
        roundtrip(&msg);
    }

    #[test]
    fn message_chat_output_roundtrip() {
        let msg = Message::ChatOutput {
            session_id: "sess-1".into(),
            text: "Hola".into(),
        };
        roundtrip(&msg);
    }

    #[test]
    fn message_tagged_shape_has_type_field() {
        let msg = Message::ChatOutput {
            session_id: "sess-1".into(),
            text: "Hola".into(),
        };
        let json: serde_json::Value = serde_json::to_value(&msg).unwrap();
        assert_eq!(json["type"], "chat_output");
        assert_eq!(json["session_id"], "sess-1");
        assert_eq!(json["text"], "Hola");
    }

    #[test]
    fn message_envelope_roundtrip() {
        let envelope = MessageEnvelope::new(
            Message::TerminalOutput {
                session_id: "sess-1".into(),
                data: "$ ls\r\n".into(),
            },
            Priority::Normal,
            true,
        );
        roundtrip(&envelope);
    }

    #[test]
    fn message_envelope_new_generates_unique_ids() {
        let a = MessageEnvelope::new(
            Message::ChatOutput { session_id: "s".into(), text: "a".into() },
            Priority::Low,
            false,
        );
        let b = MessageEnvelope::new(
            Message::ChatOutput { session_id: "s".into(), text: "b".into() },
            Priority::Low,
            false,
        );
        assert_ne!(a.id, b.id);
        assert!(uuid::Uuid::parse_str(&a.id).is_ok());
    }
}
