// utils/registroSesion.ts — pide a la terminal abierta de una sesión su registro actual (sin guardarlo ni cerrar nada), para
// adjuntarlo a la entrega de una práctica en Moodle. La terminal (useTerminalSessionCapture) responde al evento.

/** Buffer crudo de la terminal y datos de la sesión; el backend arma con esto el mismo HTML que el log guardado. */
export interface RegistroSesion {
  sessionId: string;
  user: string;
  host: string;
  port: number;
  startTime: string;
  endTime: string;
  rawContent: string;
}

export const EVENTO_EXPORTAR_REGISTRO = 'app:export-session-log';

/** `null` si la terminal de esa sesión ya no está abierta (o no respondió a tiempo). */
export function pedirRegistroSesion(sessionId: string, esperaMs = 2000): Promise<RegistroSesion | null> {
  return new Promise((resolve) => {
    let listo = false;
    const terminar = (r: RegistroSesion | null) => {
      if (listo) return;
      listo = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => terminar(null), esperaMs);
    window.dispatchEvent(new CustomEvent(EVENTO_EXPORTAR_REGISTRO, { detail: { sessionId, responder: terminar } }));
  });
}
