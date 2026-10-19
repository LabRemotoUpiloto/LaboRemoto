// services/pruebaRendimiento.ts — la prueba de rendimiento en curso, guardada en el equipo.
//
// La prueba tiene que sobrevivir a que el administrador cambie de sección o cierre la app a mitad
// de camino: el inicio, el fin y las muestras se guardan en localStorage. Mientras haya una prueba
// abierta, `useGrabadorPrueba` (montado en App) la sigue grabando aunque la página de Rendimiento no
// esté a la vista; al reabrir la app pide a la Pi lo que falte (la Pi guarda los últimos 30 min).
import { useEffect, useSyncExternalStore } from 'react';
import { rendimientoPi, type MuestraPi } from './rendimiento.service';

export interface PruebaRendimiento {
  inicio: number;
  fin: number | null;
  muestras: MuestraPi[];
}

const CLAVE = 'labo:rendimiento:prueba:v1';
const SONDEO_MS = 2000;
/** Tope de muestras guardadas (~4 h a 2 s): por encima, localStorage se queda sin espacio. */
const MAX_MUESTRAS = 7200;

let actual: PruebaRendimiento | null = leer();
const oyentes = new Set<() => void>();

function leer(): PruebaRendimiento | null {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return null;
    const p = JSON.parse(crudo) as PruebaRendimiento;
    return typeof p?.inicio === 'number' && Array.isArray(p.muestras) ? p : null;
  } catch {
    return null;
  }
}

function guardar(p: PruebaRendimiento | null) {
  actual = p;
  try {
    if (p) localStorage.setItem(CLAVE, JSON.stringify(p));
    else localStorage.removeItem(CLAVE);
  } catch {
    // Sin espacio o sin almacenamiento: la prueba sigue en memoria mientras la app esté abierta.
  }
  oyentes.forEach((o) => o());
}

export const pruebaActual = (): PruebaRendimiento | null => actual;

export function suscribirPrueba(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

export function iniciarPrueba(inicio: number, muestrasPrevias: MuestraPi[] = []) {
  guardar({ inicio, fin: null, muestras: muestrasPrevias.filter((m) => m.t >= inicio) });
}

export function terminarPrueba(fin: number) {
  if (actual && actual.fin == null) guardar({ ...actual, fin });
}

export function descartarPrueba() {
  guardar(null);
}

/** Suma muestras a la prueba abierta: solo las de su tramo, sin repetir y en orden. */
export function agregarMuestras(nuevas: MuestraPi[]) {
  const p = actual;
  if (!p || p.fin != null || nuevas.length === 0) return;
  const ultimo = p.muestras.length ? p.muestras[p.muestras.length - 1].t : -Infinity;
  const utiles = nuevas.filter((m) => m.t >= p.inicio && m.t > ultimo);
  if (utiles.length === 0) return;
  const muestras = p.muestras.concat(utiles);
  guardar({ ...p, muestras: muestras.length > MAX_MUESTRAS ? muestras.slice(muestras.length - MAX_MUESTRAS) : muestras });
}

/** La prueba guardada, como estado de React. */
export function usePrueba(): PruebaRendimiento | null {
  return useSyncExternalStore(suscribirPrueba, pruebaActual, pruebaActual);
}

/**
 * Graba la prueba abierta en segundo plano (se monta una vez, en App). Solo pide datos a la Pi
 * mientras haya una prueba sin terminar; el primer pedido trae lo que falte desde la última muestra.
 */
export function useGrabadorPrueba(habilitado: boolean) {
  const prueba = usePrueba();
  const grabando = habilitado && !!prueba && prueba.fin == null;
  useEffect(() => {
    if (!grabando) return;
    let vivo = true;
    let enVuelo = false;
    const pedir = async () => {
      const p = actual;
      if (enVuelo || !p || p.fin != null) return;
      enVuelo = true;
      try {
        const desde = p.muestras.length ? p.muestras[p.muestras.length - 1].t : p.inicio - 0.001;
        const r = await rendimientoPi(desde);
        if (vivo) agregarMuestras(r.muestras);
      } catch {
        // Sin conexión con la Pi: se reintenta en el próximo ciclo; lo que falte lo trae la Pi después.
      } finally {
        enVuelo = false;
      }
    };
    pedir();
    const id = window.setInterval(pedir, SONDEO_MS);
    return () => { vivo = false; window.clearInterval(id); };
  }, [grabando]);
}
