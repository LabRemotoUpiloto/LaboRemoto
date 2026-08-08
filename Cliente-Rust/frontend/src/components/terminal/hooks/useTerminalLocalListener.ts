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
 *   El handler de salida es hot path: solo `term.write()` + snapshot con
 *   debounce trailing — el autoscroll ya lo hace `onWriteParsed` (lifecycle)
 *   y el focus se maneja una sola vez al montar/ui-ready.
 * - Reenviar `term.onData` a `localTermStdin`.
 * - Acciones del menú contextual vía CustomEvents `local-term:{copy,paste,clear}`
 *   (despachados por LocalTerminalGroup) + pegado de imágenes con Ctrl+V:
 *   la imagen del portapapeles se guarda a un archivo temporal en el backend
 *   y se inserta la ruta en la terminal (estilo Warp).
 * - Notificar tamaño inicial (`localTermResize`) y avisar que la UI está lista
 *   (`localTermUiReady`).
 * - Al desmontar: remover listeners y capturar/guardar la sesión (mismo
 *   pipeline de logs que SSH, vía `captureCurrentSession`).
 */
import { useEffect, useState, MutableRefObject, RefObject } from 'react';
import { Terminal } from 'xterm';
import { listen } from '@tauri-apps/api/event';
import {
  localTermSpawn,
  localTermStdin,
  localTermResize,
  localTermUiReady,
  localTermSavePasteImage,
  localTermReadClipboard,
  localTermWriteClipboard,
} from '../../../services/localTerminal.service';
import { canRefocusTerminal, sanitizeSessionId } from './terminalDomUtils';
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

/** Convierte un Blob de imagen a base64 (sin el prefijo data-URL). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const idx = dataUrl.indexOf(',');
      resolve(idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
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
    let snapshotTimer: number | null = null;

    setIsLoading(true);
    setHasExited(false);

    const safe = sanitizeSessionId(paneId);

    // Snapshot con debounce trailing: un solo timer, se reprograma con cada
    // chunk — serializar todo el buffer por chunk era O(buffer) repetido.
    const scheduleSnapshot = () => {
      if (snapshotTimer !== null) window.clearTimeout(snapshotTimer);
      snapshotTimer = window.setTimeout(() => {
        snapshotTimer = null;
        captureSnapshot();
      }, 300);
    };

    // ── Pegado (texto e imagen) ──────────────────────────────────────────────
    const pasteImageBlob = async (blob: Blob) => {
      try {
        const b64 = await blobToBase64(blob);
        const path = await localTermSavePasteImage(b64);
        // Ruta entre comillas + espacio: lista para usarse como argumento.
        await localTermStdin(paneId, `"${path}" `);
      } catch {
        try { termRef.current?.write('\x07'); } catch {} // bell: no se pudo pegar
      }
    };

    // El portapapeles se lee SIEMPRE vía backend (arboard): en Windows el
    // webview corre en http://tauri.localhost (contexto no seguro) y ahí
    // navigator.clipboard directamente no existe.
    const pasteFromClipboard = async () => {
      try {
        const content = await localTermReadClipboard();
        if (content.kind === 'image') {
          // Ruta entre comillas + espacio: lista como argumento de comando.
          await localTermStdin(paneId, `"${content.path}" `);
        } else if (content.kind === 'text') {
          // term.paste respeta el bracketed paste mode que la shell haya
          // activado (PSReadLine/bash lo usan para no auto-ejecutar líneas).
          termRef.current?.paste(content.text);
        }
      } catch {
        try { termRef.current?.write('\x07'); } catch {}
      }
    };

    // Ctrl+V dentro del terminal: si hay imagen en el portapapeles la
    // interceptamos (guardar archivo + insertar ruta); el texto sigue el
    // pipeline nativo de xterm sin tocarse.
    const container = containerRef.current;
    const onNativePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.type.startsWith('image/')) {
          const file = it.getAsFile();
          if (file) {
            e.preventDefault();
            e.stopPropagation();
            void pasteImageBlob(file);
            return;
          }
        }
      }
    };
    container?.addEventListener('paste', onNativePaste, true);

    // ── Acciones del menú contextual (despachadas por LocalTerminalGroup) ───
    const onMenuCopy = (ev: Event) => {
      if ((ev as CustomEvent).detail?.paneId !== paneId) return;
      const t = termRef.current;
      if (!t) return;
      const sel = t.getSelection();
      if (sel) localTermWriteClipboard(sel).catch(() => {});
    };
    const onMenuPaste = (ev: Event) => {
      if ((ev as CustomEvent).detail?.paneId !== paneId) return;
      void pasteFromClipboard();
    };
    const onMenuClear = (ev: Event) => {
      if ((ev as CustomEvent).detail?.paneId !== paneId) return;
      try { termRef.current?.clear(); } catch {}
    };
    window.addEventListener('local-term:copy', onMenuCopy as EventListener);
    window.addEventListener('local-term:paste', onMenuPaste as EventListener);
    window.addEventListener('local-term:clear', onMenuClear as EventListener);

    (async () => {
      try {
        // Suscribirse ANTES de spawnear para no perder los primeros bytes
        // (el backend bufferiza hasta `local_term_ui_ready`, pero igual nos
        // adelantamos por si el spawn ya emitió algo antes de este await).
        const unOut = await listen<string>(`local_term_out_${safe}`, (event) => {
          if (event.payload) {
            const t = termRef.current;
            if (!t) return;
            t.write(event.payload);
            scheduleSnapshot();
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

        // Ctrl+V plano: interceptado ANTES de que el browser genere el evento
        // paste — así el pegado (texto e imagen) siempre pasa por el backend,
        // que es la única vía confiable al portapapeles en este webview.
        term.attachCustomKeyEventHandler((ev) => {
          if (ev.type === 'keydown' && ev.ctrlKey && !ev.shiftKey && !ev.altKey && ev.key.toLowerCase() === 'v') {
            ev.preventDefault();
            void pasteFromClipboard();
            return false;
          }
          return true;
        });

        await localTermResize(paneId, term.cols, term.rows).catch(() => {});
        await localTermUiReady(paneId).catch(() => {});
        try { if (canRefocusTerminal(containerRef)) { term.focus(); hasFocusedOnceRef.current = true; } } catch {}
      } catch {
        try { term.writeln('\x1b[31mNo se pudo iniciar la terminal local.\x1b[0m'); } catch {}
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (snapshotTimer !== null) { try { window.clearTimeout(snapshotTimer); } catch {} }
      container?.removeEventListener('paste', onNativePaste, true);
      window.removeEventListener('local-term:copy', onMenuCopy as EventListener);
      window.removeEventListener('local-term:paste', onMenuPaste as EventListener);
      window.removeEventListener('local-term:clear', onMenuClear as EventListener);
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
