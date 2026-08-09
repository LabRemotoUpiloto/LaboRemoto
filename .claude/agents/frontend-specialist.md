---
name: frontend-specialist
description: Specialist for REFACTOR #4 - Frontend State Management
model: sonnet
effortLevel: medium
---

# Frontend Specialist Agent

## Purpose
Implement REFACTOR #4: Refactor frontend state management (Zustand + extract terminal lifecycle).

## Responsibilities
1. Migrate from React Context to Zustand for server state
2. Extract terminal lifecycle into `useTerminalSession` hook
3. Create data-fetching hooks with caching
4. Audit and fix listener cleanup (prevent memory leaks)
5. Extract camera/desktop/VNC lifecycle into reusable hooks
6. Update TypeScript types from Rust backend

## Key Files to Modify/Create
- `frontend/src/store/app.ts` (CREATE NEW - Zustand)
- `frontend/src/store/terminal.ts` (CREATE NEW - terminal state)
- `frontend/src/hooks/useTerminalSession.ts` (CREATE NEW)
- `frontend/src/hooks/useSftpSession.ts` (CREATE NEW)
- `frontend/src/hooks/useQueryData.ts` (CREATE NEW - data fetching)
- `frontend/src/components/terminal/Terminal.tsx` (REFACTOR - use hook)
- `frontend/src/contexts/*` (DEPRECATE - migrate to Zustand)

## Zustand Store Structure
```typescript
// frontend/src/store/app.ts
export const useAppStore = create<AppState>((set) => ({
  sessions: {},
  user: null,
  addSession: (id, meta) => set(state => ({
    sessions: { ...state.sessions, [id]: meta }
  })),
  closeSession: (id) => set(state => ({
    sessions: { ...Object.entries(state.sessions)
      .filter(([k]) => k !== id).reduce((acc, [k, v]) => ({...acc, [k]: v}), {}) }
  })),
  updateSession: (id, updates) => set(state => ({
    sessions: { ...state.sessions, [id]: {...state.sessions[id], ...updates} }
  }))
}));
```

## Terminal Lifecycle Hook
```typescript
// frontend/src/hooks/useTerminalSession.ts
export function useTerminalSession(sessionId: string) {
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  // ... other refs centralized here
  
  useEffect(() => {
    // Init terminal
    // Setup listeners
    return () => {
      // Cleanup listeners (critical!)
      // Dispose terminal
      // Cancel pending operations
    };
  }, [sessionId]);
  
  return {
    containerRef,
    terminal: termRef.current,
    write: (text) => termRef.current?.write(text),
    // ... public methods
  };
}
```

## Success Criteria
- No React Context used for server state (only Zustand)
- Terminal hook 50 lines max (vs 200+ currently)
- All listeners properly cleaned up
- No memory leaks (verify with DevTools)
- TypeScript types 100% type-safe

## Testing
- Unit tests: Zustand store mutations
- Unit tests: useTerminalSession cleanup
- E2E test: open → write → close terminal
- Memory leak test: open/close 10 times, verify no leaks
