/**
 * useTerminalResize.ts — ResizeObserver + fit + notificación de tamaño al backend SSH.
 *
 * Responsable de:
 * - Re-ajustar el tamaño visual del terminal (`fit.fit()` / resize asimétrico) ante
 *   cambios de tamaño del contenedor (ResizeObserver), del layout (sidebar/bottom-bar/
 *   pins toggled, transiciones CSS) o de la ventana.
 * - Notificar el tamaño final (cols/rows) al backend vía `ssh_resize`, con debounce,
 *   solo cuando cambia respecto al último tamaño enviado.
 *
 * Nota de orden: este hook se monta ANTES que useTerminalLifecycle en el hook
 * orquestador (useTerminal.ts) para que, en cleanup, sus listeners/observers se
 * remuevan ANTES de que el terminal se destruya (`term.dispose()`) — reproduciendo
 * el orden interno del efecto único original (resize cleanup antes que dispose).
 *
 * Los handlers acceden a `termRef.current` / `fitRef.current` en vez de variables
 * locales: son válidos apenas useTerminalLifecycle los puebla (mismo commit/render),
 * y se auto-protegen con checks de null si llegaran a dispararse antes.
 */
import { useEffect, MutableRefObject, RefObject } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { canRefocusTerminal, isPaneVisible } from './terminalDomUtils';

interface UseTerminalResizeParams {
  containerRef: RefObject<HTMLDivElement | null>;
  sessionId: string | null;
  termRef: MutableRefObject<Terminal | null>;
  fitRef: MutableRefObject<FitAddon | null>;
  hasFocusedOnceRef: MutableRefObject<boolean>;
  /** Notifica el nuevo tamaño (cols/rows) al backend correspondiente (SSH o terminal local). */
  notifyResize: (cols: number, rows: number) => Promise<void>;
}

export function useTerminalResize({
  containerRef,
  sessionId,
  termRef,
  fitRef,
  hasFocusedOnceRef,
  notifyResize,
}: UseTerminalResizeParams): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Refs internas del efecto original (algunas se mantienen sin uso activo
    // por fidelidad 1:1 con el comportamiento previo; ver reporte del batch).
    const resizeTimeoutsRef: MutableRefObject<number[]> = { current: [] };
    const isResizingRef: MutableRefObject<boolean> = { current: false };
    const resizeThrottleRef: MutableRefObject<number | null> = { current: null };
    const resizeObserverRef: MutableRefObject<ResizeObserver | null> = { current: null };
    const lastColsRef: MutableRefObject<number> = { current: 80 };
    const lastBackendSizeRef: MutableRefObject<{ cols: number; rows: number } | null> = { current: null };

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

    const safeFit = () => {
      if (!isTermReady()) return;
      try {
        const proposed = fitRef.current?.proposeDimensions();
        if (!proposed || proposed.cols <= 0 || proposed.rows <= 0) return;
        const term = termRef.current;
        if (!term) return;
        if (term.cols !== proposed.cols || term.rows !== proposed.rows) {
          term.resize(proposed.cols, proposed.rows);
          notifyResize(proposed.cols, proposed.rows).catch(() => {});
        }
      } catch {}
    };

    const onResize = () => {
      safeFit();
      try { if (termRef.current && hasFocusedOnceRef.current && canRefocusTerminal(containerRef)) termRef.current.focus(); } catch {}
    };

    window.addEventListener('resize', onResize);

    const debouncedResize = () => {
      if (resizeThrottleRef.current) {
        window.clearTimeout(resizeThrottleRef.current);
      }
      safeFit();
      resizeThrottleRef.current = window.setTimeout(() => {
        safeFit();
      }, 100);
    };

    const onSidebarToggled = () => { debouncedResize(); };
    const onBottomBarToggled = () => { debouncedResize(); };
    const onPinsToggled = () => { debouncedResize(); };
    window.addEventListener('app:sidebar-toggled', onSidebarToggled as any);
    window.addEventListener('app:bottombar-toggled', onBottomBarToggled as any);
    window.addEventListener('app:pins-toggled', onPinsToggled as any);


    if (container && window.ResizeObserver) {
      resizeObserverRef.current = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === container) {
            debouncedResize();
          }
        }
      });
      resizeObserverRef.current.observe(container);
    }

    const mainContentEl = document.querySelector('.main-content');
    const onTransitionEnd = (ev: Event) => {
      const te = ev as TransitionEvent;
      if (!te.propertyName || te.propertyName === 'margin-left') {
        debouncedResize();
      }
    };
    try { mainContentEl?.addEventListener('transitionend', onTransitionEnd); } catch {}

    const bottomBarContent = (() => {
      const el = containerRef.current;
      const stack = el?.closest?.('.terminal-stack') as HTMLElement | null;
      return stack ? (stack.querySelector('.bottom-bar .bb-content') as HTMLElement | null) : null;
    })();
    const onBottomBarTransitionEnd = (ev: Event) => {
      const te = ev as TransitionEvent;
      if (te.propertyName === 'height') {
        debouncedResize();
      }
    };
    try { bottomBarContent?.addEventListener('transitionend', onBottomBarTransitionEnd); } catch {}

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('app:sidebar-toggled', onSidebarToggled as any);
      window.removeEventListener('app:bottombar-toggled', onBottomBarToggled as any);
      window.removeEventListener('app:pins-toggled', onPinsToggled as any);
      try { mainContentEl?.removeEventListener('transitionend', onTransitionEnd); } catch {}
      try {
        const bottomBarContent2 = document.querySelector('.bottom-bar .bb-content');
        bottomBarContent2?.removeEventListener('transitionend', onBottomBarTransitionEnd);
      } catch {}
      resizeTimeoutsRef.current.forEach(timeoutId => {
        try { window.clearTimeout(timeoutId); } catch {}
      });
      resizeTimeoutsRef.current = [];
      if (resizeThrottleRef.current) {
        try { window.clearTimeout(resizeThrottleRef.current); } catch {}
        resizeThrottleRef.current = null;
      }
      if (resizeObserverRef.current) {
        try { resizeObserverRef.current.disconnect(); } catch {}
        resizeObserverRef.current = null;
      }
      isResizingRef.current = false;
    };
  }, [containerRef, sessionId]);
}
