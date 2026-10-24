import { describe, expect, it } from 'vitest';
import { notaYResumen, textoRegistro, yaEnviada } from '@/features/cursos/ResultadoMoodleAviso';

const r = { practice_id: 'ev3-m3', total_points: 8, earned_points: 7, percentage: 87.5, passed: true };

describe('resultado de práctica para Moodle', () => {
  it('redondea la nota a 0–100 y arma el comentario para el docente', () => {
    expect(notaYResumen(r)).toEqual({ nota: 88, resumen: 'Práctica ev3-m3: 7 de 8 puntos (88 %). Enviado desde LaboRemoto.' });
  });

  it('acota la nota si llega fuera de rango', () => {
    expect(notaYResumen({ ...r, percentage: 130 }).nota).toBe(100);
    expect(notaYResumen({ ...r, percentage: -5 }).nota).toBe(0);
  });

  it('no vuelve a ofrecer el envío si el docente ya la tiene', () => {
    for (const e of ['readyforreview', 'inreview', 'graded', 'released']) expect(yaEnviada(e)).toBe(true);
    for (const e of ['notgraded', 'notmarked', null, undefined]) expect(yaEnviada(e)).toBe(false);
  });

  it('le dice al estudiante cómo quedó el registro de su sesión', () => {
    expect(textoRegistro(true, true, 'adjuntado')).toContain('va adjunto');
    expect(textoRegistro(false, true, 'no_enviado')).toContain('sin el registro');
    expect(textoRegistro(true, false, 'no_enviado')).toContain('sesión ya está cerrada');
    expect(textoRegistro(true, true, 'fallo_la_subida')).toContain('solo la nota');
  });
});
