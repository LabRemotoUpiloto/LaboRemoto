// tests/unit/trayectorias/planificador.test.ts — editor de trayectorias del EV3: poses y puntos de la ruta planeada.
// Pruebas portadas de investigacion_ev3 (rama version_api, src/lib/trayectoria/__tests__).
import { describe, it, expect } from 'vitest';
import { simularPrimitivas, poseFinal } from '@/features/practicas/ev3/trayectorias/planificador';

describe('poseFinal', () => {
  it('avanzar mueve a lo largo del rumbo actual', () => {
    const pose = poseFinal([{ tipo: 'avanzar', cm: 10 }]);
    expect(pose.x).toBeCloseTo(10, 6);
    expect(pose.y).toBeCloseTo(0, 6);
    expect(pose.th).toBeCloseTo(0, 6);
  });

  it('girar cambia th sin desplazar', () => {
    const pose = poseFinal([{ tipo: 'girar', grados: 90 }]);
    expect(pose.x).toBeCloseTo(0, 6);
    expect(pose.y).toBeCloseTo(0, 6);
    expect(pose.th).toBeCloseTo(90, 6);
  });

  it('pausa no cambia nada', () => {
    const pose = poseFinal([{ tipo: 'pausa', ms: 500 }]);
    expect(pose).toEqual({ x: 0, y: 0, th: 0 });
  });

  it('un arco de 90° antihorario y radio 10 desde th=0 termina en (10,10,90) [cuarto de círculo clásico]', () => {
    const pose = poseFinal([{ tipo: 'arco', radioCm: 10, grados: 90 }]);
    expect(pose.x).toBeCloseTo(10, 6);
    expect(pose.y).toBeCloseTo(10, 6);
    expect(pose.th).toBeCloseTo(90, 6);
  });

  it('un arco horario (grados negativos) gira hacia el otro lado', () => {
    const pose = poseFinal([{ tipo: 'arco', radioCm: 10, grados: -90 }]);
    expect(pose.x).toBeCloseTo(10, 6);
    expect(pose.y).toBeCloseTo(-10, 6);
    expect(pose.th).toBeCloseTo(-90, 6);
  });

  it('avanzar + girar 90 + avanzar reproduce una L', () => {
    const pose = poseFinal([
      { tipo: 'avanzar', cm: 20 },
      { tipo: 'girar', grados: 90 },
      { tipo: 'avanzar', cm: 10 },
    ]);
    expect(pose.x).toBeCloseTo(20, 6);
    expect(pose.y).toBeCloseTo(10, 6);
    expect(pose.th).toBeCloseTo(90, 6);
  });
});

describe('simularPrimitivas', () => {
  it('devuelve 2 puntos para un avanzar (recta) y 1 para un girar (no desplaza)', () => {
    const segmentos = simularPrimitivas([
      { tipo: 'avanzar', cm: 10 },
      { tipo: 'girar', grados: 45 },
    ]);
    expect(segmentos[0].puntos).toHaveLength(2);
    expect(segmentos[1].puntos).toHaveLength(1);
  });

  it('muestrea el arco en varios puntos intermedios que quedan sobre el círculo', () => {
    const [segmento] = simularPrimitivas([{ tipo: 'arco', radioCm: 10, grados: 90 }]);
    expect(segmento.puntos.length).toBeGreaterThan(2);
    // Centro del arco (antihorario desde th=0, radio 10) queda en (0,10).
    for (const punto of segmento.puntos) {
      const distanciaAlCentro = Math.hypot(punto.x - 0, punto.y - 10);
      expect(distanciaAlCentro).toBeCloseTo(10, 6);
    }
  });
});
