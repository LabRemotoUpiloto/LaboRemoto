// components/practicas/linux/ejecutarComando.ts — botón «Ejecutar comando» de un paso.
//
// La tarjeta del paso (BlockRenderer) no conoce la sesión SSH; la terminal (TerminalView) sí. Se
// hablan por este evento: la terminal de esa práctica escribe el comando COMO SI SE TECLEARA, para
// que entre al historial con el que se valida el paso (mandarlo directo por SSH no lo registraría).

export const EVENTO_EJECUTAR_COMANDO = 'practica:ejecutar-comando';

export interface DetalleEjecutarComando {
  practiceId: string;
  comando: string;
}

export function pedirEjecutarComando(practiceId: string, comando: string) {
  window.dispatchEvent(new CustomEvent<DetalleEjecutarComando>(EVENTO_EJECUTAR_COMANDO, { detail: { practiceId, comando } }));
}

/** Lo que se le manda a la terminal: Ctrl+U (borra lo que estuviera a medio escribir), el comando y Enter. */
export const teclasDelComando = (comando: string) => `\x15${comando}\r`;
