import { useCallback, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isMacOS } from '../utils/platform';

const DRAG_THRESHOLD_PX = 5;

/** Elementos que deben recibir clic normal (no iniciar arrastre de ventana). */
export const WINDOW_DRAG_INTERACTIVE_SELECTOR =
  'button, a, input, textarea, select, label, [role="button"], [role="tab"], [contenteditable="true"], [data-no-window-drag]';

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(WINDOW_DRAG_INTERACTIVE_SELECTOR);
}

/**
 * Arrastre de ventana en macOS (titleBar overlay): un clic activa controles;
 * solo tras superar un umbral de movimiento se llama a startDragging().
 */
export function useSmartWindowDrag() {
  const pending = useRef<{ x: number; y: number; started: boolean } | null>(null);

  const clear = useCallback(() => {
    pending.current = null;
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!isMacOS()) return;
    if (e.button !== 0) return;
    if (isInteractiveTarget(e.target)) return;
    const topEl = document.elementFromPoint(e.clientX, e.clientY);
    if (topEl && topEl !== e.currentTarget && isInteractiveTarget(topEl)) return;

    pending.current = { x: e.clientX, y: e.clientY, started: false };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const state = pending.current;
    if (!state || state.started) return;

    const dx = e.clientX - state.x;
    const dy = e.clientY - state.y;
    if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;

    state.started = true;
    void getCurrentWindow().startDragging().catch(() => {});
    clear();
  }, [clear]);

  const releaseCapture = useCallback((e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    clear();
  }, [clear]);

  const dragRegionProps = isMacOS()
    ? {
        onPointerDown,
        onPointerMove,
        onPointerUp: releaseCapture,
        onPointerCancel: releaseCapture,
      }
    : {};

  return { dragRegionProps, isMacEnabled: isMacOS() };
}
