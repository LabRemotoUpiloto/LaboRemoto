import { useCallback, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { pi4SshConnect, sshDisconnect } from '../../../services/ssh.service';
import { KNOWN_DEVICES } from '../../../constants/devices';

const EMBEDDED_COLS = 100;
const EMBEDDED_ROWS = 14;

/** Sesión SSH compartida para terminal y cámaras embebidas en el chat. */
export function usePi4ChatSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sshCommandLine, setSshCommandLine] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openingRef = useRef(false);

  const ensurePi4Session = useCallback(async (): Promise<string | null> => {
    if (sessionId) return sessionId;
    if (openingRef.current) return null;
    openingRef.current = true;
    setConnecting(true);
    setError(null);

    let unlistenOk: (() => void) | null = null;
    let unlistenErr: (() => void) | null = null;
    let pendingId: string | null = null;

    try {
      const connected = new Promise<string>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          reject(new Error('Tiempo de espera al conectar con la Raspberry (30s)'));
        }, 30_000);

        const finish = (fn: () => void) => {
          window.clearTimeout(timeout);
          fn();
        };

        listen<{ id: string; embedded_in_chat?: boolean; ssh_command?: string }>('ssh_connected', ev => {
          if (ev.payload?.embedded_in_chat !== true) return;
          const id = ev.payload?.id;
          if (!id || (pendingId && id !== pendingId)) return;
          if (ev.payload.ssh_command) setSshCommandLine(ev.payload.ssh_command);
          finish(() => resolve(id));
        }).then(fn => { unlistenOk = fn; });

        listen<{ id: string; error: string; embedded_in_chat?: boolean }>('ssh_connect_error', ev => {
          if (ev.payload?.embedded_in_chat === true) {
            const id = ev.payload?.id;
            if (!id || (pendingId && id !== pendingId)) return;
            finish(() => reject(new Error(ev.payload.error || 'Error de conexión SSH')));
          }
        }).then(fn => { unlistenErr = fn; });
      });

      await new Promise(r => setTimeout(r, 100));
      pendingId = await pi4SshConnect(EMBEDDED_COLS, EMBEDDED_ROWS);
      const id = await connected;
      setSessionId(id);
      return id;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      return null;
    } finally {
      unlistenOk?.();
      unlistenErr?.();
      openingRef.current = false;
      setConnecting(false);
    }
  }, [sessionId]);

  const disconnectPi4Session = useCallback(async () => {
    if (!sessionId) return;
    const id = sessionId;
    setSessionId(null);
    setSshCommandLine(null);
    setError(null);
    try {
      await sshDisconnect(id);
    } catch {
      /* sesión ya cerrada */
    }
  }, [sessionId]);

  const label = `${KNOWN_DEVICES.RASPBERRY_PI_4.label} · ${KNOWN_DEVICES.RASPBERRY_PI_4.host}`;

  return {
    pi4ChatSessionId: sessionId,
    pi4SshCommandLine: sshCommandLine,
    pi4ChatConnecting: connecting,
    pi4ChatError: error,
    pi4ChatLabel: label,
    ensurePi4Session,
    disconnectPi4Session,
  };
}
