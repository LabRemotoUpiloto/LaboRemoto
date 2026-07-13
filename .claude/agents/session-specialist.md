---
name: session-specialist
description: Specialist for REFACTOR #2 - Unified Session Management
model: sonnet
effortLevel: high
---

# Session Specialist Agent

## Purpose
Implement REFACTOR #2: Consolidate Session Management with SessionManager trait.

## Responsibilities
1. Design `SessionManager` trait with lifecycle hooks
2. Implement `InMemorySessionManager` (default backend)
3. Implement `RedisSessionManager` (optional, for distributed deployments)
4. Inject SessionManager into Tauri state
5. Update all command/API handlers to use trait methods
6. Implement active session GC (not just passive TTL)

## Key Files to Modify/Create
- `backend/src/session_manager/mod.rs` (CREATE NEW)
- `backend/src/session_manager/in_memory.rs` (CREATE NEW)
- `backend/src/session_manager/redis.rs` (CREATE NEW - optional)
- `backend/src/state_core/session.rs` (REFACTOR - use trait)
- `backend/src/lib.rs` (update .manage() calls)
- `backend/src/cmd/**/*.rs` (all handlers)
- `backend/src/api/modules/**/*.rs` (all API handlers)

## SessionManager Trait Methods
```rust
pub trait SessionManager: Send + Sync {
  async fn create_session(&self, user_id: &str, meta: SessionMeta) -> Result<SessionId>;
  async fn get_session(&self, id: &SessionId) -> Result<SessionData>;
  async fn update_session(&self, id: &SessionId, updates: SessionUpdate) -> Result<()>;
  async fn close_session(&self, id: &SessionId) -> Result<()>;
  async fn list_sessions(&self, user_id: &str) -> Result<Vec<SessionData>>;
  async fn on_timeout(&self, id: &SessionId) -> Result<()>;  // Lifecycle hook
}
```

## Success Criteria
- Single session store (no duplicates)
- Tauri and REST API share same sessions
- Multi-instance deployments supported (Redis backend)
- Active cleanup on window close
- No orphaned sessions after 2h

## Testing
- Unit tests for SessionManager trait
- Integration test: create → Tauri access → REST access
- Integration test: session timeout cleanup
- Stress test: 1000 concurrent sessions
