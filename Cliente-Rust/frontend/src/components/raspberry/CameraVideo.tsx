// components/raspberry/CameraVideo.tsx
// Elige cómo mostrar una cámara: WebRTC (baja latencia) si el broker la tiene
// mapeada y funciona en esta red; si no, HLS.
import React, { useState } from 'react'
import HlsPlayer from './HlsPlayer'
import WhepPlayer from './WhepPlayer'

interface Props {
  hlsUrl: string
  /** Path de MediaMTX (`NvrCamera.webrtc`); sin él va directo a HLS. */
  webrtcPath?: string | null
  label?: string
}

// Si WebRTC falló hace poco (red que no deja pasar el puerto del video), las
// demás cámaras y los remontajes van directo a HLS en vez de esperar cada una
// su propio tiempo de espera. Pasado el plazo se vuelve a intentar.
const REINTENTAR_WEBRTC_MS = 2 * 60_000
let ultimoFalloWebRtc = 0
let ultimoMotivo = ''

const CameraVideo: React.FC<Props> = ({ hlsUrl, webrtcPath, label }) => {
  const [usarHls, setUsarHls] = useState(
    () => !webrtcPath || Date.now() - ultimoFalloWebRtc < REINTENTAR_WEBRTC_MS,
  )

  // El modo va en la etiqueta para poder ver de un vistazo si una cámara está
  // en baja latencia (WebRTC) o en el respaldo (HLS, con más retraso). TEMPORAL:
  // en el respaldo también se muestra por qué falló WebRTC, mientras se afina.
  if (usarHls || !webrtcPath) {
    const motivo = webrtcPath && ultimoMotivo ? ` (WebRTC: ${ultimoMotivo})` : ''
    return <HlsPlayer src={hlsUrl} label={`${label ? `${label} · ` : ''}HLS${motivo}`} />
  }

  return (
    <WhepPlayer
      path={webrtcPath}
      label={label ? `${label} · WebRTC` : 'WebRTC'}
      onFail={(motivo) => {
        console.warn(`[camara] WebRTC (${webrtcPath}) no disponible, usando HLS: ${motivo}`)
        ultimoFalloWebRtc = Date.now()
        ultimoMotivo = motivo
        setUsarHls(true)
      }}
    />
  )
}

export default CameraVideo
