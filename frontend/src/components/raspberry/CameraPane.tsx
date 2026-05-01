// components/raspberry/CameraPane.tsx
import React, { useState } from 'react'
import HlsPlayer from './HlsPlayer'
import './CameraPane.css'

interface Props {
  streamUrl?: string   // HLS via túnel SSH — http://127.0.0.1:localPort/camId/index.m3u8
  whepUrl?: string     // reservado para futuro WebRTC LAN directo
  label?: string
  camId?: string
  isActive?: boolean
  isExpanded?: boolean
  onToggleExpand?: () => void
}

const CameraPane: React.FC<Props> = ({ streamUrl, label, camId, isActive = true, isExpanded = false, onToggleExpand }) => {
  const [retryKey, setRetryKey] = useState(0)

  if (!streamUrl || !isActive) {
    return (
      <div className={`camera-pane ${isExpanded ? 'camera-pane--expanded' : ''}`}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 6, color: '#64748b', fontSize: 11, textAlign: 'center', padding: '0 16px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="15" height="10" rx="2"/><path d="M17 9l5-2v10l-5-2V9z"/>
          </svg>
          <span style={{ color: '#475569' }}>Sin stream disponible</span>
        </div>
        {camId && <div className="camera-id-badge">{camId}</div>}
      </div>
    )
  }

  return (
    <div className={`camera-pane ${isExpanded ? 'camera-pane--expanded' : ''}`} onDoubleClick={onToggleExpand}>
      <HlsPlayer
        key={retryKey}
        src={streamUrl}
        label={label}
      />
      <div className="camera-controls">
        <div className="camera-status">
          <div className="camera-live-dot" />
          <span>EN VIVO</span>
        </div>
        <button
          onClick={() => setRetryKey(k => k + 1)}
          style={{ fontSize: 10, padding: '2px 8px', background: 'rgba(255,255,255,0.06)', color: '#64748b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, cursor: 'pointer' }}
          title="Reconectar stream"
        >↺</button>
      </div>
      {camId && <div className="camera-id-badge">{camId}</div>}
    </div>
  )
}

export default CameraPane
