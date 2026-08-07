/**
 * useTerminalSshListener.ts — listener del stream SSH (`ssh_out_<id>`) + estado de carga.
 *
 * Responsable de:
 * - Al establecerse `sessionId`: consultar `ssh_session_info`, guardar la metadata
 *   inicial en `sessionMetadataRef` (consumida por useTerminalSessionCapture), y
 *   opcionalmente "typear" el comando ssh local equivalente en el buffer.
 * - Suscribirse al evento Tauri `ssh_out_<sessionId-sanitizado>` y escribir los datos
 *   recibidos en el terminal, además de reenviar la entrada del usuario (`term.onData`)
 *   al backend vía `ssh_stdin`.
 * - Manejar el overlay de carga (`isLoading` / `isFadingOut` / `waitingForPrompt`):
 *   detecta cuándo aparece contenido visible en el buffer para ocultar el overlay,
 *   envía un "nudge" (`\n`) si no hay respuesta tras 6s, y fuerza el cierre del
 *   overlay como salvaguarda a los 15s.
 * - Notificar el tamaño inicial (`ssh_resize`) y avisar que la UI está lista
 *   (`ssh_ui_ready`).
 * - Al desmontar / cambiar de sesión: limpiar timers, remover el listener SSH y
 *   disparar `captureCurrentSession` (guardado de la sesión que se está cerrando).
 *
 * Los refs (`termRef`, `unlistenRef`, `sessionMetadataRef`) y las funciones de
 * captura (`captureCurrentSession`, `captureSnapshot`) son propiedad de otros
 * sub-hooks (useTerminalLifecycle / useTerminalSessionCapture) y se reciben por
 * parámetro — ver useTerminal.ts para el orden de composición.
 */
import { useEffect, useState, MutableRefObject, RefObject } from 'react';
import { Terminal } from 'xterm';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { sshStdin, sshResize } from '../../../services/ssh.service';
import { canRefocusTerminal, ensureBlinkClasses, sanitizeSessionId } from './terminalDomUtils';
import { TerminalSessionMetadata } from './terminalTypes';

interface UseTerminalSshListenerParams {
  sessionId: string | null;
  localSshCommand?: string | null;
  containerRef: RefObject<HTMLDivElement | null>;
  termRef: MutableRefObject<Terminal | null>;
  hasFocusedOnceRef: MutableRefObject<boolean>;
  unlistenRef: MutableRefObject<(() => void) | null>;
  sessionMetadataRef: MutableRefObject<TerminalSessionMetadata | null>;
  onTerminalOutput?: (data: string) => void;
  onTerminalInput?: (data: string) => void;
  captureCurrentSession: () => Promise<void>;
  captureSnapshot: () => void;
}

interface UseTerminalSshListenerResult {
  isLoading: boolean;
  isFadingOut: boolean;
  waitingForPrompt: boolean;
}

