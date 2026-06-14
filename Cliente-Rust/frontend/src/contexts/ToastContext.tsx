/**
 * ToastContext.tsx — bridge hacia @mantine/notifications.
 *
 * Mantiene la API pública `push({ type, message })` idéntica para que
 * NINGÚN componente existente necesite cambiar su código.
 * Internamente, delega en `notifications.show()` de Mantine.
 */
import React, { createContext, useCallback, useContext } from 'react'
import { notifications } from '@mantine/notifications'

type ToastType = 'info' | 'success' | 'error' | 'warn'

type Toast = { id: string; type: ToastType; message: string }

type ToastContextType = {
  toasts: Toast[]  // mantenido por compatibilidad (siempre vacío con Mantine)
  push: (t: Omit<Toast, 'id'>, ttl?: number) => void
  remove: (id: string) => void
}

const TOAST_COLORS: Record<ToastType, string> = {
  success: 'teal',
  error: 'red',
  warn: 'yellow',
  info: 'blue',
}

const TOAST_TITLES: Record<ToastType, string> = {
  success: 'Éxito',
  error: 'Error',
  warn: 'Advertencia',
  info: 'Información',
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export const ToastProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const push = useCallback((t: Omit<Toast, 'id'>, ttl = 4000) => {
    notifications.show({
      title: TOAST_TITLES[t.type],
      message: t.message,
      color: TOAST_COLORS[t.type],
      autoClose: ttl,
      withBorder: true,
    })
  }, [])

  const remove = useCallback((id: string) => {
    notifications.hide(id)
  }, [])

  return (
    <ToastContext.Provider value={{ toasts: [], push, remove }}>
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