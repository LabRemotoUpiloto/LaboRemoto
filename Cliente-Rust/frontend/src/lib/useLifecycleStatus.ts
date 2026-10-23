// hooks/useLifecycleStatus.ts — Estado compartido de lifecycle (status/error/mounted)
// para hooks de sesión de medios (VNC, cámaras, etc).
//
// Extrae SOLO la parte verdaderamente idéntica entre useDesktopSession y useCameraGrid:
// el tracking de "sigue montado" y el par status/error. Los guards de concurrencia
// (startingRef, stoppedRef) se quedan en cada hook porque tienen semántica distinta
// (uno bloquea reentradas de start(), el otro corta pollers al detener/desmontar) y
// unificarlos introduciría el mismo tipo de bug de timing ya encontrado en Batch 2.

import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseLifecycleStatusResult<S extends string> {
  status: S
  setStatus: (s: S) => void
  error: string | null
  setError: (e: string | null) => void
  /** Lee esto DENTRO de callbacks async/eventos (momento de disparo), no en el
   *  cuerpo del efecto (momento de registro) — evita actualizar estado tras desmontar. */
  isMounted: () => boolean
}

export function useLifecycleStatus<S extends string>(initial: S): UseLifecycleStatusResult<S> {
  const [status, setStatus] = useState<S>(initial)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const isMounted = useCallback(() => mountedRef.current, [])

  return { status, setStatus, error, setError, isMounted }
}
