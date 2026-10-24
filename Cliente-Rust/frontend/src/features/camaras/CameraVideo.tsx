// features/camaras/CameraVideo.tsx
// Elige cómo mostrar una cámara: WebRTC (baja latencia) si el broker la tiene
// mapeada y funciona en esta red; si no, HLS.
import React, { useEffect, useState } from 'react'
import HlsPlayer from './HlsPlayer'
import WhepPlayer from './WhepPlayer'
import { ESPERA_FALLO_DE_RED_MS, esFalloDeRed, esperaReintentoMs } from './webrtcFallback'

interface Props {
  hlsUrl: string
  /** Path de MediaMTX (`NvrCamera.webrtc`); sin él va directo a HLS. */
  webrtcPath?: string | null
  label?: string
  /** Sin la etiqueta encima del video (Vigilancia muestra nombre y modo debajo). */
  sinEtiqueta?: boolean
  /** Avisa por qué vía se está viendo, para mostrarlo fuera del video. */
  onModo?: (modo: 'WebRTC' | 'HLS') => void
}

// Si WebRTC falló hace poco POR LA RED (no deja pasar el puerto del video), las
// demás cámaras y los remontajes van directo a HLS en vez de esperar cada una
// su propio tiempo de espera. Pasado el plazo se vuelve a intentar. Un fallo de
// UNA cámara (p. ej. no tiene video y MediaMTX responde 404) NO cuenta: solo esa
// cámara usa HLS (antes mandaba a todas a HLS durante 2 minutos).
const REINTENTAR_WEBRTC_MS = ESPERA_FALLO_DE_RED_MS
let ultimoFalloWebRtc = 0
let ultimoMotivo = ''

const CameraVideo: React.FC<Props> = ({ hlsUrl, webrtcPath, label, sinEtiqueta, onModo }) => {
  const [usarHls, setUsarHls] = useState(
    () => !webrtcPath || Date.now() - ultimoFalloWebRtc < REINTENTAR_WEBRTC_MS,
  )
  const [fallos, setFallos] = useState(0) // cuántas veces cayó ESTA cámara a HLS (sube la espera entre reintentos)

  // Desde HLS se vuelve a intentar WebRTC solo: si el corte fue de esta cámara (se le cambió el origen, se reinició…),
  // lo normal es que vuelva a funcionar en seguida; si sigue fallando, la espera se duplica hasta 5 min. Si el fallo fue de
  // la red, se espera el plazo general.
  useEffect(() => {
    if (!usarHls || !webrtcPath) return
    const resta = ultimoFalloWebRtc ? Math.max(0, ultimoFalloWebRtc + REINTENTAR_WEBRTC_MS - Date.now()) : 0
    const t = setTimeout(() => setUsarHls(false), Math.max(esperaReintentoMs(fallos - 1), resta))
    return () => clearTimeout(t)
  }, [usarHls, webrtcPath, fallos])

  const hls = usarHls || !webrtcPath
  useEffect(() => { onModo?.(hls ? 'HLS' : 'WebRTC') }, [hls, onModo])

  // El modo va en la etiqueta para poder ver de un vistazo si una cámara está
  // en baja latencia (WebRTC) o en el respaldo (HLS, con más retraso). TEMPORAL:
  // en el respaldo también se muestra por qué falló WebRTC, mientras se afina.
  if (hls) {
    const motivo = webrtcPath && ultimoMotivo ? ` (WebRTC: ${ultimoMotivo})` : ''
    return <HlsPlayer src={hlsUrl} label={sinEtiqueta ? undefined : `${label ? `${label} por ` : ''}HLS${motivo}`} />
  }

  return (
    <WhepPlayer
      path={webrtcPath!}
      label={sinEtiqueta ? undefined : label ? `${label} por WebRTC` : 'WebRTC'}
      onFail={(motivo, deRed, habiaConectado) => {
        const red = esFalloDeRed(deRed, habiaConectado)
        console.warn(`[camara] WebRTC (${webrtcPath}) no disponible, usando HLS${red ? '' : ' (solo esta cámara)'}: ${motivo}`)
        if (red) {
          ultimoFalloWebRtc = Date.now()
          ultimoMotivo = motivo
        }
        setFallos((n) => n + 1)
        setUsarHls(true)
      }}
    />
  )
}

export default CameraVideo
