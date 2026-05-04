// components/raspberry/WebRTCPlayer.tsx
// Reproductor WebRTC usando el protocolo WHEP (RFC 9110).
// La señalización WHEP va por Rust (invoke) para evitar CORS.
// El media RTP funciona si Windows tiene acceso LAN a la Pi.

import React, { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface Props {
  /** URL completa del endpoint WHEP, ej: http://172.16.34.5:8889/cam1/whep */
  whepUrl: string
  /** Muestra un badge con este texto */
  label?: string
  /** Llamado después de MAX_RETRIES fallos — el padre puede caer a MJPEG */
  onFailed?: () => void
}

// 3 reintentos antes de llamar onFailed
const MAX_RETRIES = 3

const WebRTCPlayer: React.FC<Props> = ({ whepUrl, label, onFailed }) => {
  const videoRef   = useRef<HTMLVideoElement>(null)
  const pcRef      = useRef<RTCPeerConnection | null>(null)
  const playingRef = useRef(false)
  const [state, setState] = useState<'connecting' | 'playing' | 'error'>('connecting')
  const [errMsg, setErrMsg] = useState('')
  const [lastErr, setLastErr] = useState('')

  useEffect(() => {
    let cancelled = false
    let retries = 0
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const start = async () => {
      if (cancelled) return
      playingRef.current = false
      setState('connecting')
      if (pcRef.current) { pcRef.current.close(); pcRef.current = null }

      const pc = new RTCPeerConnection({ iceServers: [], iceTransportPolicy: 'all' })
      pcRef.current = pc

      pc.ontrack = (event) => {
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0]
          playingRef.current = true
          setState('playing')
        }
      }

      pc.onconnectionstatechange = () => {
        const s = pc.connectionState
        if (s === 'failed' || s === 'disconnected') {
          if (!cancelled) scheduleRetry('Conexión WebRTC perdida')
        }
        // Una vez que ICE llegó a 'connected', esperamos 5s para el primer frame
        if (s === 'connected') {
          setTimeout(() => {
            if (!cancelled && !playingRef.current) scheduleRetry('Sin video tras conexión ICE')
          }, 5000)
        }
      }

      // Agregar ambos transceivers (video+audio) para que el SDP offer coincida
      // con lo que MediaMTX envía — evita desajustes en ICE
      pc.addTransceiver('video', { direction: 'recvonly' })
      pc.addTransceiver('audio', { direction: 'recvonly' })

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // Esperar gathering (máx 1.5 s — en LAN directo se completa en <200ms)
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') { resolve(); return }
        const onState = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', onState); resolve() } }
        pc.addEventListener('icegatheringstatechange', onState)
        setTimeout(resolve, 1500)
      })

      if (cancelled || !pc.localDescription) return

      try {
        // La señalización WHEP pasa por Rust para evitar el bloqueo CORS del WebView
        const answerSdp = await invoke<string>('whep_exchange', {
          url: whepUrl,
          sdpOffer: pc.localDescription!.sdp,
        })
        if (cancelled) return
        await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })
        // Timeout de seguridad: si ICE no llega a 'connected' en 6s → UDP bloqueado → HLS
        setTimeout(() => {
          if (!cancelled && !playingRef.current && pc.connectionState !== 'connected') {
            scheduleRetry('ICE sin respuesta (UDP bloqueado)')
          }
        }, 6000)
      } catch (err: any) {
        if (!cancelled) scheduleRetry(err?.message ?? 'Error WHEP')
      }
    }

    const scheduleRetry = (msg: string) => {
      console.error(`[WebRTC] retry ${retries+1}/${MAX_RETRIES}: ${msg} — url: ${whepUrl}`)
      setLastErr(msg)
      retries++
      if (retries > MAX_RETRIES) {
        setState('error')
        setErrMsg(msg)
        onFailed?.()
        return
      }
      retryTimer = setTimeout(start, 3000)
    }

    start()

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      if (pcRef.current) { pcRef.current.close(); pcRef.current = null }
      if (videoRef.current) videoRef.current.srcObject = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whepUrl])

  return (
    <div style={{ position: 'relative', background: '#000', width: '100%', height: '100%', borderRadius: 'inherit', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: state === 'playing' ? 'block' : 'none' }}
      />
      {state === 'connecting' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: '#aaa', fontSize: 12 }}>
          <div style={{ width: 20, height: 20, border: '2px solid #444', borderTopColor: '#6ee7b7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span>Conectando WebRTC…</span>
          {lastErr && <span style={{ color: '#f87171', fontSize: 10, maxWidth: 180, textAlign: 'center' }}>{lastErr}</span>}
          <span style={{ color: '#475569', fontSize: 9, maxWidth: 180, textAlign: 'center', wordBreak: 'break-all' }}>{whepUrl}</span>
        </div>
      )}
      {state === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: '#f87171', fontSize: 11, padding: '0 16px', textAlign: 'center' }}>
          <span>⚠ WebRTC falló</span>
          <span style={{ color: '#888' }}>{errMsg}</span>
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

export default WebRTCPlayer
