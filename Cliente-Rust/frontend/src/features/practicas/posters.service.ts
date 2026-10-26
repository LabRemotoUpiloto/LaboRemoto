/**
 * features/practicas/posters.service.ts
 *
 * Catálogo de "pósters premio" ganados en la práctica de Linux + su
 * persistencia. Mismo principio que badges.service.ts (colección personal,
 * en localStorage, nunca comparada entre estudiantes) pero para un
 * coleccionable distinto: una imagen real que el estudiante puede ver y
 * descargar cuando quiera, no una medalla de rango. Vive en la misma Sala
 * de Trofeos del Perfil, en su propia sección.
 */

import * as React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { linuxGetMedia } from './linuxPractice.service';

const STORAGE_KEY = 'linux-practice-posters';
/** Nombre del CustomEvent que se dispara al desbloquear un póster -- mismo
 * patrón que BADGE_EARNED_EVENT, para que la Sala de Trofeos se actualice en
 * vivo si está montada en otra pestaña en el momento exacto en que se
 * completa el módulo. */
const POSTER_UNLOCKED_EVENT = 'linux-poster-unlocked';

export interface PosterDef {
  /** Slug estable. */
  id: string;
  /** Módulo real de `practicas-linux-api` que lo desbloquea al completarse al 100%. */
  moduleId: string;
  /** Id de práctica para linuxGetMedia -- hoy siempre igual a moduleId. */
  practiceId: string;
  /** Ruta del archivo dentro de `content/<practiceId>/media/`. */
  mediaPath: string;
  title: string;
  description: string;
}

/**
 * Catálogo: un póster por módulo. El del M1 es la chuleta general; los demás son la chuleta de los comandos de
 * cada módulo (generadas con el estilo de los diagramas de la práctica). Las imágenes viven en la Pi, en
 * `content/<practiceId>/media/diagrams/`, como el resto de los diagramas.
 */
export const POSTERS: PosterDef[] = [
  {
    id: 'm1-cheatsheet',
    moduleId: 'linux-m1',
    practiceId: 'linux-m1',
    mediaPath: 'diagrams/cheatsheet_bonus.png',
    title: 'Chuleta completa de comandos',
    description: 'De principiante a avanzado — guardala para cuando la necesites.',
  },
  {
    id: 'm2-chuleta',
    moduleId: 'linux-m2',
    practiceId: 'linux-m2',
    mediaPath: 'diagrams/chuleta-m2.png',
    title: 'Chuleta: navegación y archivos',
    description: 'pwd, cd, ls, touch y las rutas en una sola hoja.',
  },
  {
    id: 'm3-chuleta',
    moduleId: 'linux-permisos',
    practiceId: 'linux-permisos',
    mediaPath: 'diagrams/chuleta-m3.png',
    title: 'Chuleta: permisos',
    description: 'Cómo leer -rwxr-xr-- y cambiarlo con chmod.',
  },
  {
    id: 'm4-chuleta',
    moduleId: 'linux-m3',
    practiceId: 'linux-m3',
    mediaPath: 'diagrams/chuleta-m4.png',
    title: 'Chuleta: nano y tuberías',
    description: 'Los atajos de nano, wc y cómo encadenar comandos con |.',
  },
  {
    id: 'm5-chuleta',
    moduleId: 'linux-archivos',
    practiceId: 'linux-archivos',
    mediaPath: 'diagrams/chuleta-m5.png',
    title: 'Chuleta: tu espacio de trabajo',
    description: 'Crear, copiar, mover, renombrar y borrar sin perder nada.',
  },
  {
    id: 'm6-chuleta',
    moduleId: 'linux-programa',
    practiceId: 'linux-programa',
    mediaPath: 'diagrams/chuleta-m6.png',
    title: 'Chuleta: tu primer programa',
    description: 'Un script de bash de principio a fin, y las dos formas de ejecutarlo.',
  },
  {
    id: 'm7-chuleta',
    moduleId: 'linux-incidente',
    practiceId: 'linux-incidente',
    mediaPath: 'diagrams/chuleta-m7.png',
    title: 'Chuleta: resolver un incidente',
    description: 'Un método en 5 pasos y qué hacer con cada mensaje de error.',
  },
];

export function posterForModule(moduleId: string): PosterDef | undefined {
  return POSTERS.find((p) => p.moduleId === moduleId);
}

export interface UnlockedPoster {
  posterId: string;
  unlockedAt: number;
}

function readStore(): Record<string, UnlockedPoster> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, UnlockedPoster>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch { /* localStorage no disponible -- el premio igual se anima esta sesión */ }
}

/**
 * Marca un póster como desbloqueado. Devuelve `alreadyUnlocked: true` si ya
 * se había desbloqueado antes (para que el llamador sepa si debe animar la
 * celebración completa o solo confirmar en silencio) -- mismo contrato que
 * `markModuleBadgeEarned`.
 */
export function markPosterUnlocked(posterId: string): { alreadyUnlocked: boolean } {
  const store = readStore();
  const alreadyUnlocked = posterId in store;
  if (!alreadyUnlocked) {
    store[posterId] = { posterId, unlockedAt: Date.now() };
    writeStore(store);
    window.dispatchEvent(new CustomEvent(POSTER_UNLOCKED_EVENT, { detail: { posterId } }));
  }
  return { alreadyUnlocked };
}

/**
 * Pósters desbloqueados, reactivo: se actualiza solo si se gana uno nuevo en
 * esta misma pestaña o en otra (evento `storage`) -- para que la Sala de
 * Trofeos no quede desactualizada si el estudiante completa el módulo y
 * después abre el Perfil sin recargar.
 */
/**
 * Baja el póster (vía el mismo túnel/caché que ya usa el bloque de media en
 * el chat, ver linuxPractice.service.ts) y abre el diálogo nativo de
 * "Guardar como" para que el estudiante elija dónde ponerlo en su disco.
 * Devuelve la ruta elegida, o `null` si el estudiante canceló el diálogo.
 */
export async function downloadPoster(poster: PosterDef): Promise<string | null> {
  const media = await linuxGetMedia(poster.practiceId, poster.mediaPath);
  try {
    return await invoke<string>('save_image_base64', {
      defaultName: poster.title.replace(/[^\w\- ]+/g, '').trim() || poster.id,
      mime: media.mime,
      base64Data: media.base64,
    });
  } catch (e: any) {
    // El usuario cancelando el diálogo nativo llega como error -- no es una falla real.
    if (e?.message?.includes('cancelada')) return null;
    throw e;
  }
}

export function useUnlockedPosters(): Record<string, UnlockedPoster> {
  const [posters, setPosters] = React.useState<Record<string, UnlockedPoster>>(() => readStore());

  React.useEffect(() => {
    const refresh = () => setPosters(readStore());
    window.addEventListener(POSTER_UNLOCKED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(POSTER_UNLOCKED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return posters;
}
