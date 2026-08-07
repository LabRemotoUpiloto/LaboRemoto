/**
 * contexts/AuthContext.tsx — DEPRECADO como fuente de verdad.
 *
 * El estado de autenticación vive ahora en `store/app.ts` (Zustand,
 * slice definido en `store/auth.ts`). Este archivo se mantiene únicamente
 * por compatibilidad hacia atrás:
 *
 *  - `AuthProvider` ya no guarda estado propio (sin `useState`); solo
 *    dispara `initAuth()` del store una vez al montar, registrando los
 *    listeners de Tauri y haciendo cleanup al desmontar.
 *  - `useAuth` se re-exporta desde `hooks/useAuth.ts` (el wrapper sobre
 *    el store) para que los imports existentes (`from '../contexts/AuthContext'`)
 *    sigan funcionando sin cambios.
 *
 * TODO(REFACTOR #4 - batch futuro): una vez migrados todos los imports a
 * `hooks/useAuth`, este archivo puede eliminarse y `initAuth()` puede
 * invocarse directamente en `App.tsx` sin necesidad de un Provider.
 */
import React, { useEffect } from 'react'
import { useAppStore } from '../store/app'

export { useAuth } from '../hooks/useAuth'

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initAuth = useAppStore((s) => s.initAuth)

  useEffect(() => {
    const cleanup = initAuth()
    return cleanup
  }, [initAuth])

  return <>{children}</>
}
