// Formatos de la pestaña «Encuestas» de Actividad.
import type { Nivel } from '@/components/ui';
import { DIFICULTADES, PROBLEMAS, type ResumenPracticaEncuesta } from '@/features/practicas/encuestas.service';

/** `4,2` (una cifra decimal, coma) o `—`. */
export const nota5 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(1).replace('.', ','));

/** Nivel del promedio sobre 5: color solo cuando baja (de 3 a 4, alerta; menos de 3, crítico). */
export const nivelNota5 = (v: number | null | undefined): Nivel => (v == null ? 'apagado' : v >= 4 ? 'bien' : v >= 3 ? 'alerta' : 'critico');

/** Problemas reportados, de más a menos, sin los que nadie marcó; «Ninguno» aparte. */
export function problemasOrdenados(p: ResumenPracticaEncuesta['problemas']): { valor: string; etiqueta: string; veces: number }[] {
  return PROBLEMAS.filter((x) => x.value !== 'ninguno')
    .map((x) => ({ valor: x.value, etiqueta: x.label, veces: p[x.value] ?? 0 }))
    .filter((x) => x.veces > 0)
    .sort((a, b) => b.veces - a.veces);
}

/** Reparto de la dificultad en porcentaje (0–100), en el orden de la escala. */
export function repartoDificultad(d: ResumenPracticaEncuesta['dificultad'], total: number) {
  return DIFICULTADES.map((x) => ({ valor: x.value, etiqueta: x.label, veces: d[x.value] ?? 0, pct: total ? Math.round(((d[x.value] ?? 0) / total) * 100) : 0 }));
}