export function useTerminalSshListener({
  sessionId,
  localSshCommand,
  containerRef,
  termRef,
  hasFocusedOnceRef,
  unlistenRef,
  sessionMetadataRef,
  onTerminalOutput,
  onTerminalInput,
  captureCurrentSession,
  captureSnapshot,
}: UseTerminalSshListenerParams): UseTerminalSshListenerResult {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);
  const [waitingForPrompt, setWaitingForPrompt] = useState<boolean>(false);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    // Salvaguarda: nos aseguramos de no dejar un listener SSH previo colgado
    // antes de suscribirnos al nuevo (el cleanup de este mismo efecto ya lo hace,
    // esto es redundante a propósito, igual que en el hook monolítico original).
    if (unlistenRef.current) { try { unlistenRef.current(); } catch {} unlistenRef.current = null; }

    const disposers: Array<{ dispose: () => void }> = [];

    if (sessionId) {
      const safe = sanitizeSessionId(sessionId);

      (async () => {
        try {
          const info = await invoke<{ host: string; port: number; user: string }>('ssh_session_info', { id: sessionId });
          sessionMetadataRef.current = {
            sessionId,
            user: info.user || 'unknown',
            host: info.host || 'unknown',
            port: info.port || 22,
            startTime: new Date().toISOString()
          };
        } catch (error) {
          sessionMetadataRef.current = {
            sessionId,
            user: 'student',
            host: sessionId.split('@')[1]?.split(':')[0] || 'server',
            port: 22,
            startTime: new Date().toISOString()
          };
        }
      })();

      setIsLoading(true);
      setWaitingForPrompt(false);

      if (localSshCommand?.trim()) {
        const cmd = localSshCommand.trim();
        try {
          term.writeln('');
          term.write('\x1b[90m# Conexión equivalente en tu máquina:\x1b[0m\r\n');
          term.write(`\x1b[32m$\x1b[0m \x1b[1;36m${cmd}\x1b[0m`);
          term.write('\x1b[90m  \x1b[0m');
          term.write('\r\n\x1b[90m# ↓ sesión interactiva (LaboRemoto)\x1b[0m\r\n\r\n');
        } catch {
          /* xterm no listo */
        }
      }

      let bytesReceived = 0;
      let contentCheckInterval: number | null = null;
      let contentCheckTimeout: number | null = null;
      let nudgeTimeout: number | null = null;
      let hasHiddenLoading = false;
      let nudgeSent = false;

      const fadeOutAndHide = () => {
        if (hasHiddenLoading) return;
        hasHiddenLoading = true;
        setIsFadingOut(true);
        setTimeout(() => {
          setIsLoading(false);
          setWaitingForPrompt(false);
          setIsFadingOut(false);
        }, 400);
        if (contentCheckInterval) {
          window.clearInterval(contentCheckInterval);
          contentCheckInterval = null;
        }
        if (contentCheckTimeout) {
          window.clearTimeout(contentCheckTimeout);
          contentCheckTimeout = null;
        }
        if (nudgeTimeout) {
          window.clearTimeout(nudgeTimeout);
          nudgeTimeout = null;
        }
      };

      const checkAndHideLoading = () => {
        if (hasHiddenLoading) return;
        try {
          const buffer = term.buffer.active;
          let hasVisibleText = false;
          const linesToCheck = Math.min(buffer.length, 30);
          for (let i = 0; i < linesToCheck; i++) {
            const line = buffer.getLine(i);
            if (line) {
              const text = line.translateToString(true).trim();
              if (text.length > 0) {
                hasVisibleText = true;
                break;
              }
            }
          }
          if (hasVisibleText) {
            fadeOutAndHide();
          }
        } catch {
        }
      };

      contentCheckInterval = window.setInterval(checkAndHideLoading, 150);

      // Después de 6 segundos sin prompt, enviar un \n como "nudge" para forzar al shell
      nudgeTimeout = window.setTimeout(() => {
        if (!hasHiddenLoading && !nudgeSent) {
          nudgeSent = true;
          setWaitingForPrompt(true);
          sshStdin(sessionId, '\n').catch(() => {});
        }
      }, 6000);

      // Safety timeout: después de 15 segundos, forzar ocultar el loading
      contentCheckTimeout = window.setTimeout(() => {
        if (!hasHiddenLoading) {
          fadeOutAndHide();
        }
      }, 15000);

      disposers.push(term.onData((data) => {
        try { onTerminalInput?.(data); } catch {}
        sshStdin(sessionId, data).catch(() => {});
      }));

      listen<string>(`ssh_out_${safe}`, (event) => {
        if (event.payload) {
          try { onTerminalOutput?.(event.payload); } catch {}
          bytesReceived += event.payload.length;
          term.write(event.payload, () => {
            setTimeout(checkAndHideLoading, 100);
            setTimeout(() => captureSnapshot(), 150);
          });
          try { term.scrollToBottom(); } catch {}
          setTimeout(checkAndHideLoading, 200);
          try { if (!hasFocusedOnceRef.current && canRefocusTerminal(containerRef)) { term.focus(); hasFocusedOnceRef.current = true; } } catch {}
          try { ensureBlinkClasses(containerRef); } catch {}
        }
      }).then(un => { unlistenRef.current = un }).catch(() => {});

      sshResize(sessionId, term.cols, term.rows).catch(() => {});
      invoke('ssh_ui_ready', { id: sessionId }).catch(() => {});
      try { if (canRefocusTerminal(containerRef)) { term.focus(); hasFocusedOnceRef.current = true; } } catch {}
      try { ensureBlinkClasses(containerRef); } catch {}

      return () => {
        disposers.forEach(d => d.dispose());
        if (unlistenRef.current) { try { unlistenRef.current(); } catch {} unlistenRef.current = null; }
        if (contentCheckInterval) {
          window.clearInterval(contentCheckInterval);
        }
        if (contentCheckTimeout) {
          window.clearTimeout(contentCheckTimeout);
        }
        if (nudgeTimeout) {
          window.clearTimeout(nudgeTimeout);
        }
        captureCurrentSession();
      };
    } else {
      setIsLoading(false);
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, localSshCommand]);

  return { isLoading, isFadingOut, waitingForPrompt };
}
