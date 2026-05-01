// components/raspberry/CameraGrid.tsx
import React, { useState } from 'react'
import { useCameraGrid, CameraInfo } from '../../hooks/useCameraGrid'
import CameraPane from './CameraPane'
import './CameraGrid.css'

interface Props {
  sessionId: string | null
  isActive?: boolean
}

const CameraIcon = () => (
  <svg viewBox="0 0 44 44" fill="none" width="40" height="40">
    <rect x="1" y="8" width="28" height="28" rx="3" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M29 17l13-5v18l-13-5V17z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
  </svg>
)

const GridIcon = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
    <rect x="1" y="1" width="6" height="6" rx="1" />
    <rect x="9" y="1" width="6" height="6" rx="1" />
    <rect x="1" y="9" width="6" height="6" rx="1" />
    <rect x="9" y="9" width="6" height="6" rx="1" />
  </svg>
)

function getGridCols(count: number): number {
  if (count <= 1) return 1
  if (count <= 4) return 2
  if (count <= 9) return 3
  return Math.ceil(Math.sqrt(count))
}

const CameraGrid: React.FC<Props> = ({ sessionId, isActive = true }) => {
  const { cameras, localPort, piHost, status, error, start, stop } = useCameraGrid(sessionId)
  const [expandedCam, setExpandedCam] = useState<string | null>(null)

  const activeCameras = cameras.filter(c => c.status === 'active')
  const allCameras = cameras
  const cols = getGridCols(activeCameras.length)

  const toggleExpand = (camId: string) => {
    setExpandedCam(prev => prev === camId ? null : camId)
  }

  // Not active / idle state
  if (status !== 'active') {
    return (
      <div className="camera-grid-container">
        <div className="camera-grid-idle">
          {status === 'connecting' ? (
            <div className="camera-grid-spinner" />
          ) : (
            <CameraIcon />
          )}
          {status === 'idle' && <p>Cámaras no iniciadas</p>}
          {status === 'connecting' && <p>Conectando al servidor de cámaras…</p>}
          {status === 'error' && <p style={{ color: '#f87171', fontSize: 11 }}>{error}</p>}
          {(status === 'idle' || status === 'error') && (
            <button className="cam-btn-connect" onClick={start}>
              {status === 'error' ? 'Reintentar' : 'Conectar Cámaras'}
            </button>
          )}
        </div>
      </div>
    )
  }

  // Active but no cameras detected yet
  if (activeCameras.length === 0) {
    return (
      <div className="camera-grid-container">
        <div className="camera-grid-status-bar">
          <div className="cam-count">
            <div className="camera-grid-spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />
            <span>Buscando cámaras… ({allCameras.length} en config)</span>
          </div>
          <button className="cam-btn-grid" onClick={stop}>Detener</button>
        </div>
        <div className="camera-grid-idle">
          {error ? (
            <>
              <p style={{ color: '#f87171', fontSize: 12, textAlign: 'center', maxWidth: 420 }}>{error}</p>
              <button className="cam-btn-connect" style={{ marginTop: 12 }} onClick={start}>Reintentar</button>
            </>
          ) : (
            <>
              <div className="camera-grid-spinner" />
              <p>Esperando cámaras activas…</p>
              {allCameras.filter(c => c.status === 'connecting').length > 0 && (
                <p style={{ fontSize: 10, color: '#888' }}>
                  {allCameras.filter(c => c.status === 'connecting').length} conectando...
                </p>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  // Active with cameras
  return (
    <div className="camera-grid-container">
      {/* Status bar */}
      <div className="camera-grid-status-bar">
        <div className="cam-count">
          <div className="dot-active" />
          <GridIcon />
          <span>{activeCameras.length} cámara{activeCameras.length !== 1 ? 's' : ''} activa{activeCameras.length !== 1 ? 's' : ''}</span>
          {allCameras.filter(c => c.status === 'offline').length > 0 && (
            <span style={{ color: '#f87171' }}>
              · {allCameras.filter(c => c.status === 'offline').length} offline
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {expandedCam && (
            <button className="cam-btn-grid" onClick={() => setExpandedCam(null)}>
              Grid
            </button>
          )}
          <button className="cam-btn-grid" onClick={stop}>Detener</button>
        </div>
      </div>

      {/* Camera grid */}
      <div
        className={`camera-grid ${expandedCam ? 'camera-grid--has-expanded' : ''}`}
        data-cols={cols}
      >
        {activeCameras.map((cam: CameraInfo) => (
          <CameraPane
            key={cam.id}
            streamUrl={`http://127.0.0.1:${localPort}/${cam.id}/index.m3u8`}
            whepUrl={piHost ? `http://${piHost}:8889/${cam.id}/whep` : undefined}
            label={cam.name}
            camId={cam.id}
            isActive={isActive}
            isExpanded={expandedCam === cam.id}
            onToggleExpand={() => toggleExpand(cam.id)}
          />
        ))}
      </div>
    </div>
  )
}

export default CameraGrid
