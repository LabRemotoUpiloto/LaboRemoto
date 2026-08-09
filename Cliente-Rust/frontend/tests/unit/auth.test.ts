import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

// Capturamos los handlers registrados vía `listen` para poder dispararlos
// manualmente desde los tests (simulando un evento emitido por el backend
// de Tauri), en vez de depender del runtime real.
type ListenHandler = (event: { payload: unknown }) => void;
const listenHandlers = new Map<string, ListenHandler>();
const listenMock = vi.fn((eventName: string, handler: ListenHandler) => {
  listenHandlers.set(eventName, handler);
  return Promise.resolve(vi.fn());
});

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: [string, ListenHandler]) => listenMock(...args),
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

// Import after mocking so the store picks up the mocked `invoke`/`listen`.
import { useAppStore } from '../../src/store/app';

/** Dispara el handler capturado para `eventName` como si el backend lo hubiese emitido. */
function emit(eventName: string, payload: unknown = undefined) {
  const handler = listenHandlers.get(eventName);
  if (!handler) throw new Error(`No handler registered for event "${eventName}"`);
  handler({ payload });
}

describe('auth slice — logout invalidates the query cache (REFACTOR #4 closing fix)', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    listenMock.mockClear();
    listenHandlers.clear();
    useAppStore.setState({ user: null, isAuthenticated: false, isLoading: false, queryCache: {} });
  });

  it('logout() clears the queryCache after a successful backend logout', async () => {
    invokeMock.mockResolvedValueOnce(undefined); // auth_logout

    useAppStore.getState().setQueryData('ssh:session-info:abc', { some: 'data' });
    expect(useAppStore.getState().queryCache['ssh:session-info:abc']).toBeDefined();

    await useAppStore.getState().logout();

    expect(useAppStore.getState().queryCache).toEqual({});
  });

  it('logout() clears the queryCache even if the backend call fails', async () => {
    invokeMock.mockRejectedValueOnce(new Error('network error'));

    useAppStore.getState().setQueryData('ssh:session-info:abc', { some: 'data' });

    await useAppStore.getState().logout();

    expect(useAppStore.getState().queryCache).toEqual({});
  });

  it('the auth://logged-out event handler (registered by initAuth) also clears the queryCache', async () => {
    invokeMock.mockResolvedValueOnce(null); // auth_status, llamado por checkStatus() dentro de initAuth()

    const cleanup = useAppStore.getState().initAuth();
    // `checkStatus()` dispara un invoke async; lo esperamos a resolver antes de continuar.
    await Promise.resolve();
    await Promise.resolve();

    useAppStore.getState().setQueryData('ssh:session-info:abc', { some: 'data' });
    expect(useAppStore.getState().queryCache['ssh:session-info:abc']).toBeDefined();

    emit('auth://logged-out');

    expect(useAppStore.getState().queryCache).toEqual({});
    expect(useAppStore.getState().isAuthenticated).toBe(false);
    expect(useAppStore.getState().user).toBeNull();

    cleanup();
  });
});
