// features/registros/intentos.ts — qué intentos de práctica hay abiertos y cómo terminó cada uno, sin React (para probarlo).
// Un intento es una práctica abierta en una pestaña: empieza al abrirla y termina al cerrar la pestaña, al cambiarla por otra
// práctica o al cerrar la app. Cada uno es un archivo en el servidor.
import type { EstadoIntento } from './registros.service';

export interface Intento {
  id: string;
  sessionId: string;
  practica: string;
  nombre: string;
  /** ISO 8601: cuándo se abrió (va en el nombre del archivo). */
  inicio: string;
}

export interface PracticaEnPestana { practiceId: string; nombre: string }

/** Lo mínimo del resultado de validación (ver LinuxValidationResult). */
export interface ResultadoValidacion { passed: boolean; percentage: number }

/** Por ahora solo las prácticas de Linux guardan su registro en el servidor (EV3 y circuitos, no). */
export const guardaRegistro = (practiceId: string) => /^linux(-|$)/.test(practiceId);

/**
 * Compara los intentos que había con las pestañas de práctica abiertas: los que siguen, los que empiezan (con `crear`) y
 * los que terminaron (la pestaña se cerró o ahora tiene otra práctica).
 */
export function compararIntentos(
  previos: Record<string, Intento>,
  abiertas: Record<string, PracticaEnPestana>,
  crear: (sessionId: string, p: PracticaEnPestana) => Intento,
): { actuales: Record<string, Intento>; terminados: Intento[] } {
  const actuales: Record<string, Intento> = {};
  for (const [sessionId, p] of Object.entries(abiertas)) {
    if (!guardaRegistro(p.practiceId)) continue;
    const antes = previos[sessionId];
    actuales[sessionId] = antes && antes.practica === p.practiceId ? antes : crear(sessionId, p);
  }
  const terminados = Object.values(previos).filter((i) => actuales[i.sessionId]?.id !== i.id);
  return { actuales, terminados };
}

/** Aprobada es «terminada»; si no, depende de cómo se fue: cerrando la pestaña o cerrando la app. */
export const estadoDe = (r: ResultadoValidacion | null | undefined, alCerrarApp: boolean): EstadoIntento =>
  r?.passed ? 'terminada' : alCerrarApp ? 'app_cerrada' : 'sin_terminar';

export const notaDe = (r: ResultadoValidacion | null | undefined): number | null =>
  r ? Math.max(0, Math.min(100, Math.round(r.percentage))) : null;

/** Se acaba de aprobar: antes había un resultado sin aprobar. Abrir una práctica que ya estaba aprobada no cuenta. */
export const recienAprobada = (antes: ResultadoValidacion | null | undefined, ahora: ResultadoValidacion | null | undefined) =>
  !!antes && !antes.passed && !!ahora?.passed;
