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
      // Túnel SSH + streams RTSP de cámaras Reolink: el modo low-latency es
      // demasiado estricto con timestamps de audio y dispara audioTrackLoadError
      // fatales. Buffer un poco más generoso + auto-recovery de errores no fatales.
      const hls = new Hls({
        lowLatencyMode: false,
        // liveMaxLatencyDurationCount alto (era 10 = hasta 20s con segmentos
        // de 2s) es lo que hacía sentir el PTZ con delay: hls.js tolera
        // quedarse muy atrás del vivo antes de ponerse al día. Bajado a un
        // rango que sigue absorbiendo jitter de red sin acumular tanto
        // atraso, más un playback rate variable para alcanzar el vivo sin
        // saltos bruscos quando se atrasa.
        liveSyncDurationCount: 2,
        liveMaxLatencyDurationCount: 4,
        maxLiveSyncPlaybackRate: 1.3,
        enableWorker: true,
        manifestLoadingMaxRetry: 6,
        manifestLoadingRetryDelay: 500,
        levelLoadingMaxRetry: 6,
        levelLoadingRetryDelay: 500,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 500,
        xhrSetup: (xhr) => { xhr.withCredentials = false },
      })
      hlsRef.current = hls
      hls.loadSource(src)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {})
      })

      let recoverAttempts = 0
      hls.on(Hls.Events.ERROR, (_e, data) => {
        // El video va muted: errores de la pista de audio se ignoran para
        // que el video siga reproduciéndose. La cam03 (Reolink) tiene audio
        // AAC con timestamps inestables que rompen al reproductor.
        const audioOnly =
          data.details === Hls.ErrorDetails.AUDIO_TRACK_LOAD_ERROR ||
          data.details === Hls.ErrorDetails.AUDIO_TRACK_LOAD_TIMEOUT ||
          (typeof data.details === 'string' && data.details.toLowerCase().includes('audio'))

        if (audioOnly) {
          // No-op: hls.js seguirá reproduciendo solo el video.
          return
        }

        if (!data.fatal) return

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && recoverAttempts < 3) {
          recoverAttempts++
          try { hls.startLoad() } catch { /* noop */ }
          return
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recoverAttempts < 3) {
          recoverAttempts++
          try { hls.recoverMediaError() } catch { /* noop */ }
          return
        }

        setState('error')
        setErrMsg(data.details ?? 'Error HLS')
      })
      video.onplaying = () => { setState('playing'); recoverAttempts = 0 }
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      video.play().catch(() => {})
      video.onplaying = () => setState('playing')
      video.onerror = () => { setState('error'); setErrMsg('Error reproduciendo HLS') }
    } else {
      // Diagnostico en el propio mensaje de error (no solo consola) porque en
      // el build de produccion de Tauri no siempre hay devtools a mano --
      // esto es lo que se vio en Linux/WebKitGTK con "no soportado": hace
      // falta saber si falta MediaSource del todo o si existe pero rechaza
      // el codec H264 especifico que usan las camaras.
      const hasMediaSource = typeof window !== 'undefined' && ('MediaSource' in window || 'WebKitMediaSource' in window)
      const h264Supported = hasMediaSource && typeof MediaSource !== 'undefined' && typeof MediaSource.isTypeSupported === 'function'
        ? MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E"')
        : false
      const diag = `MediaSource=${hasMediaSource} h264=${h264Supported}`
      console.error('[HlsPlayer] Hls.isSupported()=false —', diag)
      setState('error')
      setErrMsg(`HLS no soportado (${diag})`)
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
