// features/sesion/herramientasSesion.ts — el mosaico de cada sesión de uso normal (no práctica): qué herramientas tiene
// abiertas y dónde. Cada sesión guarda el suyo; al cambiar de sesión se ve el de esa. Vive en memoria mientras la app está
// abierta (al cerrar la sesión se olvida).
import { useSyncExternalStore } from 'react';
import { alternar as alternarEnArbol, abrir as abrirEnArbol, hoja, hojas, quitar, type Nodo } from '@/components/mosaico/arbol';

export type IdHerramienta = 'terminal' | 'chat' | 'camara' | 'escritorio' | 'pines' | 'archivos' | 'comandos';
export const PRINCIPAL: IdHerramienta = 'terminal';

export const TITULOS: Record<IdHerramienta, string> = {
  terminal: 'Terminal', chat: 'Chat', camara: 'Cámara', escritorio: 'Escritorio remoto', pines: 'Pines',
  archivos: 'Archivos del servidor', comandos: 'Comandos',
};

const arboles = new Map<string, Nodo | null>();
let sesionVisible: string | null = null;
let version = 0;
const oyentes = new Set<() => void>();
const avisar = () => { version++; oyentes.forEach((f) => f()); };
const suscribir = (f: () => void) => { oyentes.add(f); return () => { oyentes.delete(f); }; };
const leerVersion = () => version;

/** Una sesión nueva abre solo con la terminal. */
export function arbolDe(sesion: string): Nodo | null {
  if (!arboles.has(sesion)) arboles.set(sesion, hoja(PRINCIPAL));
  return arboles.get(sesion) ?? null;
}

export function fijarArbol(sesion: string, arbol: Nodo | null) {
  arboles.set(sesion, arbol);
  avisar();
}

export const alternar = (sesion: string, id: IdHerramienta) => fijarArbol(sesion, alternarEnArbol(arbolDe(sesion), id, PRINCIPAL));
export const abrir = (sesion: string, id: IdHerramienta) => fijarArbol(sesion, abrirEnArbol(arbolDe(sesion), id, PRINCIPAL));
export const ocultar = (sesion: string, id: IdHerramienta) => fijarArbol(sesion, quitar(arbolDe(sesion), id));

/** La sesión que se está viendo (la marca su vista); `null` fuera de una sesión. */
export function marcarVisible(sesion: string | null) {
  if (sesionVisible === sesion) return;
  sesionVisible = sesion;
  avisar();
}

/** Al cerrar la pestaña de una sesión. */
export function olvidar(sesion: string) {
  arboles.delete(sesion);
  if (sesionVisible === sesion) sesionVisible = null;
  avisar();
}

export function useArbolSesion(sesion: string): Nodo | null {
  useSyncExternalStore(suscribir, leerVersion);
  return arbolDe(sesion);
}

/** Qué está abierto en una sesión (para la barra lateral). */
export function useAbiertas(sesion: string | null): string[] {
  useSyncExternalStore(suscribir, leerVersion);
  return sesion ? hojas(arbolDe(sesion)) : [];
}

export const sesionQueSeVe = () => sesionVisible;

// El recorrido guiado del chat (y otros) piden «abrir el chat»: en una sesión de uso normal es abrir su panel.
if (typeof window !== 'undefined') {
  window.addEventListener('tour:open-chat', () => { if (sesionVisible) abrir(sesionVisible, 'chat'); });
}
