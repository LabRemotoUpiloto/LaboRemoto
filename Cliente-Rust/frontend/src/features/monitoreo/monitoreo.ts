// features/monitoreo/monitoreo.ts — cuentas de las vistas de Monitoreo (sin React, para probarlas aparte).
import type { MuestraPi, ServicioPi } from './rendimiento.service';
import { INDICADORES, estadoDe, estudiantesEn } from './rendimientoStats';
import type { Nivel } from '@/components/ui/estilos';

export type { Nivel };

/** El disco no entra en la prueba de carga (no cambia con los estudiantes), pero sí en el estado. */
export const DISCO = { alerta: 80, critico: 90 };

export const frenadaAhora = (m: MuestraPi | null) =>
  !!m?.frenado && (m.frenado.frenada || m.frenado.bajo_voltaje || m.frenado.frecuencia_limitada);

/** Servicios que no están corriendo (caídos o reiniciándose en bucle). */
export const serviciosCaidos = (servicios: ServicioPi[] | null | undefined) => (servicios ?? []).filter((s) => !s.activo);

/** El estado de la Pi en una línea: lo peor entre medidas, frenado, disco y servicios. */
export function estadoPi(
  ultima: MuestraPi | null, servicios: ServicioPi[] | null | undefined, error: string | null,
): { nivel: Nivel; fuerte: string; resto: string } {
  if (!ultima) {
    return error ? { nivel: 'critico', fuerte: 'Sin conexión', resto: 'no se pudo leer la Pi' } : { nivel: 'apagado', fuerte: 'Conectando…', resto: '' };
  }
  if (error) return { nivel: 'critico', fuerte: 'Sin conexión', resto: 'se muestran los últimos datos recibidos' };
  if (frenadaAhora(ultima)) return { nivel: 'critico', fuerte: 'Crítico', resto: 'se está frenando por calor o voltaje' };
  const problemas = INDICADORES.map((i) => ({ nombre: i.titulo.toLowerCase(), e: estadoDe(i, i.valor(ultima)) }));
  const disco = ultima.disco?.pct;
  if (disco != null) problemas.push({ nombre: 'disco', e: disco >= DISCO.critico ? 'critico' : disco >= DISCO.alerta ? 'alerta' : 'bueno' });
  const criticos = problemas.filter((p) => p.e === 'critico');
  if (criticos.length) return { nivel: 'critico', fuerte: 'Crítico', resto: criticos.map((p) => p.nombre).join(', ') };
  const alertas = problemas.filter((p) => p.e === 'alerta');
  const caidos = serviciosCaidos(servicios);
  if (alertas.length || caidos.length) {
    const partes = alertas.map((p) => p.nombre);
    if (caidos.length) partes.push(caidos.length === 1 ? `${caidos[0].unidad} no está corriendo` : `${caidos.length} servicios no están corriendo`);
    return { nivel: 'alerta', fuerte: 'Atención', resto: partes.join(', ') };
  }
  return { nivel: 'bien', fuerte: 'En línea', resto: 'todo en orden' };
}

/** Mínimo, mediana y máximo de una medida para cada cantidad de estudiantes conectados. */
export interface PorEstudiantes {
  estudiantes: number;
  minimo: number;
  mediana: number;
  maximo: number;
  muestras: number;
}

export function agruparPorEstudiantes(muestras: MuestraPi[], valor: (m: MuestraPi) => number | null): PorEstudiantes[] {
  const grupos = new Map<number, number[]>();
  for (const m of muestras) {
    const n = estudiantesEn(m);
    const v = valor(m);
    if (n == null || v == null) continue;
    const g = grupos.get(n);
    if (g) g.push(v);
    else grupos.set(n, [v]);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => a - b)
    .map(([estudiantes, vs]) => {
      const orden = [...vs].sort((a, b) => a - b);
      const medio = Math.floor(orden.length / 2);
      const mediana = orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
      return { estudiantes, minimo: orden[0], mediana, maximo: orden[orden.length - 1], muestras: orden.length };
    });
}

/** Promedio y rango de una medida en tramos fijos: la línea muestra la tendencia y la banda los picos. */
export interface Tramo {
  /** Centro del tramo (epoch en segundos). */
  t: number;
  minimo: number;
  promedio: number;
  maximo: number;
}

export function tramosEnElTiempo(
  muestras: MuestraPi[], valor: (m: MuestraPi) => number | null, desde: number, hasta: number, segundos = 30,
): Tramo[] {
  const grupos = new Map<number, number[]>();
  // La muestra que cae justo en `hasta` va al último tramo, no a uno nuevo que se saldría de la gráfica.
  const ultimo = Math.max(0, Math.ceil((hasta - desde) / segundos) - 1);
  for (const m of muestras) {
    if (m.t < desde || m.t > hasta) continue;
    const v = valor(m);
    if (v == null) continue;
    const k = Math.min(ultimo, Math.floor((m.t - desde) / segundos));
    const g = grupos.get(k);
    if (g) g.push(v);
    else grupos.set(k, [v]);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => a - b)
    .map(([k, vs]) => ({
      t: desde + (k + 0.5) * segundos,
      minimo: Math.min(...vs),
      promedio: vs.reduce((s, v) => s + v, 0) / vs.length,
      maximo: Math.max(...vs),
    }));
}

/** Clave del día local de un epoch (para agrupar registros que abarcan varios días). */
const claveDia = (t: number) => {
  const d = new Date(t * 1000);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** «HOY · MIÉ 21 OCT», «AYER · MAR 20 OCT» o «LUN 19 OCT». */
export function etiquetaDia(t: number, ahora: number = Date.now() / 1000): string {
  const fecha = new Date(t * 1000)
    .toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/[.,]/g, '')
    .replace(/ de /g, ' ')
    .toUpperCase();
  if (claveDia(t) === claveDia(ahora)) return `HOY, ${fecha}`;
  if (claveDia(t) === claveDia(ahora - 86400)) return `AYER, ${fecha}`;
  return fecha;
}

/** Agrupa filas (ya ordenadas) por día, conservando el orden. */
export function agruparPorDia<T extends { t: number }>(filas: T[], ahora?: number): { dia: string; filas: T[] }[] {
  const grupos: { clave: string; dia: string; filas: T[] }[] = [];
  for (const f of filas) {
    const clave = claveDia(f.t);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.clave === clave) ultimo.filas.push(f);
    else grupos.push({ clave, dia: etiquetaDia(f.t, ahora), filas: [f] });
  }
  return grupos.map(({ dia, filas: fs }) => ({ dia, filas: fs }));
}

/** Valor con su unidad, como en el resto del panel: «8%», «47°C», «0.1 Mbps», «820 ms»; sin dato, «—». */
export function formatoValor(v: number | null | undefined, unidad: string): string {
  if (v == null) return '—';
  const dec = unidad === 'Mbps' ? 1 : unidad === '%' && v < 1 && v > 0 ? 2 : 0;
  return `${v.toFixed(dec)}${unidad === '%' || unidad === '°C' || unidad === '' ? '' : ' '}${unidad}`;
}

/** Hora en 24 h con segundos: más corta y sin ambigüedad en un registro. */
export const hora24 = (t: number) =>
  new Date(t * 1000).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

/** Cuánto tiempo pasó, en palabras cortas: «2 d 1 h», «3 h 12 min», «5 min». */
export function duracion(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const min = Math.floor((s % 3600) / 60);
  if (d) return h ? `${d} d ${h} h` : `${d} d`;
  if (h) return min ? `${h} h ${min} min` : `${h} h`;
  return `${Math.max(min, 1)} min`;
}
