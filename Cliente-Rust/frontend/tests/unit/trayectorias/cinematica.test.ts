// tests/unit/trayectorias/cinematica.test.ts — editor de trayectorias del EV3: grados de motor de cada primitiva.
// Pruebas portadas de investigacion_ev3 (rama version_api, src/lib/trayectoria/__tests__).
import { describe, it, expect } from 'vitest';
import {
  gradosMotorPorCm,
  normalizarAngulo,
  calcularAvance,
  calcularGiro,
  calcularArco,
  gradosMotorParaPrimitiva,
} from '@/features/practicas/ev3/trayectorias/cinematica';
import { CONFIG_POR_DEFECTO } from '@/features/practicas/ev3/trayectorias/tipos';

describe('gradosMotorPorCm', () => {
  it('coincide con 360 / (pi * D)', () => {
    expect(gradosMotorPorCm(5.6)).toBeCloseTo(360 / (Math.PI * 5.6), 10);
  });
});

describe('normalizarAngulo', () => {
  it('deja sin cambios los ángulos ya dentro de (-180, 180]', () => {
    expect(normalizarAngulo(0)).toBe(0);
    expect(normalizarAngulo(90)).toBe(90);
    expect(normalizarAngulo(-90)).toBe(-90);
    expect(normalizarAngulo(180)).toBe(180);
  });

  it('envuelve ángulos fuera de rango', () => {
    expect(normalizarAngulo(190)).toBeCloseTo(-170, 10);
    expect(normalizarAngulo(-190)).toBeCloseTo(170, 10);
    expect(normalizarAngulo(370)).toBeCloseTo(10, 10);
    expect(normalizarAngulo(-370)).toBeCloseTo(-10, 10);
    expect(normalizarAngulo(-180)).toBe(180);
  });
});

describe('calcularAvance', () => {
  it('mueve ambos motores el mismo signo y magnitud', () => {
    const { izquierda, derecha } = calcularAvance(10, CONFIG_POR_DEFECTO);
    expect(izquierda).toBeCloseTo(derecha, 10);
    expect(izquierda).toBeCloseTo(10 * gradosMotorPorCm(5.6), 10);
  });

  it('retrocede con cm negativo', () => {
    const { izquierda, derecha } = calcularAvance(-5, CONFIG_POR_DEFECTO);
    expect(izquierda).toBeLessThan(0);
    expect(derecha).toBeLessThan(0);
  });

  it('respeta el factor de calibración', () => {
    const config = { ...CONFIG_POR_DEFECTO, factorCalibracion: 2 };
    const normal = calcularAvance(10, CONFIG_POR_DEFECTO);
    const calibrado = calcularAvance(10, config);
    expect(calibrado.izquierda).toBeCloseTo(normal.izquierda * 2, 10);
  });
});

describe('calcularGiro', () => {
  it('mueve las ruedas en sentidos opuestos con la misma magnitud', () => {
    const { izquierda, derecha } = calcularGiro(90, CONFIG_POR_DEFECTO);
    expect(izquierda).toBeCloseTo(-derecha, 10);
  });

  it('coincide con la fórmula cerrada Δθ·(E/D)·k', () => {
    const { derecha } = calcularGiro(90, CONFIG_POR_DEFECTO);
    const esperado = 90 * (CONFIG_POR_DEFECTO.anchoViaCm / CONFIG_POR_DEFECTO.diametroRuedaCm);
    expect(derecha).toBeCloseTo(esperado, 10);
  });

  it('antihorario (+) retrocede la izquierda y avanza la derecha', () => {
    const { izquierda, derecha } = calcularGiro(45, CONFIG_POR_DEFECTO);
    expect(izquierda).toBeLessThan(0);
    expect(derecha).toBeGreaterThan(0);
  });
});

describe('calcularArco', () => {
  it('con radio 0 coincide exactamente con calcularGiro (caso límite)', () => {
    const arco = calcularArco(0, 90, CONFIG_POR_DEFECTO);
    const giro = calcularGiro(90, CONFIG_POR_DEFECTO);
    expect(arco.izquierda).toBeCloseTo(giro.izquierda, 10);
    expect(arco.derecha).toBeCloseTo(giro.derecha, 10);
  });

  it('la rueda exterior gira más que la interior en un giro a la izquierda', () => {
    const { izquierda, derecha } = calcularArco(30, 90, CONFIG_POR_DEFECTO);
    // antihorario: izquierda es la interior, derecha la exterior
    expect(derecha).toBeGreaterThan(izquierda);
  });

  it('con radio menor que E/2 la rueda interior retrocede', () => {
    const { izquierda } = calcularArco(2, 90, CONFIG_POR_DEFECTO); // E/2 = 6
    expect(izquierda).toBeLessThan(0);
  });

  it('un giro horario intercambia cuál rueda es la exterior', () => {
    const izq = calcularArco(30, -90, CONFIG_POR_DEFECTO);
    expect(izq.izquierda).toBeGreaterThan(izq.derecha);
  });
});

describe('gradosMotorParaPrimitiva', () => {
  it('despacha avanzar, girar, arco y pausa correctamente', () => {
    expect(gradosMotorParaPrimitiva({ tipo: 'avanzar', cm: 10 }, CONFIG_POR_DEFECTO))
      .toEqual(calcularAvance(10, CONFIG_POR_DEFECTO));
    expect(gradosMotorParaPrimitiva({ tipo: 'girar', grados: 90 }, CONFIG_POR_DEFECTO))
      .toEqual(calcularGiro(90, CONFIG_POR_DEFECTO));
    expect(gradosMotorParaPrimitiva({ tipo: 'arco', radioCm: 20, grados: 45 }, CONFIG_POR_DEFECTO))
      .toEqual(calcularArco(20, 45, CONFIG_POR_DEFECTO));
    expect(gradosMotorParaPrimitiva({ tipo: 'pausa', ms: 500 }, CONFIG_POR_DEFECTO))
      .toEqual({ izquierda: 0, derecha: 0 });
  });

  it('lanza un error ante un tipo desconocido', () => {
    expect(() => gradosMotorParaPrimitiva({ tipo: 'volar' }, CONFIG_POR_DEFECTO)).toThrow();
  });
});
