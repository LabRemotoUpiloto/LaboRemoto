import React, { createContext, useCallback, useContext, useState } from 'react'

type Toast = { id: string; type: 'info' | 'success' | 'error' | 'warn'; message: string }

type ToastContextType = {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id'>, ttl?: number) => void
  remove: (id: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export const ToastProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((t: Omit<Toast, 'id'>, ttl = 4000) => {
    const id = Math.random().toString(36).slice(2, 9)
    const toast: Toast = { id, ...t }
    setToasts(prev => [toast, ...prev])
    if (ttl > 0) setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), ttl)
  }, [])

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.filter(x => x.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, push, remove }}>
      {children}
    </ToastContext.Provider>
  )
}

export const useToasts = () => {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToasts must be used within ToastProvider')
  return ctx
}

export default ToastContext
