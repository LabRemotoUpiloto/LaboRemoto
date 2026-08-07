---
name: realtime-specialist
description: Specialist for REFACTOR #5 - Real-time Sync Contract
model: sonnet
effortLevel: high
---

# Real-time Specialist Agent

## Purpose
Implement REFACTOR #5: Implement real-time synchronization contract with message queues and acknowledgments.

## Responsibilities
1. Design `Message` enum for all backend → frontend events
2. Replace fire-and-forget Tauri events with mpsc channels
3. Implement acknowledgment protocol for critical messages
4. Implement backpressure (drop low-priority frames if queue > threshold)
5. Add message tracing for debugging
6. Update all event emitters (SSH, SFTP, AI, etc)

## Key Files to Modify/Create
- `backend/src/ipc/mod.rs` (CREATE NEW)
- `backend/src/ipc/message.rs` (CREATE NEW)
- `backend/src/ipc/channel.rs` (CREATE NEW)
- `backend/src/cmd/ssh/terminal.rs` (REFACTOR - use Message queue)
- `backend/src/cmd/sftp/transfers.rs` (REFACTOR - use Message queue)
- `backend/src/cmd/ai/*.rs` (REFACTOR - use Message queue)
- `frontend/src/services/*` (update listeners)

## Message Enum
```rust
// backend/src/ipc/message.rs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Message {
  TerminalOutput {
    session_id: String,
    data: String,
  },
  SftpProgress {
    session_id: String,
    bytes: u64,
    total: u64,
  },
  AuthStateChange {
    session_id: String,
    new_state: AuthState,
  },
  ErrorNotification {
    code: String,
    message: String,
    retryable: bool,
  },
  ChatOutput {
    session_id: String,
    text: String,
  },
}

pub struct MessageEnvelope {
  pub id: String,           // For tracing
  pub message: Message,
  pub priority: Priority,   // High/Normal/Low
  pub require_ack: bool,
}

pub enum Priority {
  High,    // Auth, errors
  Normal,  // Terminal output
  Low,     // Progress updates
}
```

## Channel Architecture
```
Backend Event Emitter
        ↓
  Message Queue (Bounded)
        ↓
  Tauri IPC Channel
        ↓
  Frontend Listener
        ↓
  Acknowledgment (if required)
        ↓
  Backend Message Handler
```

## Backpressure Logic
- Queue limit: 1000 messages
- If queue > 1000: drop Low priority messages
- If queue > 500: throttle Normal messages to 50ms batches
- If queue > 100: no throttling

## Success Criteria
- All events use Message enum
- No fire-and-forget; all critical messages require ACK
- Queue backpressure implemented and tested
- Message tracing in logs
- No events lost during high-speed streams
- Frontend receives all messages in order

## Testing
- Unit tests: Message serialization/deserialization
- Unit tests: Backpressure logic
- Integration test: 1000 messages/sec, verify none lost
- Integration test: cancel SFTP → cancel message delivered fast
- E2E test: high-speed terminal output + SFTP progress
- Stress test: 10 concurrent sessions with high throughput
