// hooks/useDesktopSession.ts — Ciclo de vida de una sesión gráfica VNC remota

import { useState, useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useLifecycleStatus } from './useLifecycleStatus'
import { setPendingChatMessage } from '../utils/pendingChatMessage'

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
          // Los comandos que devuelven CommandError (ver backend/src/cmd/protocol.rs)
          // rechazan invoke() con el objeto serializado { code, message, ... },
          // no con un string — String(e) sobre eso da "[object Object]".
          const message =
            e && typeof e === 'object' && 'message' in e
              ? String((e as { message: unknown }).message)
              : String(e)
          setError(message)
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

  // Dependencias faltantes en el servidor (Xvnc/openbox/lxpanel/pcmanfm, o no
  // aplica por SO): el backend ya detectó el SO remoto y armó el mensaje con
  // el comando (ya viene en un bloque ```bash — ver utils.rs) o la
  // explicación correcta. Abrimos el chat e inyectamos ese texto YA
  // ARMADO como si lo hubiera dicho el asistente — no le pedimos al modelo
  // que lo redacte (sería no determinístico para algo que ya sabemos de
  // antemano). El botón "Ejecutar" del bloque de código lo corre contra la
  // terminal real; cualquier pregunta de seguimiento ya tiene este mensaje
  // como contexto (ver `pendingChatMessage.ts` y el efecto que lo consume
  // en ChatPane.tsx).
  useEffect(() => {
    const unlistenPromise = listen<{ message: string }>(
      `vnc_deps_missing_${sessionId}`,
      event => {
        const text =
          `No pude iniciar el escritorio remoto: al servidor le falta algo instalado.\n\n` +
          `${event.payload.message}\n\n` +
          `Contame si corrés el comando y qué te tira, así te ayudo a resolverlo.`
        setPendingChatMessage({ text, model: 'deepseek/deepseek-v3.2:free' })
        window.dispatchEvent(new CustomEvent('tour:open-chat'))
        document.dispatchEvent(new CustomEvent('chat:check-pending-msg'))
      },
    )
    return () => {
      unlistenPromise.then(fn => fn())
    }
  }, [sessionId])

  return { status, sessionInfo, error, start, stop }
}
