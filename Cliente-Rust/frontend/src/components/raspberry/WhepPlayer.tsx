// components/raspberry/WhepPlayer.tsx
// Video por WebRTC (WHEP) contra MediaMTX, negociado a través del broker
// (`nvr_whep`). Latencia ~0,5 s frente a los 6-15 s del HLS de Shinobi.
// Si no logra conectar o se cae, avisa con `onFail` para que el contenedor
// pase a HLS.
import React, { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface Props {
  path: string
  label?: string
  onFail: (motivo: string) => void
}

// Sin conexión en este tiempo, se da por fallido (típico: el puerto del video
// no es alcanzable desde esta red).
const CONNECT_TIMEOUT_MS = 6000
// Esperar todos los candidatos ICE evita negociar por trickle (WHEP simple),
// pero sin quedarse esperando por uno que nunca llega.
const ICE_GATHER_TIMEOUT_MS = 2000
// "disconnected" suele recuperarse solo; si dura, se abandona.
const DISCONNECT_GRACE_MS = 4000

// Resumen corto de qué candidatos ICE hubo y cuántos pares se probaron: dice si
// el navegador llegó a intentar TCP y en qué estado quedó cada intento.
async function resumenIce(pc: RTCPeerConnection): Promise<string> {
  const contar = (m: Map<string, number>) => [...m].map(([k, v]) => `${k}×${v}`).join(',') || '-'
  const locales = new Map<string, number>()
  const remotos = new Map<string, number>()
  const pares = new Map<string, number>()
  const cand = (r: any) => `${r.protocol}${r.tcpType ? ':' + r.tcpType : ''}`
  ;(await pc.getStats()).forEach((r: any) => {
    if (r.type === 'local-candidate') locales.set(cand(r), (locales.get(cand(r)) ?? 0) + 1)
    else if (r.type === 'remote-candidate') remotos.set(`${cand(r)}@${r.address ?? r.ip}`, (remotos.get(`${cand(r)}@${r.address ?? r.ip}`) ?? 0) + 1)
    else if (r.type === 'candidate-pair') pares.set(r.state, (pares.get(r.state) ?? 0) + 1)
  })
  return `ice=${pc.iceConnectionState} local=${contar(locales)} remoto=${contar(remotos)} pares=${contar(pares)}`
}

function esperarIce(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const fin = () => { pc.removeEventListener('icegatheringstatechange', cambio); clearTimeout(t); resolve() }
    const cambio = () => { if (pc.iceGatheringState === 'complete') fin() }
    const t = setTimeout(fin, ICE_GATHER_TIMEOUT_MS)
    pc.addEventListener('icegatheringstatechange', cambio)
  })
}

const WhepPlayer: React.FC<Props> = ({ path, label, onFail }) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const onFailRef = useRef(onFail)
  onFailRef.current = onFail

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let cerrado = false
    let fallo = false
    const timers: ReturnType<typeof setTimeout>[] = []
    const pc = new RTCPeerConnection({ iceServers: [] })

    const fallar = async (motivo: string) => {
      if (cerrado || fallo) return
      fallo = true
      let extra = ''
      try { extra = await resumenIce(pc) } catch { /* el diagnóstico es opcional */ }
      onFailRef.current(extra ? `${motivo} [${extra}]` : motivo)
    }

    pc.addTransceiver('video', { direction: 'recvonly' })

    pc.ontrack = (ev) => {
      video.srcObject = ev.streams[0] ?? new MediaStream([ev.track])
      // Sin buffer de reproducción extra: es lo que da el ~0,5 s.
      try { (ev.receiver as any).jitterBufferTarget = 0 } catch { /* no soportado */ }
      try { (ev.receiver as any).playoutDelayHint = 0 } catch { /* no soportado */ }
      video.play().catch(() => {})
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        timers.forEach(clearTimeout)
        timers.length = 0
      } else if (pc.connectionState === 'failed') {
        fallar('conexión WebRTC fallida')
      } else if (pc.connectionState === 'disconnected') {
        timers.push(setTimeout(() => {
          if (pc.connectionState === 'disconnected') fallar('conexión WebRTC perdida')
        }, DISCONNECT_GRACE_MS))
      }
    }

    timers.push(setTimeout(() => {
      if (pc.connectionState !== 'connected') fallar('tiempo agotado conectando WebRTC')
    }, CONNECT_TIMEOUT_MS))

    ;(async () => {
      try {
        await pc.setLocalDescription(await pc.createOffer())
        await esperarIce(pc)
        const sdp = pc.localDescription?.sdp
        if (!sdp) throw new Error('sin oferta SDP')
        const respuesta = await invoke<string>('nvr_whep', { path, sdpOffer: sdp })
        if (cerrado) return
        await pc.setRemoteDescription({ type: 'answer', sdp: respuesta })
      } catch (e) {
        fallar(e instanceof Error ? e.message : String(e))
      }
    })()

    return () => {
      cerrado = true
      timers.forEach(clearTimeout)
      video.srcObject = null
      pc.close()
    }
  }, [path])

  return (
    <div style={{ position: 'relative', background: '#000', width: '100%', height: '100%', borderRadius: 'inherit', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        onPlaying={() => setPlaying(true)}
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: playing ? 'block' : 'none' }}
      />
      {!playing && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: '#aaa', fontSize: 12 }}>
          <div style={{ width: 20, height: 20, border: '2px solid #444', borderTopColor: '#6ee7b7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span>Conectando…</span>
        </div>
      )}
      {label && playing && (
        <div style={{ position: 'absolute', bottom: 6, left: 8, fontSize: 11, color: '#fff', background: 'rgba(0,0,0,.55)', padding: '2px 6px', borderRadius: 4, pointerEvents: 'none' }}>
          {label}
        </div>
      )}
    </div>
  )
}

export default WhepPlayer
