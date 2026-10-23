// bloqueoTab.ts — en las prácticas la tecla Tab (autocompletar de bash) está desactivada: quien aprende tiene que escribir
// el comando completo para fijarlo, y Tab además hacía que el foco saltara fuera de la terminal (al chat).
//
// Se bloquea en dos puntos (ver useTerminalSshListener): la tecla (para que el navegador no mueva el foco) y los datos que
// salen hacia el servidor (por si el tabulador llega de otro lado: Ctrl+I o texto pegado con tabulaciones).

/** Quita los tabuladores de lo que se enviaría al servidor. */
export function quitarTabs(data: string): string {
  return data.replace(/\t/g, '');
}

/** ¿Es la pulsación de la tecla Tab (con o sin Mayús)? Solo el keydown: soltarla no hace nada. */
export function esPulsacionTab(ev: { type: string; key: string }): boolean {
  return ev.type === 'keydown' && ev.key === 'Tab';
}

/** Cada cuánto como máximo se le recuerda al estudiante que Tab está desactivado. */
export const AVISO_TAB_CADA_MS = 20_000;

/** ¿Toca avisar ahora? `ultimo` es el momento del último aviso (0 si nunca). */
export function tocaAvisarTab(ahora: number, ultimo: number): boolean {
  return ahora - ultimo >= AVISO_TAB_CADA_MS;
}
