// pages/rendimiento/registros.ts — cuentas de los registros del panel de Rendimiento (sin React).
import type { EventoSsh, RegistroApi, TipoEventoSsh } from '../../services/rendimiento.service';

export type Gravedad = 'bueno' | 'neutro' | 'alerta' | 'critico';

/** Cómo se lee cada evento de SSH en el panel. */
export const EVENTOS_SSH: Record<TipoEventoSsh, { texto: string; gravedad: Gravedad }> = {
  entrada: { texto: 'Entró', gravedad: 'bueno' },
  salida: { texto: 'Salió', gravedad: 'neutro' },
  clave_incorrecta: { texto: 'Contraseña incorrecta', gravedad: 'alerta' },
  usuario_inexistente: { texto: 'Usuario que no existe', gravedad: 'alerta' },
  cerrada_sin_entrar: { texto: 'Se fue sin terminar de entrar', gravedad: 'alerta' },
  // sshd descarta conexiones cuando hay demasiadas a medio abrir (MaxStartups).
  rechazada_por_exceso: { texto: 'Rechazada: demasiadas a la vez', gravedad: 'critico' },
  cortada: { texto: 'Cortada al conectar', gravedad: 'critico' },
  tiempo_agotado: { texto: 'Tardó demasiado en entrar', gravedad: 'critico' },
};

/** Una petición es un problema si falló, respondió con error o tardó más de un segundo. */
export const peticionConProblema = (r: RegistroApi): boolean => r.estado === 0 || r.estado >= 400 || r.ms > 1000;

export const eventoConProblema = (e: EventoSsh): boolean => {
  const g = EVENTOS_SSH[e.tipo]?.gravedad;
  return g === 'alerta' || g === 'critico';
};

/**
 * Suma registros nuevos a los que ya hay, sin repetir y en orden, y se queda con los últimos `maximo`.
 * El auth.log solo trae segundos, así que los eventos de SSH se piden desde un segundo antes y se
 * repiten: la clave descarta los que ya estaban.
 */
export function unirRegistros<T extends { t: number }>(previos: T[], nuevos: T[], clave: (r: T) => string, maximo = 500): T[] {
  const vistos = new Set(previos.map(clave));
  const todos = previos.concat(nuevos.filter((r) => !vistos.has(clave(r))));
  todos.sort((a, b) => a.t - b.t);
  return todos.length > maximo ? todos.slice(todos.length - maximo) : todos;
}

export const claveApi = (r: RegistroApi) => `${r.t}|${r.metodo}|${r.ruta}`;
export const claveSsh = (e: EventoSsh) => `${e.t}|${e.mensaje}`;

/** Cuántos eventos de SSH de cada tipo hubo desde `desde`. */
export function contarEventos(eventos: EventoSsh[], desde: number): Partial<Record<TipoEventoSsh, number>> {
  const cuenta: Partial<Record<TipoEventoSsh, number>> = {};
  for (const e of eventos) if (e.t >= desde) cuenta[e.tipo] = (cuenta[e.tipo] ?? 0) + 1;
  return cuenta;
}
