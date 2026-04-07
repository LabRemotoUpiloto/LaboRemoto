// hooks/useCameraGrid.ts
import { useState, useEffect, useRef, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'

/** Devuelve true si el host es claramente un túnel público (Pinggy/ngrok).
 *  En esos casos UDP no funciona, así que WebRTC no tiene sentido. */
function isTunnelHost(host: string): boolean {
  // Pinggy genera subdominios *.tun.pgy.io; ngrok usa *.ngrok-free.app etc.
  return /\.(tun\.pgy\.io|ngrok|loca\.lt|serveo\.net|trycloudflare)/.test(host)
}

export interface CameraInfo {
  id: string
  name: string
  ip?: string
  status: 'active' | 'connecting' | 'offline'
}

type GridStatus = 'idle' | 'connecting' | 'active' | 'error'

export function useCameraGrid(sessionId: string | null) {
  const [cameras, setCameras] = useState<CameraInfo[]>([])
  const [localPort, setLocalPort] = useState<number | null>(null)
  const [piHost, setPiHost] = useState<string | null>(null)
  const [status, setStatus] = useState<GridStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stoppedRef = useRef(false)

  const pollCameras = useCallback(async (sid: string) => {
    if (stoppedRef.current) return
    try {
      const list = await invoke<CameraInfo[]>('stream_list_cameras', { sessionId: sid })
      setCameras(list)
      setError(null)
    } catch (e: any) {
      setError(String(e))
    }
  }, [])

  const start = useCallback(async () => {
    if (!sessionId) return
    stoppedRef.current = false
    setStatus('connecting')
    setError(null)
    try {
      const port = await invoke<number>('stream_start', {
        sessionId,
        remotePort: 8888,
        localPort: 0,
      })
      setLocalPort(port)
      setStatus('active')

      // Obtener IP de la Pi para URLs WHEP (WebRTC).
      // Descartamos solo si es claramente un hostname de túnel público.
      try {
        const hostInfo = await invoke<{ host: string; whep_port: number }>('stream_get_host', { sessionId })
        if (!isTunnelHost(hostInfo.host)) {
          setPiHost(hostInfo.host)
        }
      } catch { /* host opcional */ }

      // Start polling for camera list
      await pollCameras(sessionId)
      pollRef.current = setInterval(() => pollCameras(sessionId), 5000)
    } catch (e: any) {
      setError(String(e))
      setStatus('error')
    }
  }, [sessionId, pollCameras])

  const stop = useCallback(async () => {
    stoppedRef.current = true
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    if (sessionId) {
      try {
        await invoke('stream_stop', { sessionId })
      } catch {}
    }
    setLocalPort(null)
    setPiHost(null)
    setCameras([])
    setStatus('idle')
  }, [sessionId])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stoppedRef.current = true
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      if (sessionId) {
        invoke('stream_stop', { sessionId }).catch(() => {})
      }
    }
  }, [sessionId])

  return { cameras, localPort, piHost, status, error, start, stop }
}
