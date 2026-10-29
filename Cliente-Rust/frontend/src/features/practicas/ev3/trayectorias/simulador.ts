// features/practicas/ev3/trayectorias/simulador.ts — tiempos de la animación: cuánto dura cada primitiva y dónde está
// el robot en cada instante. Módulo puro; el reloj vive en useSimulacion.ts.
//
// Las velocidades son de referencia para que la animación tenga un ritmo razonable: la velocidad real depende de la
// potencia y de la fricción, que no se pueden sacar de un porcentaje.
import { normalizarAngulo } from './cinematica';
import { POSE_INICIAL_DEFECTO, puntoEnArco, simularPrimitivas, type Segmento } from './planificador';
import type { Pose, Primitiva } from './tipos';

export const VELOCIDAD_LINEAL_CM_S = 20;
export const VELOCIDAD_ANGULAR_GRADOS_S = 90;

export interface TramoTemporizado extends Segmento {
  inicioMs: number;
  duracionMs: number;
  finMs: number;
}

/** Duración de una primitiva en la animación. Un arco se temporiza por el ángulo, igual que un giro. */
export function duracionPrimitivaMs(primitiva: Primitiva): number {
  switch (primitiva.tipo) {
    case 'avanzar': return (Math.abs(primitiva.cm) / VELOCIDAD_LINEAL_CM_S) * 1000;
    case 'girar':
    case 'arco': return (Math.abs(primitiva.grados) / VELOCIDAD_ANGULAR_GRADOS_S) * 1000;
    case 'pausa': return primitiva.ms;
    default: throw new Error(`Primitiva desconocida: ${(primitiva as { tipo: string }).tipo}`);
  }
}

/** Cada primitiva con su ventana de tiempo. Se recalcula entera con cada cambio de la ruta: es barato. */
export function construirLineaDeTiempo(primitivas: Primitiva[], poseInicial: Pose = POSE_INICIAL_DEFECTO): TramoTemporizado[] {
  let acumuladoMs = 0;
  return simularPrimitivas(primitivas, poseInicial).map((segmento) => {
    const duracionMs = duracionPrimitivaMs(segmento.primitiva);
    const tramo = { ...segmento, inicioMs: acumuladoMs, duracionMs, finMs: acumuladoMs + duracionMs };
    acumuladoMs += duracionMs;
    return tramo;
  });
}

export function duracionTotalMs(lineaDeTiempo: TramoTemporizado[]): number {
  return lineaDeTiempo.length ? lineaDeTiempo[lineaDeTiempo.length - 1].finMs : 0;
}

/**
 * Pose dentro de un tramo. El giro interpola con el ángulo de la primitiva sin normalizar, para que un giro de 270°
 * vaya por el lado correcto en vez de tomar el atajo de −90°.
 */
function poseEnFraccionDeTramo(tramo: TramoTemporizado, fraccion: number): Pose {
  const { primitiva, poseInicial: p0, poseFinal: p1 } = tramo;
  switch (primitiva.tipo) {
    case 'avanzar': return { x: p0.x + (p1.x - p0.x) * fraccion, y: p0.y + (p1.y - p0.y) * fraccion, th: p0.th };
    case 'girar': return { x: p0.x, y: p0.y, th: normalizarAngulo(p0.th + primitiva.grados * fraccion) };
    case 'arco': return puntoEnArco(p0, primitiva.radioCm, primitiva.grados, fraccion);
    case 'pausa': return { x: p0.x, y: p0.y, th: p0.th };
    default: throw new Error(`Primitiva desconocida: ${(primitiva as { tipo: string }).tipo}`);
  }
}

/** Pose y comando activo en el instante `tMs` (se recorta al rango válido). Ruta vacía: `indiceActivo` es null. */
export function poseEnInstante(
  lineaDeTiempo: TramoTemporizado[],
  tMs: number,
  poseInicial: Pose = POSE_INICIAL_DEFECTO,
): { pose: Pose; indiceActivo: number | null } {
  if (lineaDeTiempo.length === 0) return { pose: poseInicial, indiceActivo: null };
  const t = Math.min(Math.max(tMs, 0), duracionTotalMs(lineaDeTiempo));
  const tramo = lineaDeTiempo.find((item) => t < item.finMs) ?? lineaDeTiempo[lineaDeTiempo.length - 1];
  const fraccion = tramo.duracionMs === 0 ? 1 : (t - tramo.inicioMs) / tramo.duracionMs;
  return { pose: poseEnFraccionDeTramo(tramo, fraccion), indiceActivo: tramo.indice };
}
