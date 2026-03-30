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
    // Doble requestAnimationFrame: el primero espera al próximo frame de pintura,
    // el segundo asegura que el browser ya computó el layout del contenedor
    // (display:none → flex). Sin esto, noVNC calcula dimensiones 0×0 → pantalla negra.
    requestAnimationFrame(() => {
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

          // ── CapsLock fix ────────────────────────────────────────────────────
          // noVNC en WebView2/Windows tiene lógica interna (_syncModifiers) que
          // cancela el toggle de CapsLock al detectar la discrepancia de estado.
          // Solución: interceptar CapsLock en fase CAPTURE sobre el contenedor
          // padre (antes de que llegue al canvas de noVNC), enviarlo manualmente
          // con sendKey, y detener la propagación para que noVNC no lo procese.
          // Si el usuario presiona CapsLock físicamente antes del sync inicial,
          // marcamos capsWasPressed = true para que syncOnce no envíe un toggle
          // extra que revierte el estado. Sin esta flag, la secuencia:
          //   CapsLock↓ (ON) → CapsLock↓ (OFF) → tecla 'A' → syncOnce ve local=OFF
          //   → manda toggle → remote vuelve a ON  ← bug
          let capsWasPressed = false

          const capsDownHandler = (e: KeyboardEvent) => {
            if (e.code !== 'CapsLock') return
            capsWasPressed = true
            e.preventDefault()
            e.stopPropagation()   // evita que llegue al canvas de noVNC
            try {
              ;(rfb as any).sendKey(0xFFE5, 'CapsLock', true)
              ;(rfb as any).sendKey(0xFFE5, 'CapsLock', false)
            } catch {}
          }
          const capsUpHandler = (e: KeyboardEvent) => {
            if (e.code !== 'CapsLock') return
            e.preventDefault()
            e.stopPropagation()   // ya enviamos el key-up en capsDownHandler
          }
          container.addEventListener('keydown', capsDownHandler, true)
          container.addEventListener('keyup',   capsUpHandler,   true)

          // Auto-sync CapsLock: on the first non-CapsLock keypress detect local
          // state. If local is OFF but remote has it ON, send one toggle to sync.
          // Skipped if the user already physically toggled CapsLock (capsWasPressed),
          // to avoid cancelling their intentional toggles.
          const syncOnce = (e: KeyboardEvent) => {
            if (!capsWasPressed) {
              const localCaps = e.getModifierState('CapsLock')
              if (!localCaps) {
                try {
                  ;(rfb as any).sendKey(0xFFE5, 'CapsLock', true)
                  ;(rfb as any).sendKey(0xFFE5, 'CapsLock', false)
                } catch {}
              }
            }
            ;(canvas as HTMLElement).removeEventListener('keydown', syncOnce as EventListener)
          }
          ;(canvas as HTMLElement).addEventListener('keydown', syncOnce as EventListener, { once: true })

          // Limpiar los handlers de CapsLock cuando noVNC se desconecte
          rfb.addEventListener('disconnect', () => {
            container.removeEventListener('keydown', capsDownHandler, true)
            container.removeEventListener('keyup',   capsUpHandler,   true)
          }, { once: true })
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
    }) // fin requestAnimationFrame (inner)
    }) // fin requestAnimationFrame (outer)
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


  // Efecto unificado: reacciona a cambios en status, sessionInfo e isActive.
  // Cubre todos los casos:
  //   - isActive pasa a true con status 'idle' → inicia VNC
  //   - status pasa a 'connected' con isActive true → conecta RFB
  //   - isActive pasa a true con status ya 'connected' → reconecta RFB
  //   - isActive pasa a false → desconecta WS para ahorrar ancho de banda
  useEffect(() => {
    if (!isActive) {
      if (rfbRef.current) {
        disconnectClean(rfbRef.current)
        rfbRef.current = null
      }
      return
    }
    // isActive es true — iniciar VNC si aún no se ha hecho
    if (status === 'idle') {
      start(resolution)
      return
    }
    // Conectar RFB cuando el backend está listo y el contenedor es visible
    if (status !== 'connected' || !sessionInfo || !canvasContainerRef.current) return
    if (rfbRef.current) return
    connectRFB(canvasContainerRef.current, `ws://127.0.0.1:${sessionInfo.ws_port}`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, sessionInfo, isActive])

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
        onSendKey={(keysym, code) => {
          if (!rfbRef.current) return
          try {
            rfbRef.current.sendKey(keysym, code, true)
            rfbRef.current.sendKey(keysym, code, false)
          } catch {}
        }}
      />

      {/* Estado idle inicial lo ocultamos porque auto-inicia automáticamente */}

      {status === 'starting' && (
        <div className="desktop-loading">
          <div className="desktop-loading-spinner" />
          <span>Conectando escritorio remoto…</span>
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
