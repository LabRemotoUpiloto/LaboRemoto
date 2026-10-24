// features/usuarios/personas.ts — de las listas de Keycloak a la tabla de Usuarios: UN rol por persona.
// Keycloak permite varios realm roles, pero aquí cada persona tiene su rol efectivo (el de mayor precedencia).
// Cambiarlo asigna el nuevo y quita los demás; «Estudiante» = no tener ninguno de los especiales.
import { ASSIGNABLE_ROLES, ROLE_ORDER, getEffectiveRole, type EffectiveRole } from '@/features/cuenta/usePermissions';
import type { KeycloakUser } from './admin.service';

export interface Persona { user: KeycloakUser; rol: EffectiveRole }

/** Docente según el directorio LDAP (Keycloak lo trae como atributo `postalCode`, el mismo valor que el token
 *  publica como claim `user_type`). Entra con ese rol sin que nadie se lo asigne: aquí no se le puede quitar. */
export function esDocenteDeDirectorio(user: KeycloakUser): boolean {
  const attrs = user.attributes ?? {};
  return ['postalCode', 'user_type'].some((k) => attrs[k]?.some((v) => v.trim().toLowerCase() === 'docente'));
}

export function nombreDe(user: KeycloakUser): string {
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.username;
}

export function inicialesDe(user: KeycloakUser): string {
  const partes = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim().split(/\s+/).filter(Boolean);
  if (partes.length) return partes.slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  return (user.username || user.email || 'U').slice(0, 2).toUpperCase();
}

/** Foto subida desde Perfil: Keycloak la guarda como atributo custom. */
export const fotoDe = (user: KeycloakUser): string | undefined => user.attributes?.avatar?.[0];

/** Una fila por persona con su rol efectivo, ordenadas por privilegio y luego por nombre. */
export function armarPersonas(porRol: Partial<Record<EffectiveRole, KeycloakUser[]>>, todos: KeycloakUser[]): Persona[] {
  const rolPorId = new Map<string, EffectiveRole>();
  for (const r of ASSIGNABLE_ROLES) {
    for (const u of porRol[r] ?? []) {
      const previo = rolPorId.get(u.id);
      rolPorId.set(u.id, previo ? getEffectiveRole([previo, r]) : r);
    }
  }
  // `todos` es el universo; si no llegó, se arma con los de cada rol (sin repetir)
  const universo = todos.length ? todos : Object.values(porRol).flat() as KeycloakUser[];
  const vistos = new Set<string>();
  const lista: Persona[] = [];
  for (const user of universo) {
    if (vistos.has(user.id)) continue;
    vistos.add(user.id);
    lista.push({ user, rol: rolPorId.get(user.id) ?? (esDocenteDeDirectorio(user) ? 'docente' : 'estudiante') });
  }
  return lista.sort((a, b) =>
    ROLE_ORDER.indexOf(a.rol) - ROLE_ORDER.indexOf(b.rol) || nombreDe(a.user).localeCompare(nombreDe(b.user)));
}

/** Filtro por rol ('todos' = sin filtro) y búsqueda por usuario, correo o nombre. */
export function filtrarPersonas(personas: Persona[], rol: EffectiveRole | 'todos', consulta: string): Persona[] {
  const q = consulta.trim().toLowerCase();
  return personas.filter(({ user, rol: r }) =>
    (rol === 'todos' || r === rol)
    && (!q || [user.username, user.email ?? '', nombreDe(user)].some((t) => t.toLowerCase().includes(q))));
}
