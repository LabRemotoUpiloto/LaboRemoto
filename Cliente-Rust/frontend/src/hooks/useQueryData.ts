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

/**
 * Mapa module-level de promesas en vuelo, indexadas por `key` (Batch 3, fix
 * de deduplicación). Vive fuera del store porque no es estado de UI/render
 * — es puramente un mecanismo de coordinación entre llamadas concurrentes a
 * `fetchQueryData` con la misma key (ej. dos componentes montando a la vez).
 *
 * Cuando ya hay un fetch en curso para una key, las llamadas subsiguientes
 * esperan esa misma promesa en lugar de disparar otra llamada a `queryFn`
 * (típicamente un `invoke()` de Tauri). El store ya se actualiza una sola
 * vez cuando la promesa original resuelve, y todos los componentes
 * suscritos a esa key se re-renderizan automáticamente vía Zustand.
 */
const inFlightRequests = new Map<string, Promise<unknown>>()

export interface FetchQueryDataOptions {
  ttl?: number
  /** Ignora el TTL vigente y fuerza una relectura (pero sigue deduplicando contra un fetch ya en curso). */
  force?: boolean
}

/**
 * Ejecuta (o reutiliza, si ya hay una en curso) el fetch para `key` y
 * actualiza el `QueryCacheSlice` del store con el resultado/estado.
 *
 * Se exporta como función independiente del hook para poder testear la
 * lógica de cache/dedup/TTL sin necesidad de renderizar componentes React.
 */
export async function fetchQueryData<T>(
  key: string,
  queryFn: () => Promise<T>,
  options?: FetchQueryDataOptions,
): Promise<void> {
  const ttl = options?.ttl ?? DEFAULT_QUERY_TTL_MS
  const force = options?.force ?? false

  const { queryCache, setQueryLoading, setQueryData, setQueryError } = useAppStore.getState()
  const current = queryCache[key]
  const isFresh = !!current && current.data !== undefined && !current.error && Date.now() - current.timestamp < ttl

  if (!force && isFresh) return

  const existing = inFlightRequests.get(key)
  if (existing) {
    // Ya hay un fetch en curso para esta key: esperamos su resolución en
    // vez de disparar una llamada duplicada. El error (si lo hay) ya queda
    // registrado en el store por la llamada original.
    await existing.catch(() => undefined)
    return
  }

  setQueryLoading(key, true)
  const promise = queryFn()
  inFlightRequests.set(key, promise)
  try {
    const data = await promise
    setQueryData(key, data)
  } catch (err) {
    setQueryError(key, err instanceof Error ? err : new Error(String(err)))
  } finally {
    if (inFlightRequests.get(key) === promise) {
      inFlightRequests.delete(key)
    }
  }
}

export function useQueryData<T>(
  key: string,
  queryFn: () => Promise<T>,
  options?: UseQueryDataOptions,
): UseQueryDataResult<T> {
  const ttl = options?.ttl ?? DEFAULT_QUERY_TTL_MS
  const enabled = options?.enabled ?? true

  const entry = useAppStore((state) => state.queryCache[key])

  // La queryFn puede recrearse en cada render del consumidor (closures sobre
  // props); la guardamos en un ref para no reejecutar el efecto por eso.
  const queryFnRef = useRef(queryFn)
  queryFnRef.current = queryFn

  const fetchData = useCallback(
    async (force = false) => {
      if (!enabled) return
      await fetchQueryData(key, () => queryFnRef.current(), { ttl, force })
    },
    [key, ttl, enabled],
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
