// features/practicas/ev3/trayectorias/planificador.ts — por dónde pasa el robot al seguir la ruta: poses y puntos para
// dibujarla y animarla. Es el complemento de cinematica.ts (que da grados de motor). Módulo puro.
import { normalizarAngulo } from './cinematica';
import type { Pose, Primitiva, Punto } from './tipos';

/** Donde arranca toda ruta: origen del plano, mirando hacia +X. */
export const POSE_INICIAL_DEFECTO: Pose = { x: 0, y: 0, th: 0 };

/** Segmentos rectos con que se aproxima un arco al dibujarlo: con 24 el ojo no distingue la curva. */
const MUESTRAS_POR_ARCO = 24;

export interface Segmento {
  indice: number;
  primitiva: Primitiva;
  poseInicial: Pose;
  poseFinal: Pose;
  /** Puntos en cm para dibujarlo: 2 para una recta, varios para un arco, 1 para un giro o una pausa. */
  puntos: Punto[];
}

function avanzarPose(pose: Pose, cm: number): Pose {
  const thRad = (pose.th * Math.PI) / 180;
  return { x: pose.x + cm * Math.cos(thRad), y: pose.y + cm * Math.sin(thRad), th: pose.th };
}

function girarPose(pose: Pose, grados: number): Pose {
  return { x: pose.x, y: pose.y, th: normalizarAngulo(pose.th + grados) };
}

/**
 * Pose tras recorrer una `fraccion` (0 a 1) de un arco. El centro del arco queda a 90° a la izquierda de hacia donde
 * mira el robot (con grados negativos, a la derecha: basta invertir el signo del radio); recorrerlo es rotar alrededor
 * de ese centro el vector que va del centro al robot.
 */
export function puntoEnArco(pose: Pose, radioCm: number, grados: number, fraccion: number): Pose {
  const thRad = (pose.th * Math.PI) / 180;
  const recorridoRad = (grados * fraccion * Math.PI) / 180;
  const r = grados >= 0 ? radioCm : -radioCm;
  const cx = pose.x - r * Math.sin(thRad);
  const cy = pose.y + r * Math.cos(thRad);
  const vx = pose.x - cx;
  const vy = pose.y - cy;
  const cos = Math.cos(recorridoRad);
  const sin = Math.sin(recorridoRad);
  return {
    x: cx + vx * cos - vy * sin,
    y: cy + vx * sin + vy * cos,
    th: normalizarAngulo(pose.th + grados * fraccion),
  };
}

/** Simula toda la ruta: por cada primitiva, su pose de inicio y de fin y los puntos para dibujarla. */
export function simularPrimitivas(primitivas: Primitiva[], poseInicial: Pose = POSE_INICIAL_DEFECTO): Segmento[] {
  const segmentos: Segmento[] = [];
  let pose = poseInicial;
  primitivas.forEach((primitiva, indice) => {
    const inicio = pose;
    let puntos: Punto[];
    switch (primitiva.tipo) {
      case 'avanzar':
        pose = avanzarPose(pose, primitiva.cm);
        puntos = [inicio, pose];
        break;
      case 'girar':
        pose = girarPose(pose, primitiva.grados);
        puntos = [inicio];
        break;
      case 'arco': {
        const muestras: Pose[] = [];
        for (let i = 0; i <= MUESTRAS_POR_ARCO; i++) {
          muestras.push(puntoEnArco(inicio, primitiva.radioCm, primitiva.grados, i / MUESTRAS_POR_ARCO));
        }
        pose = muestras[muestras.length - 1];
        puntos = muestras;
        break;
      }
      case 'pausa':
        puntos = [inicio];
        break;
      default:
        throw new Error(`Primitiva desconocida: ${(primitiva as { tipo: string }).tipo}`);
    }
    segmentos.push({ indice, primitiva, poseInicial: inicio, poseFinal: pose, puntos });
  });
  return segmentos;
}

/** Pose al terminar la ruta (la inicial si está vacía). */
export function poseFinal(primitivas: Primitiva[], poseInicial: Pose = POSE_INICIAL_DEFECTO): Pose {
  const segmentos = simularPrimitivas(primitivas, poseInicial);
  return segmentos.length ? segmentos[segmentos.length - 1].poseFinal : poseInicial;
}
