/**
 * useTerminal.ts — hook público de orquestación del terminal embebido (xterm + SSH).
 *
 * REFACTOR #4 (Batch 2): este hook fue descompuesto desde una única función de
 * ~740 líneas en 4 sub-hooks especializados (`components/terminal/hooks/`), cada
 * uno responsable de una preocupación concreta. Este archivo solo:
 * 1. Crea los refs compartidos (instancia xterm, addons, metadata de sesión, etc.)
 *    — estas refs NO van a Zustand: son estado interno de una única instancia de
 *    terminal, no estado que deba compartirse entre componentes.
 * 2. Compone los sub-hooks, en un orden específico que preserva el mismo orden de
 *    montaje/limpieza (mount/cleanup) que tenía el efecto único original.
 * 3. Devuelve el mismo contrato público que antes: `{ isLoading, isFadingOut, waitingForPrompt }`.
 *
 * Sub-hooks:
 * - useTerminalResize      → ResizeObserver + fit + notificación de tamaño al backend.
 * - useTerminalLifecycle   → init/dispose de xterm + addons, blink del cursor, tema.
 * - useTerminalSessionCapture → serialización/guardado del log de sesión.
 * - useTerminalSshListener → listener `ssh_out_<id>` + estado de carga (isLoading/etc).
 *
 * Orden de composición (IMPORTANTE, no reordenar sin entender por qué):
 * React ejecuta los cleanups de los efectos en el MISMO orden en que los hooks
 * fueron llamados (no al revés), y luego ejecuta los nuevos "bodies" también en
 * ese mismo orden. Con las 4 llamadas en el orden de abajo:
 *   1. useTerminalSessionCapture()  (necesita ir primero: expone `captureCurrentSession`,
 *                                     que useTerminalLifecycle usa como callback `onDispose`)
 *   2. useTerminalResize()
 *   3. useTerminalLifecycle()
 *   4. useTerminalSshListener()
 * ...el cleanup, en un cambio de sesión o desmontaje, ocurre en ese mismo orden:
 * primero se remueve el listener de guardado explícito (sessionCapture), luego
 * los listeners/observers de resize, luego se captura la sesión saliente y se
 * destruye el terminal (`term.dispose()`, dentro del cleanup de lifecycle), y
 * por último se remueve el listener SSH. Esto reproduce el orden interno del
 * efecto único original (resize se limpia ANTES que el dispose del terminal).
 * Se verificó que el hecho de que `useTerminalSessionCapture` lea `termRef.current`
 * antes de que `useTerminalLifecycle` haya creado la nueva instancia (en un cambio
 * de sesión) no afecta el comportamiento: esa lectura solo se usa como guard de
 * truthiness, nunca se opera sobre la instancia en sí dentro de ese hook.
 */
import { useEffect, useRef, RefObject } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SerializeAddon } from '@xterm/addon-serialize';
import { useTerminalResize } from './hooks/useTerminalResize';
import { useTerminalLifecycle } from './hooks/useTerminalLifecycle';
import { useTerminalSessionCapture } from './hooks/useTerminalSessionCapture';
import { useTerminalSshListener } from './hooks/useTerminalSshListener';
import { canRefocusTerminal } from './hooks/terminalDomUtils';
import { TerminalSessionMetadata } from './hooks/terminalTypes';

export function useTerminal(
  sessionId: string | null,
  containerRef: RefObject<HTMLDivElement>,
  theme: string,
  onTerminalOutput?: (data: string) => void,
  onTerminalInput?: (data: string) => void,
  /** Comando ssh local equivalente (se muestra typeado al abrir la sesión embebida). */
  localSshCommand?: string | null,
) {
  // ── Refs compartidas entre sub-hooks (instancia xterm + addons) ──────────────
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const serializeRef = useRef<SerializeAddon | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const hasFocusedOnceRef = useRef<boolean>(false);

  // ── Refs de estado de captura/guardado de sesión ──────────────────────────────
  const sessionMetadataRef = useRef<TerminalSessionMetadata | null>(null);
  const snapshotsHistoryRef = useRef<string[]>([]);
  const lastSnapshotRef = useRef<string>('');
  const hasBeenSavedRef = useRef<boolean>(false);
  const savingPromiseRef = useRef<Promise<void> | null>(null);

  // Se instancia primero porque useTerminalLifecycle necesita su `captureCurrentSession`
  // como callback de cleanup (ver nota de orden arriba).
  const { captureCurrentSession, captureSnapshot } = useTerminalSessionCapture({
    sessionId,
    localSshCommand,
    termRef,
    serializeRef,
    sessionMetadataRef,
    snapshotsHistoryRef,
    lastSnapshotRef,
    hasBeenSavedRef,
    savingPromiseRef,
  });

  useTerminalResize({
    containerRef,
    sessionId,
    termRef,
    fitRef,
    hasFocusedOnceRef,
  });

  useTerminalLifecycle({
    containerRef,
    sessionId,
    theme,
    termRef,
    fitRef,
    serializeRef,
    hasFocusedOnceRef,
    unlistenRef,
    onDispose: captureCurrentSession,
  });

  const { isLoading, isFadingOut, waitingForPrompt } = useTerminalSshListener({
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
  });

  // Re-enfoca el terminal tras un pequeño delay al cambiar de sesión, para que
  // React termine el re-render antes de robar el foco (ej. al volver de otra pestaña).
  useEffect(() => {
    if (!sessionId || !termRef.current) return;
    const t = setTimeout(() => {
      try {
        if (canRefocusTerminal(containerRef)) {
          termRef.current?.focus();
        }
      } catch {}
    }, 50);
    return () => clearTimeout(t);
  }, [sessionId]);

  return { isLoading, isFadingOut, waitingForPrompt };
}
