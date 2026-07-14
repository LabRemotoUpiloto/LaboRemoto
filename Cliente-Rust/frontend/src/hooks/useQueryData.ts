/**
 * hooks/useQueryData.ts — hook genérico de data-fetching con cache (Batch 3, REFACTOR #4).
 *
 * Envuelve una función `queryFn` (típicamente un `invoke()` de Tauri, directo
 * o vía `commandClient.invoke`) con:
 * - Cache simple in-store (slice `QueryCacheSlice` en `store/queryCache.ts`),
 *   compartido entre todos los componentes que usan la misma `key`.
 * - Estados `data` / `isLoading` / `error`.
 * - TTL configurable (por defecto 30s): mientras la entrada esté "fresca"
 *   no se vuelve a invocar `queryFn` al remontar/reusar la misma key.
 * - `refetch()` para forzar una invalidación + relectura manual.
 *
 * No usa react-query/SWR — decisión de arquitectura confirmada para
 * REFACTOR #4 (cache mínimo, Zustand puro).
 *
 * @example
 * const { data, isLoading, error, refetch } = useQueryData(
 *   `ssh_session_info:${sessionId}`,
 *   () => sshSessionInfo(sessionId!),
 *   { enabled: !!sessionId },
 * );
 */
import { useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '../store/app'
import { CommandError } from '../services/command.service'

/** TTL por defecto de una entrada de cache (30 segundos). */
export const DEFAULT_QUERY_TTL_MS = 30_000

export interface UseQueryDataOptions {
  /** Tiempo de vida del cache en ms. Por defecto {@link DEFAULT_QUERY_TTL_MS}. */
  ttl?: number
  /** Si es `false`, no se ejecuta `queryFn` (útil para queries condicionales). Por defecto `true`. */
  enabled?: boolean
}

export interface UseQueryDataResult<T> {
  data: T | undefined
  isLoading: boolean
  error: CommandError | Error | null
  /** Fuerza una relectura ignorando el cache/TTL vigente. */
  refetch: () => void
}

export function useQueryData<T>(
  key: string,
  queryFn: () => Promise<T>,
  options?: UseQueryDataOptions,
): UseQueryDataResult<T> {
  const ttl = options?.ttl ?? DEFAULT_QUERY_TTL_MS
  const enabled = options?.enabled ?? true

  const entry = useAppStore((state) => state.queryCache[key])
  const setQueryLoading = useAppStore((state) => state.setQueryLoading)
  const setQueryData = useAppStore((state) => state.setQueryData)
  const setQueryError = useAppStore((state) => state.setQueryError)

  // La queryFn puede recrearse en cada render del consumidor (closures sobre
  // props); la guardamos en un ref para no reejecutar el efecto por eso.
  const queryFnRef = useRef(queryFn)
  queryFnRef.current = queryFn

  const fetchData = useCallback(
    async (force = false) => {
      if (!enabled) return

      const current = useAppStore.getState().queryCache[key]
      const isFresh =
        !!current && current.data !== undefined && !current.error && Date.now() - current.timestamp < ttl

      if (!force && isFresh) return

      setQueryLoading(key, true)
      try {
        const data = await queryFnRef.current()
        setQueryData(key, data)
      } catch (err) {
        setQueryError(key, err instanceof Error ? err : new Error(String(err)))
      }
    },
    [key, ttl, enabled, setQueryLoading, setQueryData, setQueryError],
  )

  useEffect(() => {
    fetchData()
    // Solo se re-dispara si cambia la key, el TTL o `enabled`; `fetchData`
    // ya encapsula esas dependencias vía useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData])

  const refetch = useCallback(() => {
    fetchData(true)
  }, [fetchData])

  return {
    data: entry?.data as T | undefined,
    isLoading: entry ? entry.isLoading : enabled,
    error: (entry?.error as CommandError | Error | null) ?? null,
    refetch,
  }
}
