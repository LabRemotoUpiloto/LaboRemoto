// hooks/usePermissions.ts — punto único de verdad para gating de UI por rol.
//
// 4 niveles derivados de los roles Keycloak que ya existen (`AuthSessionInfo.roles`),
// sin crear ningún rol nuevo: Estudiante es el fallback implícito para cualquier
// usuario sin `semillerista`/`laboratorista`/`admin_lab` — nadie se lo asigna.
import { useAuth } from './useAuth'

export type AccessTier = 'estudiante' | 'operativo' | 'admin'

export function getAccessTier(roles: string[] | undefined): AccessTier {
  if (roles?.includes('admin_lab')) return 'admin'
  if (roles?.includes('laboratorista') || roles?.includes('semillerista')) return 'operativo'
  return 'estudiante'
}

// Mapa page id -> tiers que pueden verla. Consumido por Sidebar (qué mostrar)
// y por HomeContainer (segunda verificación antes de renderizar, cierra el
// hueco de un deep-link directo a un page id restringido).
export const PAGE_ACCESS: Record<string, AccessTier[]> = {
  landing: ['estudiante', 'operativo', 'admin'],
  practices: ['estudiante', 'operativo', 'admin'],
  reservas: ['estudiante', 'operativo', 'admin'],
  themes: ['estudiante', 'operativo', 'admin'],
  connect: ['operativo', 'admin'],
  hosts: ['operativo', 'admin'],
  logs: ['operativo', 'admin'],
  sftp: ['operativo', 'admin'],
  snippets: ['operativo', 'admin'],
  'admin-users': ['admin'],
}

export function useAccessTier(): AccessTier {
  const { user } = useAuth()
  return getAccessTier(user?.roles)
}

/** Ids de página no listados en PAGE_ACCESS quedan abiertos (ej. moodle-test). */
export function canAccessPage(pageId: string, tier: AccessTier): boolean {
  return PAGE_ACCESS[pageId]?.includes(tier) ?? true
}
