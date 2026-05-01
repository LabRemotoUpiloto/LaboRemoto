// hooks/useCameraStream.ts 
import { useState, useEffect } from 'react' 
import { invoke } from '@tauri-apps/api/core' 

export function useCameraStream(sessionId: string | null) { 
  const [localPort, setLocalPort] = useState<number | null>(null) 
  const [status, setStatus] = useState<'idle' | 'connecting' | 'active' | 'error'>('idle') 
  const [error, setError] = useState<string | null>(null) 

  const start = async () => { 
    if (!sessionId) return 
    setStatus('connecting') 
    setError(null) 
    try { 
      const port = await invoke<number>('stream_start', { 
        sessionId, 
        remotePort: 8888,  // puerto del python http.server en la Pi 
        localPort: 0,       // 0 = el SO asigna un puerto libre 
      }) 
      setLocalPort(port) 
      setStatus('active') 
    } catch (e: any) { 
      setError(String(e)) 
      setStatus('error') 
    } 
  } 

  const stop = async () => { 
    if (!sessionId) return 
    try { 
      await invoke('stream_stop', { sessionId }) 
    } catch {} 
    setLocalPort(null) 
    setStatus('idle') 
  } 

  // Cleanup al desmontar 
  useEffect(() => { 
    return () => { 
      if (sessionId) {
        invoke('stream_stop', { sessionId }).catch(() => {});
      }
    } 
  }, [sessionId]) 

  return { localPort, status, error, start, stop } 
} 
