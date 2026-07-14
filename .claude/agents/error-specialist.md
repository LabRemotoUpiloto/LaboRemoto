---
name: error-specialist
description: Specialist for REFACTOR #3 - Unified Error Handling
model: sonnet
effortLevel: medium
---

# Error Specialist Agent

## Purpose
Implement REFACTOR #3: Build unified error handling with CommandError enum.

## Responsibilities
1. Design `CommandError` enum with categorization (transient, permanent, etc)
2. Implement `From` conversions for library errors (ssh2, reqwest, serde_json)
3. Update all `#[tauri::command]` signatures from `Result<T, String>` to `Result<T, CommandError>`
4. Add structured logging with context (tracing crate)
5. Implement frontend retry logic with exponential backoff
6. Document error codes and meanings

## Key Files to Modify/Create
- `backend/src/cmd/error.rs` (CREATE NEW)
- `backend/src/error.rs` (REFACTOR - include CommandError)
- `backend/src/lib.rs` (update all commands)
- All command handlers: `backend/src/cmd/**/*.rs`
- `frontend/src/services/*` (add retry logic)

## CommandError Enum
```rust
#[derive(Debug, Serialize)]
pub enum CommandError {
  Auth { code: String, reason: String },
  NotFound { resource: String },
  Transient { code: String, retry_after_ms: Option<u32> },
  Validation { field: String, reason: String },
  Resource { code: String, limit: String },
  Internal { code: String, message: String },
}

#[derive(Debug, Serialize)]
pub struct ErrorDetail {
  pub error: CommandError,
  pub request_id: String,
  pub latency_ms: u32,
}
```

## Success Criteria
- All commands return `Result<T, CommandError>` (not String)
- Frontend can detect retryable errors
- Automatic retry with exponential backoff (1s, 2s, 4s, 8s)
- Structured logging in backend
- No exposed stack traces to frontend

## Testing
- Unit tests: error serialization/deserialization
- Unit tests: From conversions (ssh2, reqwest, etc)
- Integration test: auth failure → CommandError::Auth
- Integration test: timeout → CommandError::Transient (retryable=true)
- E2E test: frontend retry logic
