import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

// `initAuth` (no ejercitado en estos tests) registra listeners vía `listen`;
// lo mockeamos igual para evitar tocar el runtime real de Tauri si algo lo importa.
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

// Import after mocking so the store picks up the mocked `invoke`/`listen`.
import { useAppStore } from '../../src/store/app';

describe('auth slice — logout invalidates the query cache (REFACTOR #4 closing fix)', () => {
  beforeEach(() => {
    invokeMock.mockReset();
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
});
