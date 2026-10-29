// features/practicas/ev3/trayectorias/formato.ts — números del editor como se leen en Colombia (coma decimal).

/** `n` con `decimales` fijos, en es-CO: 12,5. */
export const num = (n: number, decimales = 1): string =>
  n.toLocaleString('es-CO', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

/** Milisegundos como segundos con un decimal: «2,4 s». */
export const segundos = (ms: number): string => `${num(ms / 1000, 1)} s`;
