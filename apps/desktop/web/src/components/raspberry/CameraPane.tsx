// components/raspberry/CameraPane.tsx 
import React, { useEffect, useRef } from 'react' 
import Hls from 'hls.js' 
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
  const videoRef = useRef<HTMLVideoElement>(null) 
  const hlsRef = useRef<Hls | null>(null) 
  const { localPort, status, error, start, stop } = useCameraStream(sessionId) 

  useEffect(() => { 
    if (status !== 'active' || !localPort || !videoRef.current) return 

    const video = videoRef.current 
    const streamUrl = `http://127.0.0.1:${localPort}/cam.m3u8` 

    if (hlsRef.current) { 
      hlsRef.current.destroy() 
      hlsRef.current = null 
    } 

    if (Hls.isSupported()) { 
      const hls = new Hls({ 
        liveSyncDurationCount: 1, 
        liveMaxLatencyDurationCount: 3, 
        enableWorker: false,
        liveBackBufferLength: 0,
        manifestLoadingTimeOut: 10000,
        manifestLoadingMaxRetry: 5,
        levelLoadingTimeOut: 10000,
        fragLoadingTimeOut: 20000,
        lowLatencyMode: true,
        backBufferLength: 0,
      }) 
      hlsRef.current = hls 
      hls.loadSource(streamUrl) 
      hls.attachMedia(video) 
      hls.on(Hls.Events.MANIFEST_PARSED, () => { 
        video.play().catch(() => {}) 
      }) 
      hls.on(Hls.Events.ERROR, (_e, data) => { 
        if (data.fatal && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
        } 
      }) 
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(() => {});
      });
    }

    return () => { 
      hlsRef.current?.destroy() 
      hlsRef.current = null 
    } 
  }, [status, localPort]) 

  useEffect(() => { 
    if (!isActive) { 
      hlsRef.current?.destroy() 
      hlsRef.current = null 
      stop() 
    } 
  }, [isActive]) 

  return ( 
    <div className="camera-pane">

      {/* ── Video (fills panel with object-fit: cover) ── */}
      <video 
        ref={videoRef} 
        style={{ display: status === 'active' ? 'block' : 'none' }} 
        muted 
        playsInline 
        autoPlay 
      />

      {/* ── Idle / Connecting / Error States ── */}
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

      {/* ── Controls Overlay (top gradient) ── */}
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

      {/* ── Live badge overlay (bottom-left when active) ── */}
    </div> 
  ) 
} 

export default CameraPane 
