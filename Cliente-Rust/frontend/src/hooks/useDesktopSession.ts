// hooks/useDesktopSession.ts — Ciclo de vida de una sesión gráfica VNC remota

import { useState, useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useLifecycleStatus } from './useLifecycleStatus'

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
  const { status, setStatus, error, setError, isMounted } = useLifecycleStatus<DesktopStatus>('idle')
  const [sessionInfo, setSessionInfo] = useState<DesktopSessionInfo | null>(null)
  // Guard contra llamadas concurrentes a start(); se resetea al desmontar
  // para que funcione correctamente en StrictMode.
  const startingRef = useRef(false)

  useEffect(() => {
    return () => {
      startingRef.current = false
    }
  }, [])

  const start = useCallback(
    async (resolution?: string) => {
      if (startingRef.current) return
      startingRef.current = true
      if (isMounted()) setStatus('starting')
      if (isMounted()) setError(null)
      try {
        const info = await invoke<DesktopSessionInfo>('vnc_start', {
          sessionId,
          resolution: resolution ?? '1280x720',
        })
        if (isMounted()) {
          setSessionInfo(info)
          setStatus('connected')
        }
      } catch (e) {
        if (isMounted()) {
          setError(String(e))
          setStatus('error')
        }
      } finally {
        startingRef.current = false
      }
    },
    [sessionId, isMounted, setStatus, setError],
  )

  const stop = useCallback(async () => {
    startingRef.current = false
    if (isMounted()) {
      setStatus('disconnected')
      setSessionInfo(null)
    }
    try {
      await invoke('vnc_stop', { sessionId })
    } catch {
      // ignore — backend limpia igualmente al cerrar sesión SSH
    }
    if (isMounted()) setStatus('idle')
  }, [sessionId, isMounted, setStatus])

  // Escuchar el evento vnc_ready emitido por el backend
  useEffect(() => {
    const unlistenPromise = listen<{ ws_port: number; display: number }>(
      `vnc_ready_${sessionId}`,
      event => {
        if (!isMounted()) return
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
  }, [sessionId, isMounted, setStatus])

  return { status, sessionInfo, error, start, stop }
}
