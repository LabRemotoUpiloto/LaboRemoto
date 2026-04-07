// components/raspberry/CameraPane.tsx
import React, { useState } from 'react'
import WebRTCPlayer from './WebRTCPlayer'
import './CameraPane.css'

interface Props {
  streamUrl?: string   // conservado por compatibilidad pero ya no se usa
  whepUrl?: string
  label?: string
  camId?: string
  isActive?: boolean
  isExpanded?: boolean
  onToggleExpand?: () => void
}

const CameraPane: React.FC<Props> = ({ whepUrl, label, camId, isActive = true, isExpanded = false, onToggleExpand }) => {
  const [failed, setFailed] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  if (!whepUrl || !isActive) {
    return (
      <div className={`camera-pane ${isExpanded ? 'camera-pane--expanded' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#555', fontSize: 12 }}>
          Sin URL
        </div>
      </div>
    )
  }

  if (failed) {
    return (
      <div className={`camera-pane ${isExpanded ? 'camera-pane--expanded' : ''}`} onDoubleClick={onToggleExpand}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: '#f87171', fontSize: 12 }}>
          <span>WebRTC no disponible</span>
          <button
            onClick={() => { setFailed(false); setRetryKey(k => k + 1) }}
            style={{ fontSize: 11, padding: '4px 12px', background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 6, cursor: 'pointer' }}
          >
            Reintentar
          </button>
        </div>
        {camId && <div className="camera-id-badge">{camId}</div>}
      </div>
    )
  }

  return (
    <div className={`camera-pane ${isExpanded ? 'camera-pane--expanded' : ''}`} onDoubleClick={onToggleExpand}>
      <WebRTCPlayer
        key={retryKey}
        whepUrl={whepUrl}
        label={label}
        onFailed={() => setFailed(true)}
      />
      <div className="camera-controls">
        <div className="camera-status">
          <div className="camera-live-dot" />
          <span>WebRTC</span>
        </div>
      </div>
      {camId && <div className="camera-id-badge">{camId}</div>}
    </div>
  )
}

export default CameraPane
