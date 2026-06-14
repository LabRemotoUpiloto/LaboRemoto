/**
 * useConnectForm.ts  — FACHADA DE COMPOSICIÓN
 *
 * Compone useConnectionForm (formulario + validación)
 * y useConnectionActions (conexión SSH + guardado de host)
 * en una sola interfaz pública compatible con ConnectForm.tsx.
 *
 * Migración interna: el código que usaba este hook no necesita cambiar.
 * Si quieres usar los hooks directamente, importa desde:
 *   - hooks/useConnectionForm.ts
 *   - hooks/useConnectionActions.ts
 */

import { useState } from 'react';
import type { ConnectFormProps } from '../components/connect/ConnectForm';
import { useConnectionForm } from './useConnectionForm';
import { useConnectionActions } from './useConnectionActions';

export function useConnectForm({
  onConnected,
  getTermSize,
  initialPayload,
  quickHost,
  recentConnection,
  recentConnections = [],
  onQuickHostCleared,
  onConnectionSuccess,
}: ConnectFormProps) {
  // UI state exclusivo del modal de guardado (no pertenece a ningún hook puro)
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [successAlertOpen, setSuccessAlertOpen] = useState(false);
  const [successAlertMessage, setSuccessAlertMessage] = useState('');

  // ── Hook 1: formulario + validación ─────────────────────────────────────────
  const form = useConnectionForm({
    quickHost,
    recentConnection,
    recentConnections,
    onQuickHostCleared,
    initialPayload,
  });

  // ── Hook 2: acciones de red y persistencia ───────────────────────────────────
  const actions = useConnectionActions({
    host: form.host,
    port: form.port,
    user: form.user,
    password: form.password,
    isEditMode: form.isEditMode,
    originalHostFile: form.originalHostFile,
    validateForm: form.validateForm,
    recentConnections,
    getTermSize,
    onConnected,
    onConnectionSuccess,
    setSaveModalOpen,
    setSuccessAlertMessage,
    setSuccessAlertOpen,
  });

  // ── Interfaz pública unificada (compatible con el ConnectForm existente) ──────
  return {
    // Campos
    ...form,
    // Acciones
    connect: actions.connect,
    handleSaveHost: actions.handleSaveHost,
    cancelConnection: actions.cancelConnection,
    isConnecting: actions.isConnecting,
    // Estado de modales
    saveModalOpen,
    setSaveModalOpen,
    successAlertOpen,
    successAlertMessage,
    setSuccessAlertOpen,
    setSuccessAlertMessage,
  };
}
