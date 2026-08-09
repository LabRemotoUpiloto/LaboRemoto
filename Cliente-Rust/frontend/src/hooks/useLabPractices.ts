// hooks/useLabPractices.ts
// Catálogo externo de prácticas (cmd::integration::lab_practices), solo
// lectura. No hay start/stop de sesión aquí — es un fetch simple con
// refetch manual, a diferencia de useNvrCameras (que sí es una sesión con
// polling).
import { useCallback, useEffect, useRef, useState } from 'react'
import { labPracticesList, type ExternalLabPractice } from '../services/labPractices.service'

export type { ExternalLabPractice }

type Status = 'loading' | 'ready' | 'error'

export function useLabPractices() {
  const [practices, setPractices] = useState<ExternalLabPractice[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const refetch = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const list = await labPracticesList()
      if (!mountedRef.current) return
      setPractices(list)
      setStatus('ready')
    } catch (e: any) {
      if (!mountedRef.current) return
      setError(String(e?.message ?? e))
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void refetch()
    return () => { mountedRef.current = false }
  }, [refetch])

  return { practices, status, error, refetch }
}
