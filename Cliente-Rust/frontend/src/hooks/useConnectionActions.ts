/**
 * useConnectionActions.ts
 *
 * Responsabilidad única: acciones de red y persistencia para el formulario de conexión.
 * Depende de `useConnectionForm` para el estado del formulario.
 *
 * Gestiona:
 * - Conectar vía SSH (usando ssh.service)
 * - Cancelar conexión en curso
 * - Guardar host cifrado (usando storage.service)
 * - Mostrar toasts y loading states
 */

import { useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useLoading } from '../contexts/LoadingContext';
import { useToasts } from '../contexts/ToastContext';
import { getDeviceLabel } from '../constants/devices';
import { sshConnect } from '../services/ssh.service';
import { saveHostWithMaster, deleteHostFile } from '../services/storage.service';

interface ConnectionSuccessResult {
  id: string;
  label: string;
}

interface UseConnectionActionsParams {
  // Valores del formulario (vienen de useConnectionForm)
  host: string;
  port: string;
  user: string;
  password: string;
  isEditMode: boolean;
  originalHostFile: string | null;
  validateForm: () => boolean;
  recentConnections?: Array<{ host: string; port: number; user: string }>;
  getTermSize?: () => { cols: number; rows: number };
  onConnected: (result: ConnectionSuccessResult) => void;
  onConnectionSuccess?: (info: { host: string; port: number; user: string }) => void;
  // Setters para acciones post-guardado
  setSaveModalOpen: (v: boolean) => void;
  setSuccessAlertMessage: (v: string) => void;
  setSuccessAlertOpen: (v: boolean) => void;
}

export function useConnectionActions({
  host, port, user, password,
  isEditMode, originalHostFile,
  validateForm,
  recentConnections = [],
  getTermSize,
  onConnected,
  onConnectionSuccess,
  setSaveModalOpen,
  setSuccessAlertMessage,
  setSuccessAlertOpen,
}: UseConnectionActionsParams) {
  const { setLoading, loading: isConnecting } = useLoading();
  const { push } = useToasts();
  const [connectionAbortController, setConnectionAbortController] = useState<AbortController | null>(null);

  // ── Helpers de puerto ─────────────────────────────────────────────────────────

  const getSafePort = () => {
    const parsed = parseInt(port.trim() || '22', 10);
    return parsed > 0 && parsed <= 65535 ? parsed : 22;
  };

  // ── Cancelar conexión en curso ────────────────────────────────────────────────

  const cancelConnection = () => {
    connectionAbortController?.abort();
    setConnectionAbortController(null);
    setLoading(false, null, null);
    push({ type: 'info', message: 'Conexión cancelada' });
  };

  // ── Avisar de conexiones duplicadas ──────────────────────────────────────────

  const checkDuplicateConnection = () => {
    const safePort = getSafePort();
    const exists = recentConnections.some(
      conn => conn.host === host.trim() && conn.port === safePort && conn.user === user.trim()
    );
    if (exists) {
      push({ type: 'info', message: `Ya te has conectado a ${getDeviceLabel(host.trim(), safePort, user.trim())} anteriormente` });
    }
    return exists;
  };

  // ── Conectar vía SSH ──────────────────────────────────────────────────────────

  const connect = async () => {
    if (!validateForm()) {
      push({ type: 'error', message: 'Por favor corrige los errores' });
      return;
    }
    checkDuplicateConnection();

    const safePort = getSafePort();
    const size = getTermSize ? getTermSize() : { cols: 80, rows: 24 };
    const abortController = new AbortController();
    setConnectionAbortController(abortController);
    const displayName = getDeviceLabel(host.trim(), safePort);
    const loadingMessage = `Conectando a ${displayName}...`;

    let unlistenSuccess: (() => void) | null = null;
    let unlistenError: (() => void) | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
      const connectionPromise = new Promise<ConnectionSuccessResult>((resolve, reject) => {
        listen<any>('ssh_connected', event => {
          if (event.payload?.id && !abortController.signal.aborted) {
            onConnectionSuccess?.({ host: host.trim(), port: safePort, user: user.trim() });
            resolve({ id: event.payload.id, label: `${user}@${displayName}` });
          }
        }).then(fn => { unlistenSuccess = fn; }).catch(reject);

        listen<any>('ssh_connect_error', event => {
          if (event.payload?.id && !abortController.signal.aborted) {
            reject(new Error(event.payload.error || 'Error conectando'));
          }
        }).then(fn => { unlistenError = fn; }).catch(reject);
      });

      setLoading(true, loadingMessage, cancelConnection);

      timeoutId = setTimeout(() => {
        if (!abortController.signal.aborted) {
          abortController.abort();
          unlistenSuccess?.(); unlistenError?.();
          setLoading(false, null, null);
          setConnectionAbortController(null);
          push({ type: 'error', message: 'Tiempo de espera agotado (30s)' });
        }
      }, 30000);

      await new Promise(r => setTimeout(r, 100));
      const _id = await sshConnect({ host: host.trim(), port: safePort, user: user.trim(), password, cols: size.cols, rows: size.rows });
      void _id; // el resultado llega via evento ssh_connected

      if (abortController.signal.aborted) {
        if (timeoutId) clearTimeout(timeoutId);
        unlistenSuccess?.(); unlistenError?.();
        return;
      }

      const result = await connectionPromise;
      if (timeoutId) clearTimeout(timeoutId);
      unlistenSuccess?.(); unlistenError?.();
      onConnected(result);
      push({ type: 'success', message: `Conectado a ${displayName}` });
      setLoading(false, null, null);
      setConnectionAbortController(null);
    } catch (e: any) {
      if (timeoutId) clearTimeout(timeoutId);
      unlistenSuccess?.(); unlistenError?.();
      if (!abortController.signal.aborted) {
        push({ type: 'error', message: e?.message || 'Error conectando' });
        setLoading(false, null, null);
        setConnectionAbortController(null);
      }
    }
  };

  // ── Guardar host cifrado ──────────────────────────────────────────────────────

  const handleSaveHost = async (name: string) => {
    if (!validateForm()) {
      push({ type: 'error', message: 'Corrige los errores antes de guardar' });
      return;
    }
    const safePort = getSafePort();
    const newHostId = `${host.trim()}:${safePort}:${user.trim()}`;
    try {
      if (isEditMode && originalHostFile && originalHostFile !== newHostId) {
        try { await deleteHostFile(originalHostFile); } catch { /* ignorar */ }
      }
      await saveHostWithMaster(newHostId, { host: host.trim(), port: safePort, user: user.trim(), password, name: name.trim() || undefined });
      setSaveModalOpen(false);
      setSuccessAlertMessage(isEditMode ? 'Host editado correctamente' : 'Host guardado correctamente');
      // El reset de isEditMode/originalHostFile pasa por clearForm(), que
      // dispara el modal de éxito de ConnectForm.tsx al confirmar/cerrar --
      // no hace falta duplicarlo acá.
      setSuccessAlertOpen(true);
    } catch {
      push({ type: 'error', message: 'Error guardando host' });
    }
  };

  return { connect, handleSaveHost, cancelConnection, isConnecting };
}
