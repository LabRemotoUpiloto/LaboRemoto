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

/**
 * Tamaño máximo del cache (Batch 3, fix de eviction). Keys dinámicas (ej.
 * `ssh:session-info:${sessionId}`) nunca se invalidan por sí solas, así que
 * sin este límite el store crecería indefinidamente en sesiones largas.
 *
 * Estrategia: LRU simple por `timestamp` — al superar el límite se elimina
 * la entrada más antigua (la que lleva más tiempo sin refrescarse) hasta
 * volver a estar dentro del límite. Se aplica en `setQueryData`, que es el
 * único punto donde el cache puede crecer con una key nueva.
 */
export const MAX_QUERY_CACHE_ENTRIES = 50

/** Elimina las entradas más antiguas (por `timestamp`) hasta respetar `maxEntries`. */
function evictOldestEntries(
  cache: Record<string, QueryCacheEntry>,
  maxEntries: number,
): Record<string, QueryCacheEntry> {
  const keys = Object.keys(cache)
  if (keys.length <= maxEntries) return cache

  const oldestFirst = keys.sort((a, b) => cache[a].timestamp - cache[b].timestamp)
  const keysToEvict = oldestFirst.slice(0, keys.length - maxEntries)

  const next = { ...cache }
  for (const key of keysToEvict) delete next[key]
  return next
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
    set((state) => {
      const withNewEntry = {
        ...state.queryCache,
        [key]: {
          data,
          timestamp: Date.now(),
          isLoading: false,
          error: null,
        },
      }
      return { queryCache: evictOldestEntries(withNewEntry, MAX_QUERY_CACHE_ENTRIES) }
    }),

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
