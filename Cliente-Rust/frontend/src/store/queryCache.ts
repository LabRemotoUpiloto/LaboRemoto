/**
 * store/queryCache.ts — slice de cache de queries (Zustand), REFACTOR #4 Batch 3.
 *
 * Cache simple in-store para datos obtenidos vía `invoke()` de Tauri, usado
 * por el hook `useQueryData` (hooks/useQueryData.ts). Cada entrada se
 * identifica por una `key` string arbitraria (ej. nombre del comando +
 * parámetros serializados) y guarda el último dato exitoso, su timestamp
 * (usado para el TTL) y el estado de carga/error.
 *
 * Decisión de arquitectura confirmada: cache in-store con Zustand puro,
 * SIN react-query/SWR. Este slice se compone en `store/app.ts` junto con
 * los demás slices (ej. `AuthSlice`).
 */
import { StateCreator } from 'zustand'

export interface QueryCacheEntry {
  data: unknown
  timestamp: number
  isLoading: boolean
  error: unknown
}

export interface QueryCacheSlice {
  queryCache: Record<string, QueryCacheEntry>
  setQueryLoading: (key: string, isLoading: boolean) => void
  setQueryData: (key: string, data: unknown) => void
  setQueryError: (key: string, error: unknown) => void
  /** Invalida (borra) la entrada de cache de una key específica, forzando refetch en el próximo montaje/uso. */
  invalidateQuery: (key: string) => void
  /** Invalida (borra) todo el cache de queries. */
  invalidateAllQueries: () => void
}

export const createQueryCacheSlice: StateCreator<QueryCacheSlice, [], [], QueryCacheSlice> = (set) => ({
  queryCache: {},

  setQueryLoading: (key, isLoading) =>
    set((state) => {
      const prev = state.queryCache[key]
      return {
        queryCache: {
          ...state.queryCache,
          [key]: {
            data: prev?.data,
            timestamp: prev?.timestamp ?? 0,
            error: prev?.error ?? null,
            isLoading,
          },
        },
      }
    }),

  setQueryData: (key, data) =>
    set((state) => ({
      queryCache: {
        ...state.queryCache,
        [key]: {
          data,
          timestamp: Date.now(),
          isLoading: false,
          error: null,
        },
      },
    })),

  setQueryError: (key, error) =>
    set((state) => {
      const prev = state.queryCache[key]
      return {
        queryCache: {
          ...state.queryCache,
          [key]: {
            data: prev?.data,
            timestamp: prev?.timestamp ?? 0,
            isLoading: false,
            error,
          },
        },
      }
    }),

  invalidateQuery: (key) =>
    set((state) => {
      if (!(key in state.queryCache)) return state
      const next = { ...state.queryCache }
      delete next[key]
      return { queryCache: next }
    }),

  invalidateAllQueries: () => set({ queryCache: {} }),
})
