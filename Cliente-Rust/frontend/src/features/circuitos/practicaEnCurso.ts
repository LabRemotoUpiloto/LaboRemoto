// features/circuitos/practicaEnCurso.ts — la práctica de circuitos abierta, compartida entre la vista (que habla con el simulador) y el
// chat (que entrega los pasos). Los pasos viven como mensajes del chat y leen de aquí el estado en vivo de sus comprobaciones.
import { createContext, useContext } from 'react';
import { CHAT_STORAGE_KEY } from '@/features/chat/panel/chatPane.constants';
import type { Resultado } from './comprobaciones';
import type { PasoCircuito, PracticaCircuito } from './practicas';
import type { EstadoSimulador } from './simulador';

export interface PracticaEnCurso {
  practica: PracticaCircuito;
  estado: EstadoSimulador | null;
  /** Resultado de cada comprobación, por su id. */
  resultados: Record<string, Resultado>;
  /** Pasos ya logrados. Quedan logrados aunque después cambie el circuito: el avance de la práctica no retrocede. */
  logrados: Set<string>;
  /** Confirmar un paso de solo leer (su botón). */
  pulsar: (pasoId: string) => void;
}

export const PracticaEnCursoContext = createContext<PracticaEnCurso | null>(null);

export const usePracticaEnCurso = () => useContext(PracticaEnCursoContext);

/** Se cumplen todas las comprobaciones del paso (los pasos de leer no tienen: se logran con su botón). */
export function comprobacionesCumplidas(resultados: Record<string, Resultado>, paso: PasoCircuito): boolean {
  return !!paso.checks?.length && paso.checks.every((id) => resultados[id] === 'bien');
}

/** El paso en el que va el estudiante: el primero sin lograr (los pasos se hacen en orden). */
export function pasoActual(practica: PracticaCircuito, logrados: Set<string>): PasoCircuito | null {
  return practica.steps.find((s) => !logrados.has(s.id)) ?? null;
}

/** Pasos logrados guardados en este equipo. Solo sirven para la práctica ya terminada: una sin terminar empieza de nuevo
 *  cada vez que se abre (ver `reiniciarSiNoTermino`). */
const clave = (practicaId: string) => `circuitos:logrados:${practicaId}`;

export function leerLogrados(practicaId: string): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(clave(practicaId)) ?? '[]');
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function guardarLogrados(practicaId: string, logrados: Set<string>) {
  try { localStorage.setItem(clave(practicaId), JSON.stringify([...logrados])); } catch { /* sin espacio: solo se pierde el retomar */ }
}

/** Práctica terminada en este equipo (todos sus pasos logrados): su ficha lo muestra. */
const claveCompletada = (practicaId: string) => `circuitos:completada:${practicaId}`;

export function marcarCompletada(practicaId: string) {
  try { localStorage.setItem(claveCompletada(practicaId), '1'); } catch { /* sin espacio */ }
}

export function estaCompletada(practicaId: string): boolean {
  try { return localStorage.getItem(claveCompletada(practicaId)) === '1'; } catch { return false; }
}

/** Una práctica que se dejó a medias empieza de cero al volver a abrirla: sin pasos logrados y con el chat vacío (el chat
 *  de circuitos se guarda como `circuito:<id>` en modo ask, ver ChatPane). Se llama antes de montar el chat. */
export function reiniciarSiNoTermino(practicaId: string) {
  if (estaCompletada(practicaId)) return;
  try {
    localStorage.removeItem(clave(practicaId));
    localStorage.removeItem(CHAT_STORAGE_KEY(`circuito:${practicaId}`, 'ask'));
  } catch { /* sin acceso al almacenamiento: no hay nada guardado que retomar */ }
}
