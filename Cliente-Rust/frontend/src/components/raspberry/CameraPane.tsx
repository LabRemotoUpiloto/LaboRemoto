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
  isSwapSource?: boolean
  swapMode?: boolean
  onClick?: () => void
  onDoubleClick?: () => void
}

const CameraPane: React.FC<Props> = ({ streamUrl, label, camId, isActive = true, isExpanded = false, isSwapSource = false, swapMode = false, onClick, onDoubleClick }) => {
  const [retryKey, setRetryKey] = useState(0)

  const borderClass = isSwapSource
    ? 'ring-2 ring-[#f59e0b] ring-offset-2 ring-offset-[var(--background-primary,#111116)]'
    : swapMode
      ? 'ring-1 ring-[color-mix(in_srgb,var(--accent-primary)_30%,transparent)]'
      : ''

  if (!streamUrl || !isActive) {
    return (
      <div className={`camera-pane flex flex-col w-full h-full bg-[var(--background-primary,#111116)] relative overflow-hidden items-center justify-center cursor-pointer ${isExpanded ? 'camera-pane--expanded' : ''} ${borderClass}`} onClick={onClick} onDoubleClick={onDoubleClick}>
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
    <div className={`camera-pane flex flex-col w-full h-full bg-[var(--background-primary,#111116)] relative overflow-hidden items-center justify-center cursor-pointer [&>video]:absolute [&>video]:inset-0 [&>video]:w-full [&>video]:h-full [&>video]:object-contain [&>video]:z-0 ${isExpanded ? 'camera-pane--expanded' : ''} ${borderClass}`} onClick={onClick} onDoubleClick={onDoubleClick}>
      <HlsPlayer
        key={retryKey}
        src={streamUrl}
        label={label}
      />
      {isSwapSource && (
        <div className="absolute inset-0 z-[5] flex items-center justify-center bg-black/40 pointer-events-none">
          <span className="text-[#f59e0b] text-xs font-semibold bg-black/70 px-3 py-1.5 rounded-lg">
            Selecciona otra cámara para intercambiar
          </span>
        </div>
      )}
      <div className="absolute top-0 left-0 right-0 z-[2] flex items-center justify-between py-2 px-2.5 bg-gradient-to-b from-black/70 to-transparent gap-2">
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary,#888)]">
          <div className="w-[7px] h-[7px] rounded-full bg-[#f87171] animate-[cam-pulse_1.5s_ease-in-out_infinite] [@keyframes_cam-pulse]{0%,100%{opacity:1}50%{opacity:0.35}}" />
          <span className="font-semibold text-[#f87171] tracking-[0.5px] uppercase text-[10px]">EN VIVO</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setRetryKey(k => k + 1) }}
          className="text-[10px] py-0.5 px-2 bg-white/5 text-[#64748b] border border-white/10 rounded cursor-pointer hover:bg-[color-mix(in_srgb,var(--accent-primary)_15%,transparent)] hover:text-[var(--text-primary,#ddd)] hover:border-accent transition-all duration-150"
          title="Reconectar stream"
        >↺</button>
      </div>
      {camId && <div className="absolute bottom-2 right-2 bg-black/60 text-white/70 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide z-10">{camId}</div>}
    </div>
  )
}

export default CameraPane
