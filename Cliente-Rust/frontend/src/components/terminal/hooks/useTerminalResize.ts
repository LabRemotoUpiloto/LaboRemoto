/**
 * useTerminalResize.ts — ÚNICA lógica de resize del terminal (SSH y local).
 *
 * Un solo mecanismo: `ResizeObserver` sobre el contenedor del terminal.
 * Cualquier causa de cambio de tamaño (drag de separadores de
 * react-resizable-panels, resize de la ventana, toggle del sidebar/bottom-bar,
 * transiciones CSS del layout) termina cambiando el tamaño del contenedor, y
 * el observer lo reporta — no hacen falta listeners manuales por cada causa
 * (window resize, eventos `app:*`, transitionend), que era la lógica legacy
 * duplicada que convivía con el observer.
 *
 * Dos velocidades deliberadas:
 * - El resize VISUAL (`term.resize` vía fit) es inmediato + un pase trailing
 *   de 100ms para asentar el valor final tras ráfagas del observer.
 * - El aviso al backend (SIGWINCH a la PTY) va con trailing debounce de
 *   150ms: durante un drag continuo sería una tormenta de reflows para
 *   apps TUI (vim/htop) — tmux/Herdr también re-dibujan una sola vez al
 *   estabilizarse. Al desmontar se hace flush del tamaño pendiente.
 *
 * Nota de orden: este hook se monta ANTES que useTerminalLifecycle en el hook
 * orquestador para que, en cleanup, su observer se desconecte ANTES de que el
 * terminal se destruya (`term.dispose()`).
 */
import { useEffect, MutableRefObject, RefObject } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { isPaneVisible } from './terminalDomUtils';

interface UseTerminalResizeParams {
  containerRef: RefObject<HTMLDivElement | null>;
  sessionId: string | null;
  termRef: MutableRefObject<Terminal | null>;
  fitRef: MutableRefObject<FitAddon | null>;
  /** Notifica el nuevo tamaño (cols/rows) al backend correspondiente (SSH o terminal local). */
  notifyResize: (cols: number, rows: number) => Promise<void>;
}

export function useTerminalResize({
  containerRef,
  sessionId,
  termRef,
  fitRef,
  notifyResize,
}: UseTerminalResizeParams): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !window.ResizeObserver) return;

    let fitThrottle: number | null = null;
    let notifyTimer: number | null = null;
    let pendingNotify: { cols: number; rows: number } | null = null;

    const isTermReady = () => {
      const term = termRef.current;
      const fit = fitRef.current;
      const cont = containerRef.current;
      if (!term || !fit || !cont) return false;
      if (!term.element || !cont.contains(term.element)) return false;
      const renderService = (term as any)._core?._renderService;
      if (!renderService || !renderService.dimensions) return false;
      return isPaneVisible(containerRef);
    };

    const scheduleNotify = (cols: number, rows: number) => {
      pendingNotify = { cols, rows };
      if (notifyTimer) window.clearTimeout(notifyTimer);
      notifyTimer = window.setTimeout(() => {
        notifyTimer = null;
        const p = pendingNotify;
        pendingNotify = null;
        if (p) notifyResize(p.cols, p.rows).catch(() => {});
      }, 150);
    };

    const safeFit = () => {
      if (!isTermReady()) return;
      try {
        const proposed = fitRef.current?.proposeDimensions();
        if (!proposed || proposed.cols <= 0 || proposed.rows <= 0) return;
        const term = termRef.current;
        if (!term) return;
        if (term.cols !== proposed.cols || term.rows !== proposed.rows) {
          term.resize(proposed.cols, proposed.rows);
          scheduleNotify(proposed.cols, proposed.rows);
        }
      } catch {}
    };

    const debouncedFit = () => {
      safeFit();
      if (fitThrottle) window.clearTimeout(fitThrottle);
      fitThrottle = window.setTimeout(() => {
        fitThrottle = null;
        safeFit();
      }, 100);
    };

    const observer = new ResizeObserver(() => { debouncedFit(); });
    observer.observe(container);

    return () => {
      try { observer.disconnect(); } catch {}
      if (fitThrottle) { try { window.clearTimeout(fitThrottle); } catch {} }
      // Flush del notify pendiente para que la PTY quede con el tamaño final.
      if (notifyTimer) { try { window.clearTimeout(notifyTimer); } catch {} }
      if (pendingNotify) {
        const p = pendingNotify;
        pendingNotify = null;
        notifyResize(p.cols, p.rows).catch(() => {});
      }
    };
  }, [containerRef, sessionId]);
}
