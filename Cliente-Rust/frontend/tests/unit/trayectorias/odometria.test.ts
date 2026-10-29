// tests/unit/trayectorias/odometria.test.ts — editor de trayectorias del EV3: odometría: de los encoders a la trayectoria real.
// Pruebas portadas de investigacion_ev3 (rama version_api, src/lib/trayectoria/__tests__).
import { describe, it, expect } from 'vitest';
import { odometriaInversa, reconstruirTrayectoria, errorFinalCm } from '@/features/practicas/ev3/trayectorias/odometria';
import { calcularAvance, calcularGiro } from '@/features/practicas/ev3/trayectorias/cinematica';
import { CONFIG_POR_DEFECTO } from '@/features/practicas/ev3/trayectorias/tipos';

const POSE_ORIGEN = { x: 0, y: 0, th: 0 };

describe('odometriaInversa', () => {
  it('avanzar en línea recta desde th=0 mueve solo x', () => {
    const { izquierda, derecha } = calcularAvance(10, CONFIG_POR_DEFECTO);
    const pose = odometriaInversa(izquierda, derecha, POSE_ORIGEN, CONFIG_POR_DEFECTO);
    expect(pose.x).toBeCloseTo(10, 6);
    expect(pose.y).toBeCloseTo(0, 6);
    expect(pose.th).toBeCloseTo(0, 6);
  });

  it('avanzar con th=90 mueve solo y', () => {
    const { izquierda, derecha } = calcularAvance(10, CONFIG_POR_DEFECTO);
    const pose = odometriaInversa(izquierda, derecha, { x: 0, y: 0, th: 90 }, CONFIG_POR_DEFECTO);
    expect(pose.x).toBeCloseTo(0, 6);
    expect(pose.y).toBeCloseTo(10, 6);
  });

  it('un giro puro no desplaza el centro, solo cambia th', () => {
    const { izquierda, derecha } = calcularGiro(90, CONFIG_POR_DEFECTO);
    const pose = odometriaInversa(izquierda, derecha, POSE_ORIGEN, CONFIG_POR_DEFECTO);
    expect(pose.x).toBeCloseTo(0, 6);
    expect(pose.y).toBeCloseTo(0, 6);
    expect(pose.th).toBeCloseTo(90, 6);
  });

  it('es la inversa de calcularGiro/calcularAvance para una ruta compuesta', () => {
    // avanzar 20cm, girar 90° antihorario, avanzar 10cm -> debe terminar en (20, 10, 90)
    let pose = POSE_ORIGEN;
    let paso = calcularAvance(20, CONFIG_POR_DEFECTO);
    pose = odometriaInversa(paso.izquierda, paso.derecha, pose, CONFIG_POR_DEFECTO);
    paso = calcularGiro(90, CONFIG_POR_DEFECTO);
    pose = odometriaInversa(paso.izquierda, paso.derecha, pose, CONFIG_POR_DEFECTO);
    paso = calcularAvance(10, CONFIG_POR_DEFECTO);
    pose = odometriaInversa(paso.izquierda, paso.derecha, pose, CONFIG_POR_DEFECTO);

    expect(pose.x).toBeCloseTo(20, 6);
    expect(pose.y).toBeCloseTo(10, 6);
    expect(pose.th).toBeCloseTo(90, 6);
  });

  it('normaliza th al acumular vueltas completas', () => {
    const { izquierda, derecha } = calcularGiro(270, CONFIG_POR_DEFECTO);
    const pose = odometriaInversa(izquierda, derecha, { x: 0, y: 0, th: 0 }, CONFIG_POR_DEFECTO);
    expect(pose.th).toBeCloseTo(-90, 6);
  });
});

describe('reconstruirTrayectoria', () => {
  it('devuelve una pose por lectura más la pose inicial', () => {
    const paso = calcularAvance(10, CONFIG_POR_DEFECTO);
    const lecturas = [
      { izquierda: paso.izquierda, derecha: paso.derecha },
      { izquierda: paso.izquierda * 2, derecha: paso.derecha * 2 },
    ];
    const poses = reconstruirTrayectoria(lecturas, POSE_ORIGEN, CONFIG_POR_DEFECTO);
    expect(poses).toHaveLength(3);
    expect(poses[0]).toEqual(POSE_ORIGEN);
    expect(poses[2].x).toBeCloseTo(20, 6);
  });
});

describe('errorFinalCm', () => {
  it('es 0 cuando la pose real coincide con la planeada', () => {
    expect(errorFinalCm({ x: 5, y: 5, th: 90 }, { x: 5, y: 5, th: 0 })).toBe(0);
  });

  it('es la distancia euclidiana entre ambas posiciones, ignorando el rumbo', () => {
    expect(errorFinalCm({ x: 3, y: 4, th: 0 }, { x: 0, y: 0, th: 180 })).toBeCloseTo(5, 6);
  });
});
