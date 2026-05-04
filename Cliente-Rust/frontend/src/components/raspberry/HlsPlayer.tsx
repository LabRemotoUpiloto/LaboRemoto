// components/raspberry/HlsPlayer.tsx
// Player HLS usando hls.js — funciona via túnel SSH TCP (127.0.0.1:localPort)
import React, { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'

interface Props {
  src: string
  label?: string
}

const HlsPlayer: React.FC<Props> = ({ src, label }) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef   = useRef<Hls | null>(null)
  const [state, setState] = useState<'loading' | 'playing' | 'error'>('loading')
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    setState('loading')
    setErrMsg('')

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }

    if (Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: true,
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 3,
        enableWorker: true,
        xhrSetup: (xhr) => { xhr.withCredentials = false },
      })
      hlsRef.current = hls
      hls.loadSource(src)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {})
      })
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          setState('error')
          setErrMsg(data.details ?? 'Error HLS')
        }
      })
      video.onplaying = () => setState('playing')
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      video.play().catch(() => {})
      video.onplaying = () => setState('playing')
      video.onerror = () => { setState('error'); setErrMsg('Error reproduciendo HLS') }
    } else {
      setState('error')
      setErrMsg('HLS no soportado en este navegador')
    }

    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
      video.src = ''
    }
  }, [src])

  return (
    <div style={{ position: 'relative', background: '#000', width: '100%', height: '100%', borderRadius: 'inherit', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: state === 'playing' ? 'block' : 'none' }}
      />
      {state === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: '#aaa', fontSize: 12 }}>
          <div style={{ width: 20, height: 20, border: '2px solid #444', borderTopColor: '#6ee7b7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span>Conectando…</span>
        </div>
      )}
      {state === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: '#f87171', fontSize: 11, padding: '0 16px', textAlign: 'center' }}>
          <span>⚠ Sin señal</span>
          <span style={{ color: '#888', fontSize: 10 }}>{errMsg}</span>
        </div>
      )}
      {label && state === 'playing' && (
        <div style={{
          position: 'absolute', bottom: 6, left: 8,
          fontSize: 11, color: '#fff', background: 'rgba(0,0,0,.55)',
          padding: '2px 6px', borderRadius: 4, pointerEvents: 'none',
        }}>
          {label}
        </div>
      )}
    </div>
  )
}

export default HlsPlayer
