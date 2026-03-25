// components/raspberry/CameraPane.tsx
import React, { useEffect, useRef } from 'react'
import { useCameraStream } from '../../hooks/useCameraStream'
import './CameraPane.css'

interface Props {
  sessionId: string | null
  isActive?: boolean
}

const CameraIcon = () => (
  <svg viewBox="0 0 44 44" fill="none" width="36" height="36">
    <rect x="1" y="8" width="28" height="28" rx="3" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M29 17l13-5v18l-13-5V17z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
  </svg>
);

const CameraPane: React.FC<Props> = ({ sessionId, isActive = true }) => {
  const imgRef = useRef<HTMLImageElement>(null)
  const { localPort, status, error, start, stop } = useCameraStream(sessionId)

  useEffect(() => {
    if (status !== 'active' || !localPort || !imgRef.current) return

    const img = imgRef.current
    const url = `http://127.0.0.1:${localPort}/stream`

    // El browser maneja el stream MJPEG nativamente — no requiere polling ni HLS.
    // multipart/x-mixed-replace es soportado por Chrome, Firefox, Edge.
    let retryDelay = 500
    const tryConnect = () => {
      img.src = `${url}?t=${Date.now()}`
    }

    img.onload = () => {
      retryDelay = 500  // Reset delay cuando conecta exitosamente
    }

    img.onerror = () => {
      // No limpiar src — mantiene el último frame visible mientras reconecta
      setTimeout(tryConnect, retryDelay)
      retryDelay = Math.min(retryDelay * 2, 5000)  // Backoff: 500 → 1000 → 2000 → 5000ms
    }

    tryConnect()

    return () => {
      img.onerror = null
      img.src = ''
    }
  }, [status, localPort])

  useEffect(() => {
    if (!isActive) {
      if (imgRef.current) { imgRef.current.onerror = null; imgRef.current.src = '' }
      stop()
    }
  }, [isActive])

  return (
    <div className="camera-pane">
      <img
        ref={imgRef}
        style={{
          display: status === 'active' ? 'block' : 'none',
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
        alt=""
      />

      {status !== 'active' && (
        <div className="camera-idle">
          {status === 'connecting' ? (
            <div className="camera-spinner" />
          ) : (
            <CameraIcon />
          )}
          {status === 'idle' && <p>Cámara no iniciada</p>}
          {status === 'connecting' && <p>Conectando stream…</p>}
          {status === 'error' && <p style={{ color: '#f87171', fontSize: 11 }}>{error}</p>}
          {(status === 'idle' || status === 'error') && (
            <button className="cam-btn connect" onClick={start}>
              {status === 'error' ? 'Reintentar' : 'Conectar'}
            </button>
          )}
        </div>
      )}

      {status === 'active' && (
        <div className="camera-controls">
          <div className="camera-status">
            <div className="camera-live-dot" />
            <span>EN VIVO</span>
          </div>
          <button className="cam-btn" onClick={stop} style={{ fontSize: 10, padding: '3px 9px' }}>
            Detener
          </button>
        </div>
      )}
    </div>
  )
}

export default CameraPane
