import { describe, expect, it } from 'vitest';
import { evaluateExpr, fillTemplate, tryEvaluateExpr } from '../../src/utils/mathExpr';

describe('mathExpr', () => {
  it('respeta precedencia y paréntesis', () => {
    expect(evaluateExpr('2 + 3 * 4')).toBe(14);
    expect(evaluateExpr('(2 + 3) * 4')).toBe(20);
    expect(evaluateExpr('10 / 4')).toBe(2.5);
    expect(evaluateExpr('-3 + 5')).toBe(2);
    expect(evaluateExpr('2 ^ 3 ^ 2')).toBe(512); // asociativa a la derecha
  });

  it('usa variables y pi', () => {
    // grados de motor para avanzar 30 cm con rueda de 5,6 cm
    const g = evaluateExpr('distancia * 360 / (pi * diametro)', { distancia: 30, diametro: 5.6 });
    expect(g).toBeCloseTo(613.9, 1);
  });

  it('el giro de 90° con E=12 y D=5,6 son unos 193° por rueda', () => {
    expect(evaluateExpr('angulo * ancho / diametro', { angulo: 90, ancho: 12, diametro: 5.6 })).toBeCloseTo(192.86, 2);
  });

  it('soporta funciones', () => {
    expect(evaluateExpr('abs(-4) + max(1, 7, 3) + min(2, 9)')).toBe(13);
    expect(evaluateExpr('round(2.6) + sqrt(16)')).toBe(7);
  });

  it('rechaza todo lo que no sea aritmética', () => {
    for (const bad of [
      'alert(1)',
      'constructor',
      '__proto__',
      'a.b',
      'process.exit()',
      '1; 2',
      '"x"',
      '(1 + 2',
      '1 +',
      'foo(1)',
      '2 2',
    ]) {
      expect(() => evaluateExpr(bad, { a: 1 }), bad).toThrow();
    }
  });

  it('una variable que no está en el mapa lanza aunque exista en Object.prototype', () => {
    expect(() => evaluateExpr('toString', {})).toThrow();
    expect(() => evaluateExpr('hasOwnProperty', {})).toThrow();
  });

  it('tryEvaluateExpr devuelve null en errores y no finitos', () => {
    expect(tryEvaluateExpr('1 / 0')).toBeNull();
    expect(tryEvaluateExpr('sqrt(-1)')).toBeNull();
    expect(tryEvaluateExpr('foo + 1')).toBeNull();
    expect(tryEvaluateExpr('1 + 1')).toBe(2);
  });

  it('limita el largo de la fórmula', () => {
    expect(() => evaluateExpr('1+'.repeat(200) + '1')).toThrow();
  });

  it('fillTemplate reemplaza solo los nombres conocidos', () => {
    expect(fillTemplate('motor.on_for_degrees(degrees={g})  # {x}', { g: '614' })).toBe(
      'motor.on_for_degrees(degrees=614)  # {x}',
    );
  });
});
