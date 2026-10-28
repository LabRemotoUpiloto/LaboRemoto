// features/registros/filtros.ts — filtros de «Prácticas de estudiantes» (Conexiones), sin React (para probarlo).
import type { RegistroIntento } from './registros.service';

export type Periodo = 'hoy' | '7' | '20';
export interface Filtros { busqueda: string; practica: string; estado: string; periodo: Periodo }

export const TEXTO_ESTADO: Record<string, string> = {
  terminada: 'Terminada',
  sin_terminar: 'Sin terminar',
  app_cerrada: 'Cerró la app',
};

/** Días que se le piden al servidor según el período (el servidor guarda 20). */
export const diasDe = (p: Periodo) => (p === 'hoy' ? 1 : Number(p));

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const mismoDia = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Lo que coincide con los filtros, en el orden en que llega (lo más reciente primero). */
export function filtrar(registros: RegistroIntento[], f: Filtros, ahora: number): RegistroIntento[] {
  const q = sinTildes(f.busqueda.trim());
  return registros.filter((r) =>
    (!q || sinTildes(`${r.nombre ?? ''} ${r.usuario}`).includes(q))
    && (!f.practica || r.practica === f.practica)
    && (!f.estado || r.estado === f.estado)
    && (f.periodo !== 'hoy' || mismoDia(new Date(r.fin), new Date(ahora))));
}

/** Las prácticas que aparecen, para el desplegable: id y nombre, ordenadas por nombre. */
export function practicasDe(registros: RegistroIntento[]): { valor: string; etiqueta: string }[] {
  const m = new Map<string, string>();
  for (const r of registros) if (!m.has(r.practica)) m.set(r.practica, r.practicaNombre || r.practica);
  return [...m].map(([valor, etiqueta]) => ({ valor, etiqueta })).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'));
}
