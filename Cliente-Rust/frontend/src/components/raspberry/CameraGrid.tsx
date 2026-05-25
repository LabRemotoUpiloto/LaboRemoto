// components/raspberry/CameraGrid.tsx
import React, { useEffect, useState } from 'react'
import { useCameraGrid, CameraInfo } from '../../hooks/useCameraGrid'
import CameraPane from './CameraPane'

interface Props {
  sessionId: string | null
  isActive?: boolean
  /** Inicia port-forward y polling al montar (p. ej. cámaras embebidas en el chat). */
  autoStart?: boolean
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

const CameraGrid: React.FC<Props> = ({ sessionId, isActive = true, autoStart = false }) => {
  const { cameras, localPort, piHost, status, error, start, stop } = useCameraGrid(sessionId)
  const [expandedCam, setExpandedCam] = useState<string | null>(null)

  useEffect(() => {
    if (!autoStart || !sessionId || !isActive) return
    if (status === 'idle') {
      void start()
    }
  }, [autoStart, sessionId, isActive, status, start])

  useEffect(() => {
    if (!autoStart) return
    return () => { void stop() }
  }, [autoStart, stop])

  const activeCameras = cameras.filter(c => c.status === 'active')
  const allCameras = cameras
  const cols = getGridCols(activeCameras.length)

  const toggleExpand = (camId: string) => {
    setExpandedCam(prev => prev === camId ? null : camId)
  }

  // Dynamic grid classes based on cols
  const gridColClasses: Record<number, string> = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3'
  }

  // Not active / idle state
  if (status !== 'active') {
    return (
      <div className="flex flex-col w-full h-full bg-[var(--background-primary,#111116)] relative overflow-hidden">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[var(--text-secondary,#555)] bg-black z-[1]">
          {status === 'connecting' ? (
            <div className="w-6 h-6 border-2 border-white/10 border-t-[var(--accent-primary,#60a5fa)] rounded-full animate-[spin_0.8s_linear_infinite]" />
          ) : (
            <div className="opacity-25 [&>svg]:w-10 [&>svg]:h-10"><CameraIcon /></div>
          )}
          {status === 'idle' && <p className="text-xs m-0 text-[var(--text-secondary,#888)]">Cámaras no iniciadas</p>}
          {status === 'connecting' && <p className="text-xs m-0 text-[var(--text-secondary,#888)]">Conectando al servidor de cámaras…</p>}
          {status === 'error' && <p className="text-[11px] m-0 text-[#f87171]">{error}</p>}
          {(status === 'idle' || status === 'error') && (
            <button 
              className="text-xs text-[var(--accent-primary)] bg-[color-mix(in_srgb,var(--accent-primary)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent-primary)_40%,transparent)] rounded-lg py-2 px-6 cursor-pointer transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--accent-primary)_22%,transparent)]" 
              onClick={start}
            >
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
      <div className="flex flex-col w-full h-full bg-[var(--background-primary,#111116)] relative overflow-hidden">
        <div className="flex items-center justify-between py-1.5 px-2.5 bg-black/60 border-b border-[var(--border-subtle,#2a2a2e)] shrink-0 z-[3]">
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary,#888)]">
            <div className="w-3 h-3 border-[1.5px] border-white/10 border-t-[var(--accent-primary,#60a5fa)] rounded-full animate-[spin_0.8s_linear_infinite]" />
            <span>Buscando cámaras… ({allCameras.length} en config)</span>
          </div>
          <button 
            className="text-[10px] text-[var(--text-secondary,#aaa)] bg-[color-mix(in_srgb,var(--text-secondary)_8%,transparent)] border border-[var(--border-subtle,#333)] rounded-md py-1 px-3 cursor-pointer transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--accent-primary)_15%,transparent)] hover:text-[var(--text-primary,#ddd)] hover:border-[var(--accent-primary)]" 
            onClick={stop}
          >Detener</button>
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[var(--text-secondary,#555)] bg-black z-[1]">
          {error ? (
            <>
              <p className="text-xs text-center max-w-[420px] m-0 text-[#f87171]">{error}</p>
              <button 
                className="mt-3 text-xs text-[var(--accent-primary)] bg-[color-mix(in_srgb,var(--accent-primary)_12%,transparent)] border border-[color-mix(in_srgb,var(--accent-primary)_40%,transparent)] rounded-lg py-2 px-6 cursor-pointer transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--accent-primary)_22%,transparent)]" 
                onClick={start}
              >Reintentar</button>
            </>
          ) : (
            <>
              <div className="w-6 h-6 border-2 border-white/10 border-t-[var(--accent-primary,#60a5fa)] rounded-full animate-[spin_0.8s_linear_infinite]" />
              <p className="text-xs m-0 text-[var(--text-secondary,#888)]">Esperando cámaras activas…</p>
              {allCameras.filter(c => c.status === 'connecting').length > 0 && (
                <p className="text-[10px] text-[#888] m-0">
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
    <div className="flex flex-col w-full h-full bg-[var(--background-primary,#111116)] relative overflow-hidden">
      {/* Status bar */}
      <div className="flex items-center justify-between py-1.5 px-2.5 bg-black/60 border-b border-[var(--border-subtle,#2a2a2e)] shrink-0 z-[3]">
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary,#888)]">
          <div className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-[cam-pulse_1.5s_ease-in-out_infinite] [@keyframes_cam-pulse]{0%,100%{opacity:1}50%{opacity:0.35}}" />
          <GridIcon />
          <span>{activeCameras.length} cámara{activeCameras.length !== 1 ? 's' : ''} activa{activeCameras.length !== 1 ? 's' : ''}</span>
          {allCameras.filter(c => c.status === 'offline').length > 0 && (
            <span className="text-[#f87171]">
              · {allCameras.filter(c => c.status === 'offline').length} offline
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          {expandedCam && (
            <button 
              className="text-[10px] text-[var(--text-secondary,#aaa)] bg-[color-mix(in_srgb,var(--text-secondary)_8%,transparent)] border border-[var(--border-subtle,#333)] rounded-md py-1 px-3 cursor-pointer transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--accent-primary)_15%,transparent)] hover:text-[var(--text-primary,#ddd)] hover:border-[var(--accent-primary)]" 
              onClick={() => setExpandedCam(null)}
            >
              Grid
            </button>
          )}
          <button 
            className="text-[10px] text-[var(--text-secondary,#aaa)] bg-[color-mix(in_srgb,var(--text-secondary)_8%,transparent)] border border-[var(--border-subtle,#333)] rounded-md py-1 px-3 cursor-pointer transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--accent-primary)_15%,transparent)] hover:text-[var(--text-primary,#ddd)] hover:border-[var(--accent-primary)]" 
            onClick={stop}
          >Detener</button>
        </div>
      </div>

      {/* Camera grid */}
      <div
        className={`flex-1 grid gap-[2px] p-[2px] min-h-0 bg-black ${expandedCam ? '[&_.camera-pane]:hidden [&_.camera-pane--expanded]:flex [&_.camera-pane--expanded]:col-span-full [&_.camera-pane--expanded]:row-span-full' : gridColClasses[cols] || 'grid-cols-1'}`}
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
