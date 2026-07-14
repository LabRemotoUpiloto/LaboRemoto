/**
 * hooks/useAuth.ts — wrapper delgado sobre store/app.ts (Zustand).
 *
 * Mantiene EXACTAMENTE el mismo contrato público que el `useAuth()` original
 * de `contexts/AuthContext.tsx` para que ningún componente consumidor
 * necesite cambiar. La fuente de verdad ahora es el store de Zustand;
 * `AuthContext`/`AuthProvider` quedaron deprecados (ver contexts/AuthContext.tsx).
 */
import { useAppStore } from '../store/app'
import { AuthSessionInfo } from '../services/auth.service'

export interface UseAuthResult {
  user: AuthSessionInfo | null
  isAuthenticated: boolean
  isLoading: boolean
  login: () => Promise<void>
  logout: () => Promise<void>
}

export const useAuth = (): UseAuthResult => {
  const user = useAppStore((s) => s.user)
  const isAuthenticated = useAppStore((s) => s.isAuthenticated)
  const isLoading = useAppStore((s) => s.isLoading)
  const login = useAppStore((s) => s.login)
  const logout = useAppStore((s) => s.logout)

  return { user, isAuthenticated, isLoading, login, logout }
}
