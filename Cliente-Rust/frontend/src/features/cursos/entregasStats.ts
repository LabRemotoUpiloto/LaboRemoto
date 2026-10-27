// features/cursos/entregasStats.ts — textos y conteos de la lista de entregas que ve el docente en «Mis cursos».
import type { EntregaEstudiante } from '@/bindings/EntregaEstudiante';
import type { ResumenCurso } from '@/bindings/ResumenCurso';

/** El estudiante ya mandó algo a Moodle (hay estado de revisión o nota). */
export const yaEntrego = (e: Pick<EntregaEstudiante, 'estado' | 'nota'>) =>
  e.nota !== null || !['notgraded', 'notmarked', ''].includes(e.estado);

/** Estado de revisión en palabras para el docente. */
export function etiquetaEstadoDocente(e: Pick<EntregaEstudiante, 'estado' | 'nota'>): string {
  if (!yaEntrego(e)) return 'Sin enviar';
  switch (e.estado) {
    case 'readyforreview': return 'Lista para revisar';
    case 'inreview': return 'En revisión';
    case 'inmarking': return 'En calificación';
    case 'readyforrelease': return 'Lista para publicar';
    case 'released':
    case 'graded': return 'Calificada';
    default: return 'Enviada';
  }
}

export interface ResumenEntregas { total: number; enviadas: number; porRevisar: number }

export function resumenEntregas(estudiantes: Pick<EntregaEstudiante, 'estado' | 'nota'>[]): ResumenEntregas {
  return {
    total: estudiantes.length,
    enviadas: estudiantes.filter(yaEntrego).length,
    porRevisar: estudiantes.filter((e) => e.estado === 'readyforreview').length,
  };
}

/** `87,5 %` o `—` si todavía no hay nota. */
export const textoNota = (nota: number | null) =>
  nota === null ? '—' : `${Number.isInteger(nota) ? nota : nota.toFixed(1).replace('.', ',')} %`;

// ── Vista general del curso (docente) ──

export interface FilaGeneral {
  usuario: string;
  nombre: string;
  entregadas: number;
  total: number;
  /** % de prácticas del curso que ya entregó (0–100). */
  avance: number;
  /** Nota general (0–100): promedio de TODAS las prácticas del curso; la que no entregó cuenta como 0. */
  general: number;
  /** Promedio solo de las prácticas que ya tienen nota; `null` si ninguna. */
  promedioNotas: number | null;
  /** Nota o `null` por práctica, en el orden de las prácticas del curso. */
  notas: (number | null)[];
  estados: string[];
}

export interface ResumenGeneral {
  filas: FilaGeneral[];
  /** Por práctica: cuántos estudiantes entregaron y el promedio de las notas que ya hay. */
  porPractica: { cmid: number; entregaron: number; promedio: number | null }[];
  /** Medias del curso entero. */
  curso: { estudiantes: number; practicas: number; avance: number; general: number };
}

const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const redondear = (n: number) => Math.round(n * 10) / 10;

export function resumenGeneral(r: Pick<ResumenCurso, 'practicas' | 'estudiantes'>): ResumenGeneral {
  const total = r.practicas.length;
  const filas: FilaGeneral[] = r.estudiantes.map((s) => {
    const entregadas = s.entregas.filter(yaEntrego).length;
    const conNota = s.entregas.map((e) => e.nota).filter((n): n is number => n !== null);
    const suma = conNota.reduce((a, b) => a + b, 0);
    const prom = media(conNota);
    return {
      usuario: s.usuario,
      nombre: s.nombre,
      entregadas,
      total,
      avance: total ? redondear((entregadas / total) * 100) : 0,
      general: total ? redondear(suma / total) : 0,
      promedioNotas: prom === null ? null : redondear(prom),
      notas: s.entregas.map((e) => e.nota),
      estados: s.entregas.map((e) => e.estado),
    };
  });
  const porPractica = r.practicas.map((p, i) => {
    const celdas = r.estudiantes.map((s) => s.entregas[i]).filter(Boolean);
    const prom = media(celdas.map((c) => c.nota).filter((n): n is number => n !== null));
    return { cmid: p.cmid, entregaron: celdas.filter(yaEntrego).length, promedio: prom === null ? null : redondear(prom) };
  });
  return {
    filas,
    porPractica,
    curso: {
      estudiantes: filas.length,
      practicas: total,
      avance: filas.length ? redondear(filas.reduce((a, f) => a + f.avance, 0) / filas.length) : 0,
      general: filas.length ? redondear(filas.reduce((a, f) => a + f.general, 0) / filas.length) : 0,
    },
  };
}
