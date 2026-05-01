// hooks/useDesktopSession.ts — Ciclo de vida de una sesión gráfica VNC remota

import { useState, useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export type DesktopStatus =
  | 'idle'
  | 'starting'
  | 'connected'
  | 'disconnected'
  | 'error'

export interface DesktopSessionInfo {
  ws_port: number
  display: number
  vnc_port: number
}

export function useDesktopSession(sessionId: string) {
  const [status, setStatus] = useState<DesktopStatus>('idle')
  const [sessionInfo, setSessionInfo] = useState<DesktopSessionInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Guard contra llamadas concurrentes
  const startingRef = useRef(false)
  // Si el componente se desmontó, no actualizar estado
  const mountedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // Resetear el guard para que funcione correctamente en StrictMode
      startingRef.current = false
    }
  }, [])

  const start = useCallback(
    async (resolution?: string) => {
      if (startingRef.current) return
      startingRef.current = true
      if (mountedRef.current) setStatus('starting')
      if (mountedRef.current) setError(null)
      try {
        const info = await invoke<DesktopSessionInfo>('vnc_start', {
          sessionId,
          resolution: resolution ?? '1280x720',
        })
        if (mountedRef.current) {
          setSessionInfo(info)
          setStatus('connected')
        }
      } catch (e) {
        if (mountedRef.current) {
          setError(String(e))
          setStatus('error')
        }
      } finally {
        startingRef.current = false
      }
    },
    [sessionId],
  )

  const stop = useCallback(async () => {
    startingRef.current = false
    if (mountedRef.current) {
      setStatus('disconnected')
      setSessionInfo(null)
    }
    try {
      await invoke('vnc_stop', { sessionId })
    } catch {
      // ignore — backend limpia igualmente al cerrar sesión SSH
    }
    if (mountedRef.current) setStatus('idle')
  }, [sessionId])

  // Escuchar el evento vnc_ready emitido por el backend
  useEffect(() => {
    const unlistenPromise = listen<{ ws_port: number; display: number }>(
      `vnc_ready_${sessionId}`,
      event => {
        if (!mountedRef.current) return
        setSessionInfo(prev =>
          prev
            ? { ...prev, ws_port: event.payload.ws_port, display: event.payload.display }
            : null,
        )
        setStatus('connected')
      },
    )
    return () => {
      unlistenPromise.then(fn => fn())
    }
  }, [sessionId])

  return { status, sessionInfo, error, start, stop }
}
