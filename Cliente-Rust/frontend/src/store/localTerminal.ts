/**
 * store/localTerminal.ts — slice de Zustand que mapea cada tab de "Terminal
 * local" a la lista de ids de panel (sesiones PTY backend) que contiene.
 *
 * Existe porque `useTabLifecycle.ts` necesita, al cerrar un tab, disparar
 * `app:save-session-before-close` + esperar confirmación por cada panel
 * (mismo patrón que ya usa para sesiones SSH individuales) — sin este mapeo
 * no habría forma de saber, desde fuera de `LocalTerminalGroup`, cuántos
 * paneles activos tiene un tab dado.
 */
import { StateCreator } from 'zustand'

export interface LocalTerminalSlice {
  localTerminalPanes: Record<string, string[]>
  setLocalTerminalPanes: (tabId: string, paneIds: string[]) => void
  clearLocalTerminalPanes: (tabId: string) => void
}

export const createLocalTerminalSlice: StateCreator<LocalTerminalSlice, [], [], LocalTerminalSlice> = (set) => ({
  localTerminalPanes: {},

  setLocalTerminalPanes: (tabId, paneIds) =>
    set((state) => ({
      localTerminalPanes: { ...state.localTerminalPanes, [tabId]: paneIds },
    })),

  clearLocalTerminalPanes: (tabId) =>
    set((state) => {
      if (!(tabId in state.localTerminalPanes)) return state
      const next = { ...state.localTerminalPanes }
      delete next[tabId]
      return { localTerminalPanes: next }
    }),
})
