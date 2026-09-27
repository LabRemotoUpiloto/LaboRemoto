// hooks/usePermissions.ts — punto único de verdad para gating de UI por rol.
//
// Cada persona tiene UN rol efectivo: el primero de ROLE_ORDER presente en
// `AuthSessionInfo.roles` (realm roles de Keycloak). Estudiante es el fallback
// implícito para cualquiera sin rol especial — nadie se lo asigna.
import { useAuth } from './useAuth'

export type EffectiveRole =
  | 'admin_lab'
  | 'jefe_laboratorio'
  | 'coordinador_laboratorio'
  | 'laboratorista'
  | 'semillerista'
  | 'estudiante'

// Mayor precedencia primero.
export const ROLE_ORDER: EffectiveRole[] = [
  'admin_lab',
  'jefe_laboratorio',
  'coordinador_laboratorio',
  'laboratorista',
  'semillerista',
  'estudiante',
]

/** Roles que existen como realm role en Keycloak (todos menos el fallback). */
export const ASSIGNABLE_ROLES: EffectiveRole[] = ROLE_ORDER.filter((r) => r !== 'estudiante')

export const ROLE_LABELS: Record<EffectiveRole, string> = {
  admin_lab: 'Administrador',
  jefe_laboratorio: 'Jefe de laboratorio',
  coordinador_laboratorio: 'Coordinador de laboratorio',
  laboratorista: 'Laboratorista',
  semillerista: 'Semillerista',
  estudiante: 'Estudiante',
}

export function getEffectiveRole(roles: string[] | undefined): EffectiveRole {
  return ASSIGNABLE_ROLES.find((r) => roles?.includes(r)) ?? 'estudiante'
}

const EVERYONE: EffectiveRole[] = ROLE_ORDER
// Jefe, coordinador y laboratorista supervisan (logs, vigilancia) pero ya no
// operan infraestructura: connect/hosts/sftp/snippets son solo de semillerista
// y admin_lab.
const STAFF: EffectiveRole[] = ASSIGNABLE_ROLES
const TECHNICAL: EffectiveRole[] = ['admin_lab', 'semillerista']
// Debe coincidir con RESUMEN_ROLES en infra/nvr-broker/sesiones.js.
const SUPERVISION: EffectiveRole[] = ['admin_lab', 'jefe_laboratorio', 'coordinador_laboratorio', 'laboratorista']

/** Los roles administrativos usan siempre el tema institucional (UniPiloto). */
export const usaTemaInstitucional = (role: EffectiveRole) => SUPERVISION.includes(role)

// Mapa page id -> roles que pueden verla. Consumido por Sidebar (qué mostrar)
// y por HomeContainer (segunda verificación antes de renderizar, cierra el
// hueco de un deep-link directo a un page id restringido).
export const PAGE_ACCESS: Record<string, EffectiveRole[]> = {
  landing: EVERYONE,
  practices: EVERYONE,
  reservas: EVERYONE,
  themes: EVERYONE.filter((r) => !usaTemaInstitucional(r)),
  connect: TECHNICAL,
  hosts: TECHNICAL,
  sftp: TECHNICAL,
  snippets: TECHNICAL,
  logs: STAFF,
  vigilancia: STAFF,
  dashboard: SUPERVISION,
  'admin-users': ['admin_lab'],
}

export function useEffectiveRole(): EffectiveRole {
  const { user } = useAuth()
  return getEffectiveRole(user?.roles)
}

/** Ids de página no listados en PAGE_ACCESS quedan abiertos (ej. moodle-test). */
export function canAccessPage(pageId: string, role: EffectiveRole): boolean {
  return PAGE_ACCESS[pageId]?.includes(role) ?? true
}
