/**
 * useTerminalSessionCapture.ts — captura/serialización y guardado del log de sesión.
 *
 * Responsable de:
 * - Exponer `captureCurrentSession`: serializa el buffer del terminal (xterm
 *   SerializeAddon) + el historial de snapshots acumulado, arma la metadata final
 *   (parseando user/host/port desde el sessionId si aplica) y llama a
 *   `captureAndSaveSession` (servicio) para persistir el log en el backend.
 *   Es idempotente (`hasBeenSavedRef`) y deduplica llamadas concurrentes
 *   (`savingPromiseRef`) — igual que en el hook monolítico original.
 * - Exponer `captureSnapshot`: guarda un snapshot intermedio del buffer cuando
 *   se detecta que el contenido "se redujo a la mitad" (ej. `clear`), para no
 *   perder el historial visible antes de un clear de pantalla.
 * - Detectar el cambio de sesión (`sessionId` cambia) para capturar/guardar la
 *   sesión ANTERIOR antes de resetear el estado de captura para la nueva.
 * - Escuchar `app:save-session-before-close` (guardado explícito solicitado por
 *   el resto de la UI antes de cerrar una pestaña/sesión).
 *
 * Los refs (`sessionMetadataRef`, `snapshotsHistoryRef`, etc.) son propiedad del
 * hook orquestador (useTerminal.ts) y se pasan por parámetro para que
 * useTerminalSshListener (quien puebla `sessionMetadataRef` al abrir sesión) y
 * useTerminalLifecycle (quien llama a `captureCurrentSession` al destruir el
 * terminal) puedan compartir el mismo estado sin duplicar lógica de guardado.
 */
import { useEffect, MutableRefObject } from 'react';
import { SerializeAddon } from '@xterm/addon-serialize';
import { captureAndSaveSession, SessionMetadata } from '@/features/logs/session.service';
import { SAVE_SESSION_BEFORE_CLOSE_EVENT } from '@/features/conexion/ssh.service';
import { TerminalSessionMetadata } from './terminalTypes';
import { EVENTO_EXPORTAR_REGISTRO, type RegistroSesion } from '@/features/cursos/registroSesion';

interface UseTerminalSessionCaptureParams {
  sessionId: string | null;
  localSshCommand?: string | null;
  serializeRef: MutableRefObject<SerializeAddon | null>;
  sessionMetadataRef: MutableRefObject<TerminalSessionMetadata | null>;
  snapshotsHistoryRef: MutableRefObject<string[]>;
  lastSnapshotRef: MutableRefObject<string>;
  hasBeenSavedRef: MutableRefObject<boolean>;
  savingPromiseRef: MutableRefObject<Promise<void> | null>;
}

interface UseTerminalSessionCaptureResult {
  /** Serializa y guarda la sesión actual (idempotente, deduplica llamadas concurrentes). */
  captureCurrentSession: () => Promise<void>;
  /** Guarda un snapshot intermedio del buffer si detecta una reducción de contenido (ej. clear). */
  captureSnapshot: () => void;
}

/** user/host/port finales: si el sessionId es «usuario@host:puerto», manda sobre lo que trae la metadata. */
function metadataFinal(metadata: TerminalSessionMetadata, endTime: string): SessionMetadata {
  let finalMetadata: SessionMetadata = { ...metadata, endTime };
  if (metadata.sessionId.includes('@') && metadata.sessionId.includes(':')) {
    const parts = metadata.sessionId.split('@');
    const user = parts[0] || metadata.user;
    const hostPort = parts[1]?.split(':') || [];
    const host = hostPort[0] || metadata.host;
    const port = parseInt(hostPort[1]) || metadata.port;
    finalMetadata = { ...metadata, user, host, port, endTime };
  }
  return finalMetadata;
}

