// features/circuitos/practicas.ts — las prácticas de circuitos. Las sirve el simulador de circuitos (fork de Velxio, servicio aparte)
// a través del backend (cmd/practices/circuitos_api.rs), por su propio camino: cargan aunque la Raspberry no responda.
// Mismo estilo de datos que los módulos de Linux y EV3, para que después pasen a la API de prácticas de la Pi sin cambiar de forma.
import { invoke } from '@tauri-apps/api/core';
import type { Comprobacion } from './comprobaciones';
import type { CableCircuito, Circuito, PiezaCircuito } from './simulador';

export interface ResumenPracticaCircuito {
  id: string;
  order: number;
  title: string;
  difficulty: string;
  estimated_minutes: number;
  objective: string;
}

/** Lo que muestra un paso, en orden (como los bloques de los módulos de Linux). Las imágenes y los videos los sirve el
 *  simulador (GET /api/laboremoto/media/<archivo>). */
export type BloqueCircuito =
  | { type: 'text'; text: string }
  /** Un consejo o una advertencia, con su ícono. */
  | { type: 'tip'; text: string }
  | { type: 'list'; items: string[]; ordered?: boolean }
  | { type: 'image'; file: string; caption?: string }
  | { type: 'video'; file: string; caption?: string };

/** Un paso: el chat lo entrega como tarjeta y se completa cuando se cumplen sus comprobaciones (o con su botón, si es de leer). */
export interface PasoCircuito {
  id: string;
  title: string;
  /** Resumen del paso: lo lee el tutor (y es lo que se muestra si el paso no trae `blocks`). */
  text: string;
  blocks?: BloqueCircuito[];
  /** Ids de `checks` que tienen que estar cumplidas para pasar al siguiente. */
  checks?: string[];
  /** Paso de solo leer: se completa con este botón. */
  button?: string;
}

export interface PracticaCircuito extends ResumenPracticaCircuito {
  /** Primer mensaje del tutor al abrir la práctica. */
  intro: string;
  /** Lo que la persona va haciendo, en orden: el chat los entrega de a uno. */
  steps: PasoCircuito[];
  /** Mensaje del tutor al completar el último paso. */
  outro: string;
  circuit: { components: PiezaCircuito[]; wires: CableCircuito[] };
  checks: Comprobacion[];
  /** Lecturas que se muestran en vivo debajo de las comprobaciones. */
  readings: { type: 'led_current'; led: string; text: string }[];
  /** Nombre de cada pieza para la persona y para el tutor («bat» → «pila de 9 V»). */
  parts: Record<string, string>;
  /** Lo que el tutor del chat debe saber de esta práctica: conceptos, valores esperados, errores típicos, cómo ayudar. */
  tutor_context: string;
}

export const circuitosService = {
  listar: () => invoke<ResumenPracticaCircuito[]>('circuitos_practicas'),
  obtener: (id: string) => invoke<PracticaCircuito>('circuitos_practica', { id }),
};

/** El circuito inicial en la forma que espera el simulador. */
export const circuitoInicial = (p: PracticaCircuito): Circuito => ({ componentes: p.circuit.components, cables: p.circuit.wires });

/** La tarjeta de la categoría si la lista de la Pi no llegó: Circuitos no depende de ella. */
export const CATEGORIA_CIRCUITOS = {
  id: 'circuitos',
  name: 'Circuitos',
  description: 'Prácticas de electrónica y diseño de circuitos',
  icon: 'circuit',
  color: '#8b5cf6',
  practices: [],
};
