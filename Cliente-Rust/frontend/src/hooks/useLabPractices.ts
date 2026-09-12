// hooks/useLabPractices.ts
// Catálogo de prácticas (cmd::integration::lab_practices) con el binding
// local ya resuelto (`runnable`, ver cmd::practices::lab_connection). Fetch
// simple con refetch manual — el inicio de sesión (setup + SSH) lo maneja
// PracticesPage a través de labPracticesRunSetup/GetRunnable, no este hook.
import { useCallback, useEffect, useRef, useState } from 'react'
import { labPracticesListRunnable, type RunnableLabPractice } from '../services/labPractices.service'

export type { RunnableLabPractice }

type Status = 'loading' | 'ready' | 'error'

export function useLabPractices() {
  const [practices, setPractices] = useState<RunnableLabPractice[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const refetch = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const list = await labPracticesListRunnable()
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
