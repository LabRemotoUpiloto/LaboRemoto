// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useCvaAutoConnect } from '../../src/hooks/useCvaAutoConnect';
import * as sshService from '../../src/services/ssh.service';

vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn().mockImplementation((cmd: string) => {
        if (cmd === 'cva_gestures_get_connection_config') {
            return Promise.resolve({
                host: '127.0.0.1',
                port: 22,
                user: 'labo',
                password: 'labo_password',
            });
        }
        return Promise.reject(new Error(`Command ${cmd} not mocked`));
    }),
}));

vi.mock('../../src/services/ssh.service', () => ({
    sshConnect: vi.fn().mockResolvedValue('auto-cva-session-999'),
    waitForConnection: vi.fn(),
}));

describe('useCvaAutoConnect', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(sshService.sshConnect).mockResolvedValue('auto-cva-session-999');
    });

    it('mantiene sessionId undefined y loading true mientras no ha llegado ssh_connected, y actualiza sessionId solo después del evento', async () => {
        let triggerSuccess: ((res: any) => void) | null = null;
        vi.mocked(sshService.waitForConnection).mockImplementation(
            (_sessionId, _abortSignal, onSuccess, _onError) => {
                triggerSuccess = onSuccess;
                return Promise.resolve([vi.fn(), vi.fn()]);
            }
        );

        const { result } = renderHook(() => useCvaAutoConnect(true));

        // 1. Inmediatamente tras render, sshConnect fue llamado pero waitForConnection aún no emite éxito
        await waitFor(() => {
            expect(sshService.sshConnect).toHaveBeenCalledWith({
                host: '127.0.0.1',
                port: 22,
                user: 'labo',
                password: 'labo_password',
                cols: 120,
                rows: 40,
            });
        });

        // 2. Comprobar que sessionId PERMANECE undefined mientras el handshake SSH no termina
        expect(result.current.sessionId).toBeUndefined();
        expect(result.current.loading).toBe(true);
        expect(result.current.error).toBeNull();
        expect(triggerSuccess).not.toBeNull();

        // 3. Simular que el handshake SSH en background finaliza con éxito y emite ssh_connected
        act(() => {
            triggerSuccess!({ id: 'auto-cva-session-999', label: 'auto-cva-session-999' });
        });

        // 4. Ahora sí, el hook debe publicar el sessionId al resto de la aplicación
        await waitFor(() => {
            expect(result.current.sessionId).toBe('auto-cva-session-999');
        });
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it('no intenta conectar si enabled es false', async () => {
        const { result } = renderHook(() => useCvaAutoConnect(false));

        expect(result.current.sessionId).toBeUndefined();
        expect(sshService.sshConnect).not.toHaveBeenCalled();
        expect(sshService.waitForConnection).not.toHaveBeenCalled();
    });

    it('maneja el error si llega ssh_connect_error y nunca setea sessionId', async () => {
        let triggerError: ((err: Error) => void) | null = null;
        vi.mocked(sshService.waitForConnection).mockImplementation(
            (_sessionId, _abortSignal, _onSuccess, onError) => {
                triggerError = onError;
                return Promise.resolve([vi.fn(), vi.fn()]);
            }
        );

        const { result } = renderHook(() => useCvaAutoConnect(true));

        await waitFor(() => {
            expect(sshService.sshConnect).toHaveBeenCalled();
            expect(triggerError).not.toBeNull();
        });

        // Simular que el handshake falla con ssh_connect_error
        act(() => {
            triggerError!(new Error('Credenciales inválidas en Pi4'));
        });

        await waitFor(() => {
            expect(result.current.error).toBeTruthy();
            expect(result.current.error).toContain('Credenciales inválidas en Pi4');
        });

        expect(result.current.sessionId).toBeUndefined();
        expect(result.current.loading).toBe(false);
    });

    it('maneja el error si sshConnect rechaza directamente', async () => {
        vi.mocked(sshService.sshConnect).mockRejectedValueOnce(new Error('SSH Host unreachable'));

        const { result } = renderHook(() => useCvaAutoConnect(true));

        await waitFor(() => {
            expect(result.current.error).toBeTruthy();
            expect(result.current.error).toContain('SSH Host unreachable');
        });

        expect(result.current.sessionId).toBeUndefined();
        expect(result.current.loading).toBe(false);
    });
});
