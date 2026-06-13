// components/raspberry/CameraPane.tsx
import React, { useState } from 'react'
import HlsPlayer from './HlsPlayer'

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
      <div className={`camera-pane flex flex-col w-full h-full bg-[var(--background-primary,#111116)] relative overflow-hidden items-center justify-center ${isExpanded ? 'camera-pane--expanded' : ''}`} onDoubleClick={onToggleExpand}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 6, color: '#64748b', fontSize: 11, textAlign: 'center', padding: '0 16px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="15" height="10" rx="2"/><path d="M17 9l5-2v10l-5-2V9z"/>
          </svg>
          <span style={{ color: '#475569' }}>Sin stream disponible</span>
        </div>
        {camId && <div className="absolute bottom-2 right-2 bg-black/60 text-white/70 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide z-10">{camId}</div>}
      </div>
    )
  }

  return (
    <div className={`camera-pane flex flex-col w-full h-full bg-[var(--background-primary,#111116)] relative overflow-hidden items-center justify-center [&>video]:absolute [&>video]:inset-0 [&>video]:w-full [&>video]:h-full [&>video]:object-contain [&>video]:z-0 ${isExpanded ? 'camera-pane--expanded' : ''}`} onDoubleClick={onToggleExpand}>
      <HlsPlayer
        key={retryKey}
        src={streamUrl}
        label={label}
      />
      <div className="absolute top-0 left-0 right-0 z-[2] flex items-center justify-between py-2 px-2.5 bg-gradient-to-b from-black/70 to-transparent gap-2">
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary,#888)]">
          <div className="w-[7px] h-[7px] rounded-full bg-[#f87171] animate-[cam-pulse_1.5s_ease-in-out_infinite] [@keyframes_cam-pulse]{0%,100%{opacity:1}50%{opacity:0.35}}" />
          <span className="font-semibold text-[#f87171] tracking-[0.5px] uppercase text-[10px]">EN VIVO</span>
        </div>
        <button
          onClick={() => setRetryKey(k => k + 1)}
          className="text-[10px] py-0.5 px-2 bg-white/5 text-[#64748b] border border-white/10 rounded cursor-pointer hover:bg-[color-mix(in_srgb,var(--accent-primary)_15%,transparent)] hover:text-[var(--text-primary,#ddd)] hover:border-accent transition-all duration-150"
          title="Reconectar stream"
        >↺</button>
      </div>
      {camId && <div className="absolute bottom-2 right-2 bg-black/60 text-white/70 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide z-10">{camId}</div>}
    </div>
  )
}

export default CameraPane
