// features/escritorio/DesktopPane.tsx — Escritorio gráfico remoto via noVNC

import React, { useRef, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useDesktopSession } from './useDesktopSession'
import type { PerfilEscritorio } from '@/features/conexion/ssh.service'
import { EVENTO_DETENER_ESCRITORIO, type DetalleDetenerEscritorio } from '@/features/practicas/linux/escritorioPractica'
import DesktopToolbar from './DesktopToolbar'
import './DesktopPane.css'

// Resolución fija con la que arranca Xvnc en el Pi. No es configurable por
// el usuario: cambiarla en caliente no es posible (ver investigación en
// server.rs — el máximo de framebuffer de Xvnc queda fijado para siempre al
// arrancar el proceso) y no hace falta pedirla, porque `scaleViewport` en
// `connectRFB` ajusta visualmente el canvas al tamaño real del contenedor
// sin importar a qué resolución esté corriendo la X remota.
const DESKTOP_RESOLUTION = '1280x720'

// Tope del portapapeles que se envía al escritorio remoto (caracteres).
const MAX_CLIPBOARD_CHARS = 100_000

// ── Mapa de keysyms X11 para teclas especiales ────────────────────────────────
// Para caracteres imprimibles (e.key.length === 1) el keysym = código Unicode.
// Esto cubre letras, dígitos, puntuación, mayúsculas (Shift+letra) sin caso especial.
const X11_SPECIAL: Record<string, number> = {
  Backspace:    0xFF08,
  Tab:          0xFF09,
  Enter:        0xFF0D,
  Escape:       0xFF1B,
  Delete:       0xFFFF,
  Insert:       0xFF63,
  Home:         0xFF50,
  End:          0xFF57,
  PageUp:       0xFF55,
  PageDown:     0xFF56,
  ArrowLeft:    0xFF51,
  ArrowUp:      0xFF52,
  ArrowRight:   0xFF53,
  ArrowDown:    0xFF54,
  ShiftLeft:    0xFFE1,
  ShiftRight:   0xFFE2,
  ControlLeft:  0xFFE3,
  ControlRight: 0xFFE4,
  AltLeft:      0xFFE9,
  AltRight:     0xFFEA,
  MetaLeft:     0xFFEB,
  MetaRight:    0xFFEC,
  CapsLock:     0xFFE5,
  F1:  0xFFBE, F2:  0xFFBF, F3:  0xFFC0, F4:  0xFFC1,
  F5:  0xFFC2, F6:  0xFFC3, F7:  0xFFC4, F8:  0xFFC5,
  F9:  0xFFC6, F10: 0xFFC7, F11: 0xFFC8, F12: 0xFFC9,
}

function getX11Keysym(e: KeyboardEvent): number {
  if (X11_SPECIAL[e.code]) return X11_SPECIAL[e.code]
  if (e.key.length === 1)   return e.key.charCodeAt(0)   // 'A'=65, 'a'=97, '!'=33 …
  return 0
}

interface Props {
  sessionId: string
  isActive?: boolean
  /** `practica`: escritorio acotado de las prácticas (ver vnc_start). */
  perfil?: PerfilEscritorio
}

