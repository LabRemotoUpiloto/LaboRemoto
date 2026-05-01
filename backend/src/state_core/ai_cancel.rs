use std::collections::HashMap;

// ── Registro de cancelación para peticiones AI ──────────────────────────────
pub struct AiCancelRegistry {
  senders: parking_lot::Mutex<HashMap<String, tokio::sync::watch::Sender<bool>>>,
}

impl AiCancelRegistry {
  pub fn new() -> Self {
    Self { senders: parking_lot::Mutex::new(HashMap::new()) }
  }

  /// Registra un nuevo request y devuelve el receiver para escuchar cancelación.
  pub fn register(&self, id: &str) -> tokio::sync::watch::Receiver<bool> {
    let (tx, rx) = tokio::sync::watch::channel(false);
    self.senders.lock().insert(id.to_string(), tx);
    rx
  }

  /// Cancela el request con el id dado. Devuelve true si existía.
  pub fn cancel(&self, id: &str) -> bool {
    if let Some(tx) = self.senders.lock().remove(id) {
      let _ = tx.send(true);
      true
    } else {
      false
    }
  }

  /// Limpia el request del registro al terminar normalmente.
  pub fn remove(&self, id: &str) {
    self.senders.lock().remove(id);
  }
}
