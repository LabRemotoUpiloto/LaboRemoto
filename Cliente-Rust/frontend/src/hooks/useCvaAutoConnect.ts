import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { type UnlistenFn } from '@tauri-apps/api/event';
import { sshConnect, waitForConnection } from '../services/ssh.service';

export interface CvaConnectionConfig {
    host: string;
    port: number;
    user: string;
    password: string;
}

export interface UseCvaAutoConnectResult {
    sessionId: string | undefined;
    loading: boolean;
    error: string | null;
    connect: () => Promise<string | undefined>;
}

export function useCvaAutoConnect(enabled: boolean = true): UseCvaAutoConnectResult {
    const [sessionId, setSessionId] = useState<string | undefined>(undefined);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const connectingRef = useRef<boolean>(false);

    const connect = useCallback(async (): Promise<string | undefined> => {
        if (connectingRef.current) return undefined;
        connectingRef.current = true;
        setLoading(true);
        setError(null);

        const abortController = new AbortController();
        let unlistenSuccess: UnlistenFn | null = null;
        let unlistenError: UnlistenFn | null = null;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        try {
            // 1. Obtener la configuración de conexión CVA desde .env.practicas vía backend Rust
            const config = await invoke<CvaConnectionConfig>('cva_gestures_get_connection_config');

            // 2. Iniciar conexión SSH en background (devuelve UUID de sesión de inmediato)
            const newSessionId = await sshConnect({
                host: config.host,
                port: config.port,
                user: config.user,
                password: config.password,
                cols: 120,
                rows: 40,
            });

            // 3. Esperar la conexión SSH real (evento ssh_connected emitido por el handshake en background)
            // antes de entregar el sessionId al resto de la aplicación
            await new Promise<void>((resolve, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error('Tiempo de espera agotado (20s) esperando conexión SSH'));
                }, 20000);

                waitForConnection(
                    newSessionId,
                    abortController.signal,
                    () => resolve(),
                    (err) => reject(err),
                ).then(([uSuccess, uError]) => {
                    unlistenSuccess = uSuccess;
                    unlistenError = uError;
                }).catch(reject);
            });

            if (timeoutId) clearTimeout(timeoutId);
            unlistenSuccess?.();
            unlistenError?.();

            // Conexión SSH confirmada en SESSIONS del backend: ahora sí podemos asignar sessionId
            setSessionId(newSessionId);
            setLoading(false);
            connectingRef.current = false;
            return newSessionId;
        } catch (err: any) {
            if (timeoutId) clearTimeout(timeoutId);
            unlistenSuccess?.();
            unlistenError?.();

            const errMsg = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
            setError(`Error en auto-conexión CVA: ${errMsg}`);
            setLoading(false);
            connectingRef.current = false;
            return undefined;
        }
    }, []);

    useEffect(() => {
        if (enabled && !sessionId && !error && !connectingRef.current) {
            connect();
        }
    }, [enabled, sessionId, error, connect]);

    return { sessionId, loading, error, connect };
}
