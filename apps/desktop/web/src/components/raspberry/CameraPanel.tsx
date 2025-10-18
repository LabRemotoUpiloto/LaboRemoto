import React, { useEffect, useRef, useState } from 'react'

/**
 * CameraPanel: muestra video local usando getUserMedia.
 * - Botón Iniciar/Detener para controlar la cámara.
 * - Libera el stream al desmontar.
 */
const CameraPanel: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      // Limpiar cuando el componente se desmonta
      try {
        streamRef.current?.getTracks().forEach(t => t.stop())
      } catch {}
      streamRef.current = null
    }
  }, [])

  const start = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setRunning(true)
    } catch (e: any) {
      setError(e?.message || 'No se pudo acceder a la cámara')
      setRunning(false)
    }
  }

  const stop = () => {
    try { streamRef.current?.getTracks().forEach(t => t.stop()) } catch {}
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }
    streamRef.current = null
    setRunning(false)
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:8,height:'100%'}}>
      <header style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <strong>Cámara</strong>
        {running ? (
          <button onClick={stop}>Detener</button>
        ) : (
          <button onClick={start}>Iniciar</button>
        )}
      </header>
      {error && <div style={{color:'var(--danger,#e66)'}}>{error}</div>}
      <div style={{flex:'1 1 auto',minHeight:0,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--background-secondary)'}}>
        <video ref={videoRef} style={{maxWidth:'100%',maxHeight:'100%'}} playsInline muted />
      </div>
    </div>
  )
}

export default CameraPanel
