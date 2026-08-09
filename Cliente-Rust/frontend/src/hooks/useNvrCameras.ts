// hooks/useNvrCameras.ts
// Reemplazo de useCameraGrid.ts: consume el NVR Shinobi por API HTTP
// (cmd::nvr en el backend), no abre túnel SSH de video propio ni conoce
// MediaMTX/WHEP. El backend ya devuelve `stream_url` lista para HlsPlayer.
import { useState, useEffect, useRef, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useLifecycleStatus } from './useLifecycleStatus'
import type { NvrCamera } from '../bindings/NvrCamera'

export type { NvrCamera }

type GridStatus = 'idle' | 'connecting' | 'active' | 'error'

export function useNvrCameras(groupKey: string | null) {
  const { status, setStatus, error, setError } = useLifecycleStatus<GridStatus>('idle')
  const [cameras, setCameras] = useState<NvrCamera[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stoppedRef = useRef(false)

  const pollCameras = useCallback(async (gk: string) => {
    if (stoppedRef.current) return
    try {
      const list = await invoke<NvrCamera[]>('nvr_list_cameras', { groupKey: gk })
      setCameras(list)
      setError(null)
      setStatus('active')
    } catch (e: any) {
      setError(String(e))
      setStatus('error')
    }
  }, [])

  const start = useCallback(async () => {
    if (!groupKey) return
    stoppedRef.current = false
    setStatus('connecting')
    setError(null)
    await pollCameras(groupKey)
    pollRef.current = setInterval(() => pollCameras(groupKey), 5000)
  }, [groupKey, pollCameras])

  const stop = useCallback(async () => {
    stoppedRef.current = true
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    try {
      await invoke('nvr_disconnect')
    } catch { /* best-effort */ }
    setCameras([])
    setStatus('idle')
  }, [])

  useEffect(() => {
    return () => {
      stoppedRef.current = true
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      invoke('nvr_disconnect').catch(() => {})
    }
  }, [])

  return { cameras, status, error, start, stop }
}
