/**
 * useTerminalLocalListener.ts — hermano de useTerminalSshListener.ts para la
 * terminal local (PTY nativa, no SSH).
 *
 * Simplificado respecto al listener SSH: al no haber round-trip de red, no
 * hace falta la máquina de estados de nudge/timeout (6s/15s) — el spawn del
 * proceso local resuelve en milisegundos, así que `isLoading` solo cubre el
 * tiempo entre montar el panel y que `local_term_spawn` resuelva.
 *
 * Responsable de:
 * - Al montar: llamar `localTermSpawn(cols, rows)`, poblar `sessionMetadataRef`
 *   directamente desde la respuesta (host: "localhost", user del SO, port: 0)
 *   — sin round-trip extra tipo `ssh_session_info`.
 * - Suscribirse a `local_term_out_<paneId-sanitizado>` y escribir en el terminal.
 * - Reenviar `term.onData` a `localTermStdin`.
 * - Notificar tamaño inicial (`localTermResize`) y avisar que la UI está lista
 *   (`localTermUiReady`).
 * - Al desmontar: remover el listener y capturar/guardar la sesión (mismo
 *   pipeline de logs que SSH, vía `captureCurrentSession`).
 */
import { useEffect, useState, MutableRefObject, RefObject } from 'react';
import { Terminal } from 'xterm';
import { listen } from '@tauri-apps/api/event';
import { localTermSpawn, localTermStdin, localTermResize, localTermUiReady } from '../../../services/localTerminal.service';
import { canRefocusTerminal, ensureBlinkClasses, sanitizeSessionId } from './terminalDomUtils';
import { TerminalSessionMetadata } from './terminalTypes';

interface UseTerminalLocalListenerParams {
  paneId: string;
  containerRef: RefObject<HTMLDivElement | null>;
  termRef: MutableRefObject<Terminal | null>;
  hasFocusedOnceRef: MutableRefObject<boolean>;
  unlistenRef: MutableRefObject<(() => void) | null>;
  sessionMetadataRef: MutableRefObject<TerminalSessionMetadata | null>;
  captureCurrentSession: () => Promise<void>;
  captureSnapshot: () => void;
}

interface UseTerminalLocalListenerResult {
  isLoading: boolean;
  isFadingOut: boolean;
  waitingForPrompt: boolean;
  /** true si el proceso de la shell terminó (ej. el usuario escribió `exit`). */
  hasExited: boolean;
}

export function useTerminalLocalListener({
  paneId,
  containerRef,
  termRef,
  hasFocusedOnceRef,
  unlistenRef,
  sessionMetadataRef,
  captureCurrentSession,
  captureSnapshot,
}: UseTerminalLocalListenerParams): UseTerminalLocalListenerResult {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasExited, setHasExited] = useState<boolean>(false);

  useEffect(() => {
    const term = termRef.current;
    if (!term || !paneId) return;

    if (unlistenRef.current) { try { unlistenRef.current(); } catch {} unlistenRef.current = null; }

    const disposers: Array<{ dispose: () => void }> = [];
    let cancelled = false;
    let exitUnlisten: (() => void) | null = null;

    setIsLoading(true);
    setHasExited(false);

    const safe = sanitizeSessionId(paneId);

    (async () => {
      try {
        // Suscribirse ANTES de spawnear para no perder los primeros bytes
        // (el backend bufferiza hasta `local_term_ui_ready`, pero igual nos
        // adelantamos por si el spawn ya emitió algo antes de este await).
        const unOut = await listen<string>(`local_term_out_${safe}`, (event) => {
          if (event.payload) {
            const t = termRef.current;
            if (!t) return;
            t.write(event.payload, () => {
              setTimeout(() => captureSnapshot(), 150);
            });
            try { t.scrollToBottom(); } catch {}
            try { if (!hasFocusedOnceRef.current && canRefocusTerminal(containerRef)) { t.focus(); hasFocusedOnceRef.current = true; } } catch {}
            try { ensureBlinkClasses(containerRef); } catch {}
          }
        }).catch(() => null);

        if (cancelled) {
          if (unOut) unOut();
          return;
        }
        unlistenRef.current = unOut;

        const unExit = await listen(`local_term_exit_${safe}`, () => {
          setHasExited(true);
        }).catch(() => null);

        if (cancelled) {
          if (unExit) unExit();
          return;
        }
        exitUnlisten = unExit;

        const { user } = await localTermSpawn(paneId, term.cols, term.rows);
        if (cancelled) return;

        sessionMetadataRef.current = {
          sessionId: paneId,
          user,
          host: 'localhost',
          port: 0,
          startTime: new Date().toISOString(),
        };

        disposers.push(term.onData((data) => {
          localTermStdin(paneId, data).catch(() => {});
        }));

        await localTermResize(paneId, term.cols, term.rows).catch(() => {});
        await localTermUiReady(paneId).catch(() => {});
        try { if (canRefocusTerminal(containerRef)) { term.focus(); hasFocusedOnceRef.current = true; } } catch {}
        try { ensureBlinkClasses(containerRef); } catch {}
      } catch {
        try { term.writeln('\x1b[31mNo se pudo iniciar la terminal local.\x1b[0m'); } catch {}
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      disposers.forEach(d => d.dispose());
      if (unlistenRef.current) { try { unlistenRef.current(); } catch {} unlistenRef.current = null; }
      if (exitUnlisten) { try { exitUnlisten(); } catch {} }
      // Fire-and-forget, igual que en el listener SSH: solo captura el log.
      // Matar el proceso PTY es responsabilidad explícita del caller
      // (LocalTerminalGroup.closePane / useTabLifecycle), no de este cleanup
      // — mismo criterio que sshDisconnect, que tampoco se dispara desde
      // el cleanup de useTerminalSshListener.
      captureCurrentSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneId]);

  return { isLoading, isFadingOut: false, waitingForPrompt: false, hasExited };
}


