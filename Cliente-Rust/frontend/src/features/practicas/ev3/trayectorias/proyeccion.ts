// features/practicas/ev3/trayectorias/proyeccion.ts — conversión entre el plano del robot (cm, Y hacia arriba) y el
// lienzo (px, Y hacia abajo). Todo pasa por aquí para que nadie invierta el signo de Y a mano.
import type { Punto } from './tipos';

/** `panXPx`/`panYPx`: píxel donde cae el origen (0,0). `pxPorCm`: zoom. */
export interface Camara {
  panXPx: number;
  panYPx: number;
  pxPorCm: number;
}

export interface Proyeccion {
  mundoAPantalla: (xCm: number, yCm: number) => Punto;
  pantallaAMundo: (xPx: number, yPx: number) => Punto;
}

export function crearProyeccion({ panXPx, panYPx, pxPorCm }: Camara): Proyeccion {
  return {
    mundoAPantalla: (xCm, yCm) => ({ x: panXPx + xCm * pxPorCm, y: panYPx - yCm * pxPorCm }),
    pantallaAMundo: (xPx, yPx) => ({ x: (xPx - panXPx) / pxPorCm, y: -(yPx - panYPx) / pxPorCm }),
  };
}

/** Zoom inicial: 10 px por cada cm. */
export const PX_POR_CM_DEFECTO = 10;
