// components/desktop/DesktopPane.tsx — Escritorio gráfico remoto via noVNC

import React, { useRef, useEffect, useState } from 'react'
import { useDesktopSession } from '../../hooks/useDesktopSession'
import DesktopToolbar from './DesktopToolbar'
import './DesktopPane.css'

interface Props {
  sessionId: string
  isActive?: boolean
}

const DesktopPane: React.FC<Props> = ({ sessionId, isActive = true }) => {
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const rfbRef = useRef<any>(null)
  const [resolution, setResolution] = useState('1280x720')
  const { status, sessionInfo, error, start, stop } = useDesktopSession(sessionId)

  // Portapapeles: texto copiado desde el escritorio remoto (sincronización automática)
  const remoteClipboardRef = useRef<string>('')

  // noVNC deja un <div id="noVNC_mouse_capture_elem"> visible (z-index 10000)
  // si se desconecta mientras un botón del ratón estaba pulsado.
  // Ese proxy bloquea todos los clicks hasta que el usuario genera un mouseup,
  // lo que causa el efecto "el primer clic no hace nada, el segundo sí".
  // Lo ocultamos antes de cada disconnect para evitar ese estado corrupto.
  const disconnectClean = (rfb: any) => {
    const proxy = document.getElementById('noVNC_mouse_capture_elem') as HTMLElement | null
    if (proxy) proxy.style.display = 'none'
    try { rfb.disconnect() } catch { /* ignore */ }
  }

  // Función reutilizable para crear la conexión RFB
  const connectRFB = (container: HTMLDivElement, wsUrl: string) => {
    // Diferir un frame para garantizar que el contenedor tiene dimensiones reales
    // (evita que noVNC calcule una escala de 0 cuando el padre sale de display:none)
    requestAnimationFrame(() => {
      if (rfbRef.current) return  // ya conectado (evitar doble conexión por timing)
      import('@novnc/novnc/lib/rfb')
        .then(m => {
        const RFB = m.default
        const rfb = new RFB(container, wsUrl, { wsProtocols: ['binary'] })
        rfb.scaleViewport = true
        rfb.resizeSession = false
        rfb.qualityLevel = 6
        rfb.viewOnly = false
        rfb.addEventListener('connect', () => {
          const canvas = container.querySelector('canvas')
          if (canvas) (canvas as HTMLElement).focus()
        })
        rfb.addEventListener('disconnect', (e: any) => {
          rfbRef.current = null
          if (e.detail && e.detail.clean === false) stop()
        })
        rfb.addEventListener('credentialsrequired', () => rfb.sendCredentials({ password: '' }))
        // Sincronizar portapapeles remoto → local automáticamente
        rfb.addEventListener('clipboard', (e: any) => {
          const text: string = e.detail?.text ?? ''
          remoteClipboardRef.current = text
          if (text) navigator.clipboard.writeText(text).catch(() => {})
        })
        rfbRef.current = rfb
      })
      .catch(err => console.error('[noVNC] Error:', err))
    }) // fin requestAnimationFrame
  }

  // Cleanup al desmontar: solo desconectar noVNC del WebSocket
  // NO llamar stop() para no matar la sesión VNC al navegar a otra sección
  useEffect(() => {
    return () => {
      if (rfbRef.current) {
        disconnectClean(rfbRef.current)
        rfbRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Only auto-start VNC when the user explicitly navigates to the desktop view
  // Do NOT auto-start on mount — the DesktopPane is always mounted (visibility: hidden)
  // and auto-starting causes port-forward spam when viewing terminal/camera
  // The user must click the "escritorio" toggle button first.


  // Inicializar noVNC cuando el backend está listo (primera vez)
  useEffect(() => {
    if (status !== 'connected' || !sessionInfo || !canvasContainerRef.current) return
    if (rfbRef.current) return
    if (!isActive) return  // esperar a que sea visible para tener dimensiones correctas
    connectRFB(canvasContainerRef.current, `ws://127.0.0.1:${sessionInfo.ws_port}`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, sessionInfo])

  // Al ocultar: desconectar WS para no desperdiciar ancho de banda
  // Al mostrar: iniciar sesión VNC si no está activa, o reconectar RFB
  useEffect(() => {
    if (!isActive) {
      if (rfbRef.current) {
        disconnectClean(rfbRef.current)
        rfbRef.current = null
      }
      return
    }
    // isActive acaba de ser true (user switched to desktop view)
    // If VNC session hasn't been started yet, start it now
    if (status === 'idle') {
      start(resolution)
      return
    }
    // If already connected, just reconnect the RFB websocket
    if (status !== 'connected' || !sessionInfo || !canvasContainerRef.current) return
    if (rfbRef.current) return
    connectRFB(canvasContainerRef.current, `ws://127.0.0.1:${sessionInfo.ws_port}`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive])

  const handleStart = () => {
    start(resolution)
  }

  const handleStop = async () => {
    if (rfbRef.current) {
      disconnectClean(rfbRef.current)
      rfbRef.current = null
    }
    await stop()
  }

  const handleRetry = () => {
    start(resolution)
  }



  return (
    <div className="desktop-pane" style={{ display: isActive ? 'flex' : 'none' }}>
      <DesktopToolbar
        status={status}
        resolution={resolution}
        onResolutionChange={setResolution}
        onStop={handleStop}
        sessionInfo={sessionInfo}
      />

      {/* Estado idle inicial lo ocultamos porque auto-inicia automáticamente */}

      {status === 'starting' && (
        <div className="desktop-loading">
          <div className="desktop-loading-spinner" />
          <span>Iniciando escritorio remoto…</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Arrancando Xvfb + Openbox + x11vnc en el servidor
          </span>
        </div>
      )}

      {status === 'error' && (
        <div className="desktop-error">
          <p>No se pudo iniciar el escritorio remoto</p>
          <pre>{error}</pre>
          <button onClick={handleRetry}>Reintentar</button>
        </div>
      )}

      {/* El div donde noVNC renderiza el canvas — siempre montado para que
          la referencia no cambie entre renders */}
      <div
        ref={canvasContainerRef}
        className="desktop-canvas"
        style={{ display: status === 'connected' ? 'flex' : 'none' }}
        onClick={() => {
          const canvas = canvasContainerRef.current?.querySelector('canvas')
          if (canvas) (canvas as HTMLElement).focus()
        }}
      />
    </div>
  )
}

export default DesktopPane
