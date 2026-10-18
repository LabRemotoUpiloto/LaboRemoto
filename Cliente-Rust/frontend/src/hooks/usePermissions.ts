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
import { useSyncExternalStore } from 'react'
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
// Debe coincidir con RESUMEN_ROLES en infra/broker-sesiones/sesiones.js.
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
  // Reservas está en pruebas: por ahora la ve todo el mundo menos estudiante (ni en el menú ni abriéndola por id).
  reservas: ROLE_ORDER.filter((r) => r !== 'estudiante'),
  'mis-cursos': EVERYONE,
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

/**
 * Crear, editar y eliminar cámaras (con sus claves): solo el administrador. El broker lo vuelve a exigir con el rol
 * `admin_lab` del token; esto solo decide si se muestra el botón.
 */
export const puedeAdministrarCamaras = (role: EffectiveRole): boolean => role === 'admin_lab'

// ── «Ver como» (solo en desarrollo) ──
// Permite mirar la app con el menú de otro rol (p. ej. probar el tutorial de bienvenida como estudiante). Solo cambia lo que
// se MUESTRA: el servidor sigue validando el token real. En la versión compilada no existe (import.meta.env.DEV es false).
const CLAVE_VER_COMO = 'labo:dev:ver-como'
const oyentesVerComo = new Set<() => void>()

export function rolVerComo(): EffectiveRole | null {
  if (!import.meta.env.DEV) return null
  try {
    const r = localStorage.getItem(CLAVE_VER_COMO) as EffectiveRole | null
    return r && ROLE_ORDER.includes(r) ? r : null
  } catch { return null }
}

export function setRolVerComo(rol: EffectiveRole | null) {
  if (!import.meta.env.DEV) return
  try {
    if (rol) localStorage.setItem(CLAVE_VER_COMO, rol)
    else localStorage.removeItem(CLAVE_VER_COMO)
  } catch { /* sin almacenamiento: se queda el rol real */ }
  oyentesVerComo.forEach((f) => f())
}

const suscribirVerComo = (f: () => void) => { oyentesVerComo.add(f); return () => { oyentesVerComo.delete(f) } }

export function useEffectiveRole(): EffectiveRole {
  const { user } = useAuth()
  const verComo = useSyncExternalStore(suscribirVerComo, rolVerComo)
  return verComo ?? getEffectiveRole(user?.roles)
}

/** Ids de página no listados en PAGE_ACCESS quedan abiertos (ej. moodle-test). */
export function canAccessPage(pageId: string, role: EffectiveRole): boolean {
  return PAGE_ACCESS[pageId]?.includes(role) ?? true
}
