// features/practicas/ev3/repartoAncho.ts — cómo se reparte el ancho de la vista guiada de EV3 entre escenario, cajón,
// riel y guía. Sin React, para poder probarlo.

export const ANCHO_GUIA = { inicial: 400, min: 320, max: 600 };
export const ANCHO_RIEL = 48;
export const ANCHO_REDIMENSIONADOR = 4;
/** Lo mínimo que se le deja al escenario: con menos, la guía se angosta y el cajón pasa a flotar encima. */
export const MIN_ESCENARIO = 420;

export interface Reparto {
  /** Ancho de la guía (0 si está cerrada). */
  guia: number;
  /** Distancia del cajón flotante al borde derecho de la fila: el riel y la guía. */
  derecha: number;
  /** true: el cajón flota sobre el escenario en vez de empujarlo. */
  cajonFlota: boolean;
}

/**
 * Primero se angosta la guía (hasta su mínimo); si aun así el cajón no cabe sin dejar al escenario por debajo de su
 * mínimo, el cajón flota sobre el escenario en vez de empujarlo.
 */
export function repartoAncho(anchoFila: number, anchoGuia: number, conGuia: boolean, anchoCajon: number): Reparto {
  const guia = conGuia
    ? Math.max(ANCHO_GUIA.min, Math.min(anchoGuia, anchoFila - ANCHO_RIEL - ANCHO_REDIMENSIONADOR - MIN_ESCENARIO))
    : 0;
  const derecha = ANCHO_RIEL + (conGuia ? guia + ANCHO_REDIMENSIONADOR : 0);
  const cajonFlota = anchoCajon > 0 && anchoFila - derecha - anchoCajon < MIN_ESCENARIO;
  return { guia, derecha, cajonFlota };
}
