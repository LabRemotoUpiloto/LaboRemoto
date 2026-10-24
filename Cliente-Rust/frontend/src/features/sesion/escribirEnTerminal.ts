// features/sesion/escribirEnTerminal.ts — mandar un comando a la terminal de una sesión desde afuera (panel Comandos, chat).
// La terminal (TerminalView) lo escribe COMO SI SE TECLEARA: entra al historial de comandos igual que lo escrito a mano.
import { teclasDelComando } from '@/features/practicas/linux/ejecutarComando';

export const EVENTO_ESCRIBIR = 'sesion:escribir-en-terminal';

export interface DetalleEscribir {
  sessionId: string;
  /** Las teclas tal cual (con `\r` si se ejecuta). */
  teclas: string;
}

/** Ejecutar: borra lo que hubiera a medio escribir, escribe el comando y Enter. */
export function ejecutarEnTerminal(sessionId: string, comando: string) {
  window.dispatchEvent(new CustomEvent<DetalleEscribir>(EVENTO_ESCRIBIR, { detail: { sessionId, teclas: teclasDelComando(comando) } }));
}

/** Pegar: lo deja escrito, sin Enter, para revisarlo antes. */
export function pegarEnTerminal(sessionId: string, comando: string) {
  window.dispatchEvent(new CustomEvent<DetalleEscribir>(EVENTO_ESCRIBIR, { detail: { sessionId, teclas: `\x15${comando}` } }));
}
