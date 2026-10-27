// features/actividad/useUsoAppReporter.ts — mientras haya sesión, avisa al registro de sesiones que la app está abierta (inicio, un
// latido por minuto y fin), con o sin práctica: así Actividad sabe quién usa la app. Si la app se cierra de golpe no llega el fin:
// el broker la da por terminada al dejar de recibir latidos.
import { useCallback, useEffect, useRef } from 'react';
import { sesionesService } from './sesiones.service';

const LATIDO_MS = 60_000;

// Informativo: un fallo nunca debe molestar a quien usa la app.
const avisar = (e: unknown) => console.warn('[uso de la app] no se pudo reportar:', e);

/** Devuelve `finalizar`, que avisa el fin y espera a que salga: el cierre de sesión la llama antes de revocar el token. */
export function useUsoAppReporter(enabled: boolean) {
  const actual = useRef<string | null>(null);

  const finalizar = useCallback(async () => {
    const id = actual.current;
    actual.current = null;
    if (id) await sesionesService.reportarUsoApp('fin', id).catch(avisar);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const id = `app-${crypto.randomUUID()}`;
    actual.current = id;
    let timer: ReturnType<typeof setInterval> | undefined;
    sesionesService.reportarUsoApp('inicio', id)
      // Un broker sin el registro de la app responde 404: entonces no se insiste con latidos.
      .then(() => { timer = setInterval(() => { sesionesService.reportarUsoApp('latido', id).catch(avisar); }, LATIDO_MS); })
      .catch((e) => { avisar(e); if (actual.current === id) actual.current = null; });
    return () => {
      clearInterval(timer);
      if (actual.current === id) void finalizar();
    };
  }, [enabled, finalizar]);

  return { finalizar };
}
