import { describe, expect, it } from 'vitest';
import { BORRADOR_VACIO, alternarProblema, respuestasDe } from '@/features/practicas/encuestas.service';
import { nota5, problemasOrdenados, repartoDificultad } from '@/features/actividad/encuestasStats';

describe('encuesta de la práctica', () => {
  it('«Ninguno» es excluyente con los demás problemas', () => {
    expect(alternarProblema([], 'ninguno')).toEqual(['ninguno']);
    expect(alternarProblema(['ninguno'], 'lentitud')).toEqual(['lentitud']);
    expect(alternarProblema(['lentitud', 'camara'], 'ninguno')).toEqual(['ninguno']);
    expect(alternarProblema(['lentitud', 'camara'], 'lentitud')).toEqual(['camara']);
  });

  it('solo se puede enviar con todas las preguntas de opción respondidas; los comentarios son opcionales', () => {
    const lleno = { ...BORRADOR_VACIO, aprendizaje: 5, claridad: 4, dificultad: 'adecuada', asistente: 'no_uso' as const, funcionamiento: 3, problemas: ['ninguno'], satisfaccion: 4, mejorar: '  más tiempo  ' };
    expect(respuestasDe(lleno)).toMatchObject({ asistente: 'no_uso', gusto: '', mejorar: 'más tiempo' });
    expect(respuestasDe({ ...lleno, problemas: [] })).toBeNull();
    expect(respuestasDe({ ...lleno, funcionamiento: null })).toBeNull();
    expect(respuestasDe(BORRADOR_VACIO)).toBeNull();
  });

  it('resumen: notas con coma, problemas de más a menos sin los vacíos, dificultad en porcentaje', () => {
    expect([nota5(4.25), nota5(null)]).toEqual(['4,3', '—']);
    expect(problemasOrdenados({ ninguno: 3, lentitud: 1, desconexiones: 2, terminal: 0, camara: 0, guia: 0, otro: 0 }).map((p) => p.valor)).toEqual(['desconexiones', 'lentitud']);
    expect(repartoDificultad({ muy_facil: 0, facil: 1, adecuada: 3, dificil: 0, muy_dificil: 0 }, 4).find((d) => d.valor === 'adecuada')?.pct).toBe(75);
  });
});
