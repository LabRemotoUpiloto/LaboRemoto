/**
 * useLocalTerminal.ts — hook público de orquestación de un panel de terminal
 * local embebido (xterm + PTY nativa). Hermano de useTerminal.ts (SSH):
 * misma composición de 4 sub-hooks y mismo orden de montaje/cleanup (ver
 * comentario de orden en useTerminal.ts), reusando sin cambios
 * useTerminalLifecycle y useTerminalSessionCapture, y usando
 * useTerminalLocalListener en vez de useTerminalSshListener.
 */
import { useRef, RefObject } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SerializeAddon } from '@xterm/addon-serialize';
import { useTerminalResize } from './hooks/useTerminalResize';
import { useTerminalLifecycle } from './hooks/useTerminalLifecycle';
import { useTerminalSessionCapture } from './hooks/useTerminalSessionCapture';
import { useTerminalLocalListener } from './hooks/useTerminalLocalListener';
import { TerminalSessionMetadata } from './hooks/terminalTypes';
import { localTermResize } from '../../services/localTerminal.service';

export function useLocalTerminal(
  paneId: string,
  containerRef: RefObject<HTMLDivElement>,
  theme: string,
) {
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const serializeRef = useRef<SerializeAddon | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const hasFocusedOnceRef = useRef<boolean>(false);

  const sessionMetadataRef = useRef<TerminalSessionMetadata | null>(null);
  const snapshotsHistoryRef = useRef<string[]>([]);
  const lastSnapshotRef = useRef<string>('');
  const hasBeenSavedRef = useRef<boolean>(false);
  const savingPromiseRef = useRef<Promise<void> | null>(null);

  const { captureCurrentSession, captureSnapshot } = useTerminalSessionCapture({
    sessionId: paneId,
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
    sessionId: paneId,
    termRef,
    fitRef,
    hasFocusedOnceRef,
    notifyResize: (cols, rows) => localTermResize(paneId, cols, rows),
  });

  useTerminalLifecycle({
    containerRef,
    sessionId: paneId,
    theme,
    termRef,
    fitRef,
    serializeRef,
    hasFocusedOnceRef,
    unlistenRef,
    onDispose: captureCurrentSession,
  });

  const { isLoading, isFadingOut, waitingForPrompt, hasExited } = useTerminalLocalListener({
    paneId,
    containerRef,
    termRef,
    hasFocusedOnceRef,
    unlistenRef,
    sessionMetadataRef,
    captureCurrentSession,
    captureSnapshot,
  });

  return { isLoading, isFadingOut, waitingForPrompt, hasExited };
}
