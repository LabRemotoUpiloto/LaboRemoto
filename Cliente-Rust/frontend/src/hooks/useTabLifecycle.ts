/**
 * useTabLifecycle.ts
 *
 * Gestiona el ciclo de vida de los tabs de sesión SSH:
 * - Cierre seguro de tabs: espera a que la sesión se guarde antes de desconectar.
 * - Desconexión limpia: detiene VNC y llama ssh_disconnect al backend.
 *
 * Extraído de App.tsx para aislar esta lógica compleja y asíncrona.
 */

import { useCallback } from 'react';
import type { Tab } from './useAppTabs';
import { vncStop, sshDisconnect } from '../services/ssh.service';
import { localTermClose } from '../services/localTerminal.service';
import { useAppStore } from '../store/app';

const SAVE_TIMEOUT_MS = 2000;

/**
 * Espera a que la sesión `sessionId` emita el evento 'app:session-saved'
 * o 'app:session-save-failed', con un timeout de seguridad.
 */
function waitForSessionSave(sessionId: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, SAVE_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeout);
      window.removeEventListener('app:session-saved', handleSaved as EventListener);
      window.removeEventListener('app:session-save-failed', handleFailed as EventListener);
    };

    const handleSaved = (event: CustomEvent) => {
      if (event.detail.sessionId === sessionId) { cleanup(); resolve(); }
    };
    const handleFailed = (event: CustomEvent) => {
      if (event.detail.sessionId === sessionId) { cleanup(); resolve(); }
    };

    window.addEventListener('app:session-saved', handleSaved as EventListener);
    window.addEventListener('app:session-save-failed', handleFailed as EventListener);
  });
}

interface UseTabLifecycleParams {
  tabs: Tab[];
  closeTab: (id: string) => void;
  clearPracticeMeta: (id: string) => void;
}

export function useTabLifecycle({ tabs, closeTab, clearPracticeMeta }: UseTabLifecycleParams) {
  const handleCloseTab = useCallback(async (id: string) => {
    const tab = tabs.find(t => t.id === id);

    // Los tabs de log se cierran directamente, sin lógica SSH
    if (tab?.type === 'log') {
      closeTab(id);
      return;
    }

    // Terminal local: N paneles con N sesiones PTY backend independientes
    // (no 1 tab = 1 sesión, como en SSH) — se guarda/cierra cada una.
    if (tab?.type === 'local-terminal') {
      const paneIds = useAppStore.getState().localTerminalPanes[id] || [];
      await Promise.all(paneIds.map(async (paneId) => {
        window.dispatchEvent(new CustomEvent('app:save-session-before-close', { detail: { sessionId: paneId } }));
        await waitForSessionSave(paneId);
      }));
      await Promise.all(paneIds.map((paneId) => localTermClose(paneId).catch(() => {})));
      useAppStore.getState().clearLocalTerminalPanes(id);
      clearPracticeMeta(id);
      closeTab(id);
      return;
    }

    // 1. Señalar al TerminalView que guarde la sesión antes de cerrar
    window.dispatchEvent(
      new CustomEvent('app:save-session-before-close', { detail: { sessionId: id } })
    );

    // 2. Esperar confirmación de guardado (o timeout)
    await waitForSessionSave(id);

    // 3. Desconectar del backend limpiamente
    try {
      // Detener VNC primero si hay sesión gráfica activa
      try { await vncStop(id); } catch { /* ignorar si no hay VNC activo */ }
      await sshDisconnect(id);
    } catch {
      // Si falla la desconexión, igual limpiamos el estado local
    } finally {
      clearPracticeMeta(id);
      closeTab(id);
    }
  }, [tabs, closeTab, clearPracticeMeta]);

  return { handleCloseTab };
}