const DesktopPane: React.FC<Props> = ({ sessionId, isActive = true, perfil }) => {
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const rfbRef = useRef<any>(null)
  const { status, sessionInfo, error, start, stop } = useDesktopSession(sessionId, perfil)

  // `stop()` deja el status en 'idle' (mismo valor que el estado inicial,
  // antes de arrancar por primera vez) — sin esta bandera, el efecto de
  // auto-inicio no puede distinguir "recién entré a la vista" de "el
  // usuario acaba de apretar Detener a propósito", y reconectaba solo
  // apenas terminaba de desconectar (Detener se sentía como un retry).
  const userStoppedRef = useRef(false)

  // «Ver detalles» del panel de error: final de los logs de la Pi (Xvnc, preparación, panel...).
  const [details, setDetails] = useState<string | null>(null)
  const [detailsBusy, setDetailsBusy] = useState(false)

  // Portapapeles: texto copiado desde el escritorio remoto (sincronización automática)
  const remoteClipboardRef = useRef<string>('')
  // Último texto local enviado al escritorio remoto (evita reenviar lo mismo)
  const lastSentClipboardRef = useRef<string>('')

  // Portapapeles local → escritorio remoto: SOLO cuando el usuario pega (Ctrl+V o Ctrl+Shift+V en la
  // terminal). No se manda al conectar ni al tomar el foco: lo que haya copiado (p. ej. una contraseña) no debe
  // llegar a un escritorio que otros usuarios de la Pi pueden leer sin que el estudiante lo pida. Solo usa refs.
  const syncLocalClipboard = () => {
    if (!rfbRef.current || !navigator.clipboard?.readText) return
    navigator.clipboard.readText().then(text => {
      if (!text || text.length > MAX_CLIPBOARD_CHARS) return
      if (text === lastSentClipboardRef.current || text === remoteClipboardRef.current) return
      lastSentClipboardRef.current = text
      rfbRef.current?.clipboardPasteFrom(text)
    }).catch(() => {})
  }
  // Rastrea el estado de CapsLock en el servidor remoto (null = no sincronizado aún)
  const remoteCapsRef = useRef<boolean | null>(null)

  // ── Manejo de teclado para VNC ───────────────────────────────────────────────
  // Regla: cuando el <canvas> de noVNC tiene foco, noVNC gestiona el teclado solo.
  //        Cuando el foco está en otro elemento (toolbar, etc.), reenviamos manualmente.
  //        CapsLock siempre se intercepta (noVNC no lo sincroniza bien en WebView2).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!rfbRef.current) return

      // No interceptar si el usuario escribe en un campo de texto real
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      const canvas = canvasContainerRef.current?.querySelector('canvas')
      const canvasHasFocus = document.activeElement === canvas

      // Antes de pegar, mandar el portapapeles local al escritorio remoto
      if (e.ctrlKey && e.code === 'KeyV') syncLocalClipboard()

      if (e.code === 'CapsLock') {
        // Siempre interceptar CapsLock independientemente del foco
        // (noVNC lo maneja mal en WebView2: toggle doble o swap de estado)
        e.preventDefault()
        e.stopPropagation()
        if (remoteCapsRef.current === null) remoteCapsRef.current = false
        remoteCapsRef.current = !remoteCapsRef.current
        rfbRef.current.sendKey(0xFFE5, 'CapsLock', true)
        rfbRef.current.sendKey(0xFFE5, 'CapsLock', false)
        return
      }

      // Tab (con o sin Alt): siempre enviar al VNC para cambiar ventanas dentro
      // del escritorio virtual. preventDefault evita que el browser navegue el DOM.
      if (e.code === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        rfbRef.current.sendKey(0xFF09, 'Tab', true)
        return
      }

      // Escape: siempre interceptar sin depender de si el canvas tiene foco.
      // stopPropagation es clave — evita que la tecla siga burbujeando y sea
      // capturada por otro handler de la app (cerrar un modal, cancelar un
      // rename, etc.) en vez de llegar al escritorio remoto.
      if (e.code === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        rfbRef.current.sendKey(0xFF1B, 'Escape', true)
        return
      }

      // Detectar deriva de CapsLock (WebView2 se traga el evento a veces)
      const localCaps = e.getModifierState('CapsLock')
      if (remoteCapsRef.current === null) {
        remoteCapsRef.current = localCaps
        if (localCaps) {
          rfbRef.current.sendKey(0xFFE5, 'CapsLock', true)
          rfbRef.current.sendKey(0xFFE5, 'CapsLock', false)
        }
      } else if (localCaps !== remoteCapsRef.current) {
        remoteCapsRef.current = localCaps
        rfbRef.current.sendKey(0xFFE5, 'CapsLock', true)
        rfbRef.current.sendKey(0xFFE5, 'CapsLock', false)
      }

      // Si el canvas ya tiene foco, noVNC gestiona la tecla — no tocar nada
      // (interceptar aquí causaría doble envío → Shift se cancela solo)
      if (canvasHasFocus) return

      // Canvas sin foco: reenviar manualmente para que las teclas lleguen al VNC
      const keysym = getX11Keysym(e)
      if (keysym) {
        e.preventDefault()
        e.stopPropagation()
        rfbRef.current.sendKey(keysym, e.code, true)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!rfbRef.current) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      if (e.code === 'CapsLock') {
        e.preventDefault()
        e.stopPropagation()
        return
      }

      if (e.code === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        rfbRef.current.sendKey(0xFF09, 'Tab', false)
        return
      }

      if (e.code === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        rfbRef.current.sendKey(0xFF1B, 'Escape', false)
        return
      }

      const canvas = canvasContainerRef.current?.querySelector('canvas')
      const canvasHasFocus = document.activeElement === canvas
      if (canvasHasFocus) return

      const keysym = getX11Keysym(e)
      if (keysym) {
        e.preventDefault()
        e.stopPropagation()
        rfbRef.current.sendKey(keysym, e.code, false)
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('keyup',   handleKeyUp,   true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('keyup',   handleKeyUp,   true)
    }
  }, [])  // mount/unmount del componente

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
        // Prioridad: fluidez sobre nitidez. qualityLevel=9 se probó y volvió
        // el escritorio muy lento — a ese nivel el servidor VNC deja de usar
        // JPEG y codifica casi sin pérdida, que es mucho más caro de CPU para
        // la Pi que el JPEG comprimido. 7 sigue siendo mejor que el 6 original
        // (menos artefactos visibles) sin cruzar ese umbral. compressionLevel
        // bajo (2) = zlib rápido, prioriza velocidad de encode sobre tamaño.
        rfb.qualityLevel = 7
        rfb.compressionLevel = 2
        rfb.viewOnly = false
        rfb.addEventListener('connect', () => {
          const canvas = container.querySelector('canvas')
          if (canvas) (canvas as HTMLElement).focus()
          // El servidor VNC remoto siempre arranca con CapsLock=OFF.
          // Resetear el tracker para que la próxima tecla sincronice el estado.
          remoteCapsRef.current = null
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
      .catch(() => {})
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

  // Reescalado automático del canvas ante CUALQUIER cambio de tamaño del
  // contenedor (splits, toggle de sidebar, aparición de otro panel como la
  // cámara, cambio de vista, resize de ventana...), no solo el resize de
  // ventana. noVNC trae su propio ResizeObserver interno sobre su wrapper
  // (`_screen`), pero no siempre dispara de forma confiable cuando el cambio
  // de tamaño viene de un toggle de visibilidad (display:none → flex al
  // cambiar de vista) o de un layout externo en vez de un resize real de
  // ventana — el mismo tipo de problema que ya resolvimos en la terminal
  // local con un ResizeObserver propio.
  //
  // Reasignar `scaleViewport` (aunque sea al mismo valor) es la vía pública
  // de noVNC para forzar un recálculo síncrono de la escala contra el
  // tamaño ACTUAL del contenedor (ver el setter en rfb.js: internamente
  // llama _updateScale()) — no depende de que su ResizeObserver interno
  // haya disparado correctamente.
  useEffect(() => {
    const container = canvasContainerRef.current
    if (!container || !window.ResizeObserver) return

    let raf = 0
    const observer = new ResizeObserver(() => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        if (rfbRef.current) {
          try { rfbRef.current.scaleViewport = true } catch { /* ignore */ }
        }
      })
    })
    observer.observe(container)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [])

  // Red de seguridad para la escala: si noVNC la calculó mientras el panel aún no tenía su tamaño final (por ejemplo
  // cuando una práctica abre el escritorio y el chat todavía se está acomodando), el escritorio quedaba pequeño y
  // arrimado a un lado aunque después hubiera espacio, porque ya no llegaba ningún cambio de tamaño que lo corrigiera.
  // Mientras se ve, se comprueba cada poco que la imagen llene el panel en al menos un eje; si no, se reescala.
  useEffect(() => {
    if (status !== 'connected' || !isActive) return
    const vuelta = window.setInterval(() => {
      const rfb = rfbRef.current
      const contenedor = canvasContainerRef.current
      const canvas = contenedor?.querySelector('canvas')
      if (!rfb || !contenedor || !canvas) return
      const c = contenedor.getBoundingClientRect()
      const k = canvas.getBoundingClientRect()
      if (c.width < 50 || c.height < 50 || k.width < 1 || k.height < 1) return
      const llena = k.width >= c.width * 0.97 || k.height >= c.height * 0.97
      if (!llena) {
        try { rfb.scaleViewport = true } catch { /* ignore */ }
      }
    }, 1500)
    return () => window.clearInterval(vuelta)
  }, [status, isActive])

  // Only auto-start VNC when the user explicitly navigates to the desktop view
  // Do NOT auto-start on mount — the DesktopPane is always mounted (visibility: hidden)
  // and auto-starting causes port-forward spam when viewing terminal/camera
  // The user must click the "escritorio" toggle button first.


  // Efecto unificado: reacciona a cambios en status, sessionInfo e isActive.
  // Cubre todos los casos:
  //   - isActive pasa a true con status 'idle' → inicia VNC (salvo que el
  //     usuario lo haya detenido a propósito — ver userStoppedRef)
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
    // isActive es true — iniciar VNC si aún no se ha hecho (y no fue un
    // Detener explícito: si lo fue, se queda en 'idle' hasta que el
    // usuario haga click en "Conectar" — ver handleConnect).
    if (status === 'idle') {
      if (!userStoppedRef.current) start(DESKTOP_RESOLUTION)
      return
    }
    // Conectar RFB cuando el backend está listo y el contenedor es visible
    if (status !== 'connected' || !sessionInfo || !canvasContainerRef.current) return
    if (rfbRef.current) return
    connectRFB(canvasContainerRef.current, `ws://127.0.0.1:${sessionInfo.ws_port}`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, sessionInfo, isActive])

  // La práctica pide apagar el escritorio al volver a la terminal (libera la memoria de la Pi). No es un
  // «Detener» del usuario: si después vuelve a la vista Escritorio, arranca solo como siempre.
  useEffect(() => {
    const alPedir = (ev: Event) => {
      if ((ev as CustomEvent<DetalleDetenerEscritorio>).detail?.sessionId !== sessionId) return
      if (rfbRef.current) {
        disconnectClean(rfbRef.current)
        rfbRef.current = null
      }
      void stop()
    }
    document.addEventListener(EVENTO_DETENER_ESCRITORIO, alPedir)
    return () => document.removeEventListener(EVENTO_DETENER_ESCRITORIO, alPedir)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, stop])

  const handleStop = async () => {
    userStoppedRef.current = true
    if (rfbRef.current) {
      disconnectClean(rfbRef.current)
      rfbRef.current = null
    }
    await stop()
  }

  const handleSendAltTab = () => {
    if (!rfbRef.current) return
    rfbRef.current.sendKey(0xFFE9, 'AltLeft', true)   // Alt down
    rfbRef.current.sendKey(0xFF09, 'Tab',     true)   // Tab down
    rfbRef.current.sendKey(0xFF09, 'Tab',     false)  // Tab up
    rfbRef.current.sendKey(0xFFE9, 'AltLeft', false)  // Alt up
  }

  const handleCleanupAll = async () => {
    try {
      const result = await invoke<string>('vnc_cleanup_all', { sessionId })
      console.log('VNC cleanup:', result)
    } catch (e) {
      console.warn('vnc_cleanup_all error:', e)
    }
  }

  const handleDetails = async () => {
    setDetailsBusy(true)
    try {
      setDetails(await invoke<string>('vnc_logs', { sessionId }))
    } catch (e) {
      const message = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e)
      setDetails(`No se pudieron leer los logs: ${message}`)
    } finally {
      setDetailsBusy(false)
    }
  }

  const handleRetry = () => {
    setDetails(null)
    userStoppedRef.current = false
    start(DESKTOP_RESOLUTION)
  }

  return (
    <div className="desktop-pane" style={{ display: isActive ? 'flex' : 'none' }}>
      <DesktopToolbar
        status={status}
        onStop={handleStop}
        onSendAltTab={handleSendAltTab}
        onCleanupAll={handleCleanupAll}
        sessionInfo={sessionInfo}
      />

      {/* idle solo se muestra tras un Detener explícito — la primera vez que
          se entra a la vista, userStoppedRef arranca en false y el efecto de
          arriba auto-inicia sin pasar por acá. */}
      {status === 'idle' && userStoppedRef.current && (
        <div className="desktop-idle">
          <p>Escritorio remoto detenido</p>
          <button onClick={handleRetry}>Conectar</button>
        </div>
      )}

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
          {details && <pre className="desktop-error-details">{details}</pre>}
          <div className="desktop-error-actions">
            <button onClick={handleRetry}>Reintentar</button>
            <button className="desktop-error-secondary" onClick={handleDetails} disabled={detailsBusy}>
              {detailsBusy ? 'Cargando…' : details ? 'Actualizar detalles' : 'Ver detalles'}
            </button>
          </div>
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
