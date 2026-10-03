// hooks/usePermissions.ts — punto único de verdad para gating de UI por rol.
//
// Cada persona tiene UN rol efectivo: el primero de ROLE_ORDER presente en
// `AuthSessionInfo.roles` (realm roles de Keycloak). Estudiante es el fallback
// implícito para cualquiera sin rol especial — nadie se lo asigna.
//
// `docente` llega por dos caminos y ambos terminan en `roles`: (1) automático,
// el claim `user_type = "Docente"` que Keycloak toma del directorio LDAP (el
// backend lo agrega a `roles`, ver auth/jwt.rs); (2) manual, el realm role
// `docente` asignado desde Gestión de Usuarios.
import { useAuth } from './useAuth'

export type EffectiveRole =
  | 'admin_lab'
  | 'jefe_laboratorio'
  | 'coordinador_laboratorio'
  | 'laboratorista'
  | 'semillerista'
  | 'docente'
  | 'estudiante'

// Mayor precedencia primero.
export const ROLE_ORDER: EffectiveRole[] = [
  'admin_lab',
  'jefe_laboratorio',
  'coordinador_laboratorio',
  'laboratorista',
  'semillerista',
  'docente',
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
  docente: 'Docente',
  estudiante: 'Estudiante',
}

export function getEffectiveRole(roles: string[] | undefined): EffectiveRole {
  return ASSIGNABLE_ROLES.find((r) => roles?.includes(r)) ?? 'estudiante'
}

const EVERYONE: EffectiveRole[] = ROLE_ORDER
// Jefe, coordinador y laboratorista supervisan (logs, vigilancia) pero ya no
// operan infraestructura: connect/hosts/sftp/snippets son solo de semillerista
// y admin_lab. Lista explícita (no ASSIGNABLE_ROLES): `docente` es asignable
// pero NO es personal del laboratorio, así que no ve vigilancia (cámaras) ni
// administración de usuarios. Los logs sí los ve (ver LOGS más abajo).
const STAFF: EffectiveRole[] = ['admin_lab', 'jefe_laboratorio', 'coordinador_laboratorio', 'laboratorista', 'semillerista']
const TECHNICAL: EffectiveRole[] = ['admin_lab', 'semillerista']
// Logs: el personal y también el docente.
const LOGS: EffectiveRole[] = [...STAFF, 'docente']
// Debe coincidir con RESUMEN_ROLES en infra/nvr-broker/sesiones.js.
const SUPERVISION: EffectiveRole[] = ['admin_lab', 'jefe_laboratorio', 'coordinador_laboratorio', 'laboratorista']

// Jefe, coordinador y laboratorista usan siempre el tema institucional
// (UniPiloto) -- admin_lab es el rol de mayor jerarquía (sin nada por
// encima) y tiene acceso a todo, tema incluido, así que queda afuera de
// esta restricción a propósito (no es lo mismo que SUPERVISION, que sigue
// incluyendo a admin_lab para dashboard/logs/vigilancia).
const INSTITUTIONAL_THEME_ONLY: EffectiveRole[] = ['jefe_laboratorio', 'coordinador_laboratorio', 'laboratorista']

export const usaTemaInstitucional = (role: EffectiveRole) => INSTITUTIONAL_THEME_ONLY.includes(role)

// Mapa page id -> roles que pueden verla. Consumido por Sidebar (qué mostrar)
// y por HomeContainer (segunda verificación antes de renderizar, cierra el
// hueco de un deep-link directo a un page id restringido).
export const PAGE_ACCESS: Record<string, EffectiveRole[]> = {
  landing: EVERYONE,
  practices: EVERYONE,
  reservas: EVERYONE,
  themes: EVERYONE.filter((r) => !usaTemaInstitucional(r)),
  connect: TECHNICAL,
  // Terminal local (botón del sidebar y del header): solo semillerista y admin_lab.
  'local-terminal-new': TECHNICAL,
  hosts: TECHNICAL,
  sftp: TECHNICAL,
  snippets: TECHNICAL,
  logs: LOGS,
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
