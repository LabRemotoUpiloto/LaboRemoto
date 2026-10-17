import { describe, expect, it } from 'vitest';
import { etiquetaEstadoDocente, resumenEntregas, resumenGeneral, textoNota, yaEntrego } from '../../src/pages/cursos/entregasStats';

const e = (estado: string, nota: number | null = null) => ({ estado, nota });

describe('entregas del docente', () => {
  it('distingue quién ya mandó algo a Moodle', () => {
    expect(yaEntrego(e('notgraded'))).toBe(false);
    expect(yaEntrego(e('notmarked'))).toBe(false);
    expect(yaEntrego(e('readyforreview', 75))).toBe(true);
    expect(yaEntrego(e('notgraded', 40))).toBe(true);   // hay nota aunque no haya flujo
  });

  it('pone el estado en palabras', () => {
    expect(etiquetaEstadoDocente(e('notgraded'))).toBe('Sin enviar');
    expect(etiquetaEstadoDocente(e('readyforreview', 70))).toBe('Lista para revisar');
    expect(etiquetaEstadoDocente(e('inreview', 70))).toBe('En revisión');
    expect(etiquetaEstadoDocente(e('graded', 90))).toBe('Calificada');
    expect(etiquetaEstadoDocente(e('released', 90))).toBe('Calificada');
  });

  it('cuenta enviadas y por revisar', () => {
    expect(resumenEntregas([e('readyforreview', 70), e('notgraded'), e('graded', 95), e('readyforreview', 60)]))
      .toEqual({ total: 4, enviadas: 3, porRevisar: 2 });
    expect(resumenEntregas([])).toEqual({ total: 0, enviadas: 0, porRevisar: 0 });
  });

  it('muestra la nota con coma decimal o un guion si no hay', () => {
    expect([textoNota(75), textoNota(87.5), textoNota(null)]).toEqual(['75 %', '87,5 %', '—']);
  });
});

describe('vista general del curso', () => {
  const practicas = [1, 2, 3, 4].map((n) => ({ cmid: n, nombre: `p${n}`, practica: `ev3-m${n}`, notaMaxima: 100, flujoRevision: true }));
  const celda = (cmid: number, estado: string, nota: number | null) => ({ cmid, estado, nota, fecha: null });
  const estudiantes = [
    { usuario: 'a@x', nombre: 'Ana', entregas: [celda(1, 'graded', 100), celda(2, 'readyforreview', 80), celda(3, 'notgraded', null), celda(4, 'notgraded', null)] },
    { usuario: 'b@x', nombre: 'Beto', entregas: [celda(1, 'notgraded', null), celda(2, 'notgraded', null), celda(3, 'notgraded', null), celda(4, 'notgraded', null)] },
  ];

  it('calcula avance y nota general por estudiante (lo no entregado cuenta como 0) y el promedio de lo que sí tiene nota', () => {
    const { filas } = resumenGeneral({ practicas, estudiantes });
    expect(filas[0]).toMatchObject({ nombre: 'Ana', entregadas: 2, total: 4, avance: 50, general: 45, promedioNotas: 90 });
    expect(filas[1]).toMatchObject({ nombre: 'Beto', entregadas: 0, avance: 0, general: 0, promedioNotas: null });
    expect(filas[0].notas).toEqual([100, 80, null, null]);
  });

  it('resume por práctica y para el curso entero', () => {
    const r = resumenGeneral({ practicas, estudiantes });
    expect(r.porPractica).toEqual([
      { cmid: 1, entregaron: 1, promedio: 100 }, { cmid: 2, entregaron: 1, promedio: 80 },
      { cmid: 3, entregaron: 0, promedio: null }, { cmid: 4, entregaron: 0, promedio: null },
    ]);
    expect(r.curso).toEqual({ estudiantes: 2, practicas: 4, avance: 25, general: 22.5 });
  });

  it('un curso sin prácticas o sin estudiantes no divide por cero', () => {
    expect(resumenGeneral({ practicas: [], estudiantes: [] }).curso).toEqual({ estudiantes: 0, practicas: 0, avance: 0, general: 0 });
    expect(resumenGeneral({ practicas: [], estudiantes: [{ usuario: 'a', nombre: 'A', entregas: [] }] }).filas[0]).toMatchObject({ avance: 0, general: 0, total: 0 });
  });
});
