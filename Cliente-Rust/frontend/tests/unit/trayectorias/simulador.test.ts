// tests/unit/trayectorias/simulador.test.ts — editor de trayectorias del EV3: tiempos y poses de la simulación.
// Pruebas portadas de investigacion_ev3 (rama version_api, src/lib/trayectoria/__tests__).
import { describe, it, expect } from 'vitest';
import {
  duracionPrimitivaMs,
  construirLineaDeTiempo,
  duracionTotalMs,
  poseEnInstante,
  VELOCIDAD_LINEAL_CM_S,
  VELOCIDAD_ANGULAR_GRADOS_S,
} from '@/features/practicas/ev3/trayectorias/simulador';

describe('duracionPrimitivaMs', () => {
  it('avanzar se temporiza por distancia', () => {
    expect(duracionPrimitivaMs({ tipo: 'avanzar', cm: VELOCIDAD_LINEAL_CM_S })).toBeCloseTo(1000, 6);
  });

  it('girar se temporiza por ángulo, sin importar el signo', () => {
    expect(duracionPrimitivaMs({ tipo: 'girar', grados: VELOCIDAD_ANGULAR_GRADOS_S })).toBeCloseTo(1000, 6);
    expect(duracionPrimitivaMs({ tipo: 'girar', grados: -VELOCIDAD_ANGULAR_GRADOS_S })).toBeCloseTo(1000, 6);
  });

  it('arco con radio 0 dura lo mismo que un girar del mismo ángulo', () => {
    const arco = duracionPrimitivaMs({ tipo: 'arco', radioCm: 0, grados: 45 });
    const giro = duracionPrimitivaMs({ tipo: 'girar', grados: 45 });
    expect(arco).toBeCloseTo(giro, 6);
  });

  it('arco con radio grande dura lo mismo que uno con radio chico, mismo ángulo', () => {
    const chico = duracionPrimitivaMs({ tipo: 'arco', radioCm: 5, grados: 90 });
    const grande = duracionPrimitivaMs({ tipo: 'arco', radioCm: 50, grados: 90 });
    expect(chico).toBeCloseTo(grande, 6);
  });

  it('pausa dura exactamente sus ms', () => {
    expect(duracionPrimitivaMs({ tipo: 'pausa', ms: 750 })).toBe(750);
  });
});

describe('construirLineaDeTiempo / duracionTotalMs', () => {
  it('acumula los tiempos de inicio/fin en orden', () => {
    const linea = construirLineaDeTiempo([
      { tipo: 'avanzar', cm: VELOCIDAD_LINEAL_CM_S }, // 1000ms
      { tipo: 'pausa', ms: 500 },
      { tipo: 'girar', grados: VELOCIDAD_ANGULAR_GRADOS_S }, // 1000ms
    ]);

    expect(linea[0]).toMatchObject({ inicioMs: 0, finMs: 1000 });
    expect(linea[1]).toMatchObject({ inicioMs: 1000, finMs: 1500 });
    expect(linea[2]).toMatchObject({ inicioMs: 1500, finMs: 2500 });
    expect(duracionTotalMs(linea)).toBe(2500);
  });

  it('una ruta vacía dura 0', () => {
    expect(duracionTotalMs(construirLineaDeTiempo([]))).toBe(0);
  });
});

describe('poseEnInstante', () => {
  const primitivas = [
    { tipo: 'avanzar', cm: VELOCIDAD_LINEAL_CM_S }, // 0 - 1000ms, (0,0)->(20,0)
    { tipo: 'girar', grados: VELOCIDAD_ANGULAR_GRADOS_S }, // 1000 - 2000ms, th 0->90
  ];

  it('en t=0 devuelve la pose inicial y la primera primitiva activa', () => {
    const linea = construirLineaDeTiempo(primitivas);
    const { pose, indiceActivo } = poseEnInstante(linea, 0);
    expect(pose).toEqual({ x: 0, y: 0, th: 0 });
    expect(indiceActivo).toBe(0);
  });

  it('a mitad del avanzar interpola la posición linealmente', () => {
    const linea = construirLineaDeTiempo(primitivas);
    const { pose, indiceActivo } = poseEnInstante(linea, 500);
    expect(pose.x).toBeCloseTo(10, 6);
    expect(pose.y).toBeCloseTo(0, 6);
    expect(indiceActivo).toBe(0);
  });

  it('durante el girar interpola el ángulo y activa la segunda primitiva', () => {
    const linea = construirLineaDeTiempo(primitivas);
    const { pose, indiceActivo } = poseEnInstante(linea, 1500);
    expect(pose.x).toBeCloseTo(20, 6);
    expect(pose.th).toBeCloseTo(45, 6);
    expect(indiceActivo).toBe(1);
  });

  it('en el instante final devuelve la pose final exacta', () => {
    const linea = construirLineaDeTiempo(primitivas);
    const total = duracionTotalMs(linea);
    const { pose, indiceActivo } = poseEnInstante(linea, total);
    expect(pose.x).toBeCloseTo(20, 6);
    expect(pose.th).toBeCloseTo(90, 6);
    expect(indiceActivo).toBe(1);
  });

  it('recorta tiempos fuera de rango (negativos o más allá del final)', () => {
    const linea = construirLineaDeTiempo(primitivas);
    const total = duracionTotalMs(linea);
    expect(poseEnInstante(linea, -500).pose).toEqual({ x: 0, y: 0, th: 0 });
    expect(poseEnInstante(linea, total + 5000).pose.th).toBeCloseTo(90, 6);
  });

  it('un giro de 270° interpola por el lado correcto (sin atajo por -90°)', () => {
    const linea = construirLineaDeTiempo([{ tipo: 'girar', grados: 270 }]);
    const total = duracionTotalMs(linea);
    const { pose } = poseEnInstante(linea, total / 2);
    // A mitad de camino de un giro de 270° antihorario, va por los 135°, no por -45°.
    expect(pose.th).toBeCloseTo(135, 6);
  });

  it('ruta vacía: indiceActivo null y pose inicial', () => {
    expect(poseEnInstante(construirLineaDeTiempo([]), 100)).toEqual({
      pose: { x: 0, y: 0, th: 0 },
      indiceActivo: null,
    });
  });

  it('interpola un arco sobre el mismo círculo que simularPrimitivas', () => {
    const linea = construirLineaDeTiempo([{ tipo: 'arco', radioCm: 10, grados: 90 }]);
    const total = duracionTotalMs(linea);
    const { pose } = poseEnInstante(linea, total / 2);
    // Centro del arco (antihorario, radio 10, desde th=0) en (0,10).
    expect(Math.hypot(pose.x - 0, pose.y - 10)).toBeCloseTo(10, 6);
  });
});
