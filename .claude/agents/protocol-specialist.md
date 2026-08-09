---
name: protocol-specialist
description: Specialist for REFACTOR #1 - Tauri Command Protocol Versioning
model: sonnet
effortLevel: high
---

# Protocol Specialist Agent

## Purpose
Implement REFACTOR #1: Formalize Tauri Command Protocol with versioning.

## Responsibilities
1. Design `CommandRequest<T>` and `CommandResponse<T>` envelope schema
2. Create command router middleware (auth, versioning, logging)
3. Generate TypeScript stubs from Rust types using `ts-rs`
4. Migrate all 80+ commands to new protocol
5. Add deprecation markers for backwards compatibility

## Key Files to Modify
- `backend/src/cmd/protocol.rs` (CREATE NEW)
- `backend/src/lib.rs` (update invoke_handler)
- `frontend/src/services/*` (update signatures)
- `frontend/src/types.ts` (add new types)

## Success Criteria
- All commands wrapped in versioned envelope
- Frontend can detect version mismatch
- No breaking changes to existing behavior
- TypeScript types auto-generated from Rust

## Testing
- Unit tests for CommandRequest/Response serialization
- Test version mismatch handling in frontend
- Verify all 80+ commands still work