export function useTerminalSessionCapture({
  sessionId,
  localSshCommand,
  serializeRef,
  sessionMetadataRef,
  snapshotsHistoryRef,
  lastSnapshotRef,
  hasBeenSavedRef,
  savingPromiseRef,
}: UseTerminalSessionCaptureParams): UseTerminalSessionCaptureResult {
  const captureCurrentSession = async (): Promise<void> => {
    if (savingPromiseRef.current) {
      return savingPromiseRef.current;
    }
    if (hasBeenSavedRef.current) {
      return;
    }
    const metadata = sessionMetadataRef.current;
    const serialize = serializeRef.current;
    if (!metadata || !serialize) return;
    savingPromiseRef.current = (async () => {
      try {
        hasBeenSavedRef.current = true;
        const finalSnapshot = serialize.serialize();
        const allSnapshots = [...snapshotsHistoryRef.current];
        if (finalSnapshot && finalSnapshot.length > 10) {
          allSnapshots.push(finalSnapshot);
        }
        const fullHistory = allSnapshots.join('\n');
        if (fullHistory && fullHistory.length > 10) {
          const endTime = new Date().toISOString();
          await captureAndSaveSession(fullHistory, metadataFinal(metadata, endTime));
        }
      } catch (error) {
        hasBeenSavedRef.current = false;
        throw error;
      } finally {
        savingPromiseRef.current = null;
      }
    })();
    return savingPromiseRef.current;
  };

  const captureSnapshot = () => {
    const serialize = serializeRef.current;
    if (serialize) {
      try {
        const snapshot = serialize.serialize();
        if (snapshot && snapshot !== lastSnapshotRef.current) {
          if (snapshot.length < lastSnapshotRef.current.length / 2 && lastSnapshotRef.current.length > 50) {
            snapshotsHistoryRef.current.push(lastSnapshotRef.current);
          }
          lastSnapshotRef.current = snapshot;
        }
      } catch {
      }
    }
  };

  useEffect(() => {
    const previousMetadata = sessionMetadataRef.current;
    if (previousMetadata && previousMetadata.sessionId !== sessionId) {
      captureCurrentSession();
      snapshotsHistoryRef.current = [];
      lastSnapshotRef.current = '';
      hasBeenSavedRef.current = false;
      savingPromiseRef.current = null;
    }

    const handleSaveBeforeClose = async (event: CustomEvent) => {
      const { sessionId: requestedSessionId } = event.detail;
      if (requestedSessionId === sessionId) {
        try {
          await captureCurrentSession();
          window.dispatchEvent(new CustomEvent('app:session-saved', { detail: { sessionId } }));
        } catch (error) {
          window.dispatchEvent(new CustomEvent('app:session-save-failed', { detail: { sessionId, error } }));
        }
      }
    };

    // Registro actual de esta sesión, bajo demanda (p. ej. para adjuntarlo a la entrega de una práctica en Moodle).
    // No marca la sesión como guardada ni toca el historial: el log de siempre se guarda al cerrar, completo.
    const handleExportLog = (event: CustomEvent) => {
      const { sessionId: requestedSessionId, responder } = event.detail as { sessionId: string; responder: (r: RegistroSesion | null) => void };
      if (requestedSessionId !== sessionId) return;
      const metadata = sessionMetadataRef.current;
      const serialize = serializeRef.current;
      if (!metadata || !serialize) { responder(null); return; }
      try {
        const snapshots = [...snapshotsHistoryRef.current];
        const finalSnapshot = serialize.serialize();
        if (finalSnapshot && finalSnapshot.length > 10) snapshots.push(finalSnapshot);
        const rawContent = snapshots.join('\n');
        if (rawContent.length <= 10) { responder(null); return; }
        const m = metadataFinal(metadata, new Date().toISOString());
        responder({ sessionId: m.sessionId, user: m.user, host: m.host, port: m.port, startTime: m.startTime, endTime: m.endTime, rawContent });
      } catch {
        responder(null);
      }
    };

    window.addEventListener(SAVE_SESSION_BEFORE_CLOSE_EVENT, handleSaveBeforeClose as EventListener);
    window.addEventListener(EVENTO_EXPORTAR_REGISTRO, handleExportLog as EventListener);

    return () => {
      window.removeEventListener(SAVE_SESSION_BEFORE_CLOSE_EVENT, handleSaveBeforeClose as EventListener);
      window.removeEventListener(EVENTO_EXPORTAR_REGISTRO, handleExportLog as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, localSshCommand]);

  return { captureCurrentSession, captureSnapshot };
}
