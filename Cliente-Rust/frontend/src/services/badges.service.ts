/**
 * services/badges.service.ts
 *
 * Catálogo de insignias de la práctica de Linux + su persistencia. Insignias
 * personales, nunca comparadas entre estudiantes (sin leaderboard) -- ver
 * investigación de diseño de la práctica, §4. Viven en localStorage: no hay
 * necesidad de un backend propio para esto (mismo principio que ya aplica a
 * "insignias nunca puntaje comparado").
 *
 * Única fuente de verdad para el catálogo de rangos -- tanto
 * `ModuleCompleteCelebration` (la anima al ganarla) como la Sala de Trofeos
 * del Perfil (las lista todas, ganadas o no) leen de acá.
 */

import * as React from 'react';

const STORAGE_KEY = 'linux-practice-badges';
/** Nombre del CustomEvent que se dispara al ganar una insignia -- permite que
 * la Sala de Trofeos se actualice en vivo si está montada en otra pestaña de
 * la app en el momento exacto en que se completa un módulo. */
export const BADGE_EARNED_EVENT = 'linux-badge-earned';

export interface RankDef {
  /** Slug estable, no cambia aunque cambie el título mostrado. */
  id: string;
  title: string;
  description: string;
  /**
   * Módulo real de `practicas-linux-api` que la desbloquea. `undefined` =
   * todavía no existe ese módulo en la Pi -- se muestra como "próximamente",
   * nunca como ganable.
   */
  moduleId?: string;
  /** Código corto grabado DENTRO de la medalla (ver MedalIcon) -- liga la
   * insignia a qué práctica puntual se ganó, ej. "M1". */
  code?: string;
}

/** Ranks según §4 de la investigación de diseño -- solo linux-m1 existe hoy. */
export const RANKS: RankDef[] = [
  {
    id: 'acceso-basico',
    title: 'Acceso básico',
    description: '¿Dónde estoy? — identidad, prompt y las 4 piezas de un sistema Linux.',
    moduleId: 'linux-m1',
    code: 'M1',
  },
  {
    id: 'operador',
    title: 'Operador',
    description: 'Explorar archivos, permisos, el editor y las tuberías.',
    code: 'M2-3',
  },
  {
    id: 'administrador-jr',
    title: 'Administrador jr.',
    description: 'Crear, copiar, mover y borrar tu propio espacio de trabajo.',
    code: 'M4',
  },
  {
    id: 'operador-jr',
    title: 'Operador Jr.',
    description: 'Tu primer incidente, resuelto sin andamiaje.',
    code: 'M5',
  },
];

export interface EarnedBadge {
  moduleId: string;
  earnedAt: number;
}

function readStore(): Record<string, EarnedBadge> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, EarnedBadge>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch { /* localStorage no disponible -- la insignia igual se anima esta sesión */ }
}

export function getEarnedBadges(): Record<string, EarnedBadge> {
  return readStore();
}

export function isModuleBadgeEarned(moduleId: string): boolean {
  return moduleId in readStore();
}

/**
 * Marca un módulo como completo. Devuelve `alreadyEarned: true` si ya se
 * había ganado antes (para que el llamador sepa si debe animar la
 * celebración completa o solo confirmar en silencio).
 */
export function markModuleBadgeEarned(moduleId: string): { alreadyEarned: boolean } {
  const store = readStore();
  const alreadyEarned = moduleId in store;
  if (!alreadyEarned) {
    store[moduleId] = { moduleId, earnedAt: Date.now() };
    writeStore(store);
    window.dispatchEvent(new CustomEvent(BADGE_EARNED_EVENT, { detail: { moduleId } }));
  }
  return { alreadyEarned };
}

export function rankForModule(moduleId: string): RankDef | undefined {
  return RANKS.find((r) => r.moduleId === moduleId);
}

/**
 * Insignias ganadas, reactivo: se actualiza solo si se gana una nueva en
 * esta misma pestaña (`BADGE_EARNED_EVENT`) o en otra (evento `storage` del
 * navegador) -- para que la Sala de Trofeos del Perfil no quede desactualizada
 * si el estudiante termina un módulo y después abre el Perfil sin recargar.
 */
export function useEarnedBadges(): Record<string, EarnedBadge> {
  const [badges, setBadges] = React.useState<Record<string, EarnedBadge>>(() => readStore());

  React.useEffect(() => {
    const refresh = () => setBadges(readStore());
    window.addEventListener(BADGE_EARNED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(BADGE_EARNED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return badges;
}
