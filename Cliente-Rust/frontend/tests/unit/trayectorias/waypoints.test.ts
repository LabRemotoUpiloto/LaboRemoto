// tests/unit/trayectorias/waypoints.test.ts — editor de trayectorias del EV3: puntos del lienzo y su traducción a primitivas.
// Pruebas portadas de investigacion_ev3 (rama version_api, src/lib/trayectoria/__tests__).
import { describe, it, expect } from 'vitest';
import {
  primitivasDesdeWaypoints,
  waypointsDesdePrimitivas,
  agregarWaypoint,
  moverWaypoint,
  eliminarWaypoint,
  snapRelativoAAnterior,
} from '@/features/practicas/ev3/trayectorias/waypoints';

describe('primitivasDesdeWaypoints', () => {
  it('un punto adelante en el rumbo actual solo genera avanzar', () => {
    const primitivas = primitivasDesdeWaypoints([{ x: 10, y: 0 }]);
    expect(primitivas).toEqual([{ tipo: 'avanzar', cm: 10 }]);
  });

  it('un punto hacia un lado genera girar + avanzar', () => {
    const primitivas = primitivasDesdeWaypoints([{ x: 0, y: 10 }]);
    expect(primitivas).toHaveLength(2);
    expect(primitivas[0].tipo).toBe('girar');
    expect(primitivas[0].grados).toBeCloseTo(90, 6);
    expect(primitivas[1]).toEqual({ tipo: 'avanzar', cm: 10 });
  });

  it('varios puntos encadenan tramos relativos al rumbo previo', () => {
    const primitivas = primitivasDesdeWaypoints([{ x: 10, y: 0 }, { x: 10, y: 10 }]);
    expect(primitivas[0]).toEqual({ tipo: 'avanzar', cm: 10 });
    expect(primitivas[1].tipo).toBe('girar');
    expect(primitivas[1].grados).toBeCloseTo(90, 6);
    expect(primitivas[2].cm).toBeCloseTo(10, 6);
  });

  it('un punto duplicado (distancia 0) no genera primitivas', () => {
    expect(primitivasDesdeWaypoints([{ x: 0, y: 0 }])).toEqual([]);
  });
});

describe('waypointsDesdePrimitivas', () => {
  it('es la inversa de primitivasDesdeWaypoints (round-trip) para una ruta con vueltas', () => {
    const puntosOriginales = [{ x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const primitivas = primitivasDesdeWaypoints(puntosOriginales);
    const puntosReconstruidos = waypointsDesdePrimitivas(primitivas);

    expect(puntosReconstruidos).toHaveLength(puntosOriginales.length);
    puntosReconstruidos.forEach((punto, i) => {
      expect(punto.x).toBeCloseTo(puntosOriginales[i].x, 6);
      expect(punto.y).toBeCloseTo(puntosOriginales[i].y, 6);
    });
  });

  it('ignora girar/arco/pausa y solo expone el final de cada avanzar', () => {
    const puntos = waypointsDesdePrimitivas([
      { tipo: 'girar', grados: 90 },
      { tipo: 'avanzar', cm: 10 },
      { tipo: 'pausa', ms: 200 },
      { tipo: 'arco', radioCm: 5, grados: 90 },
    ]);
    expect(puntos).toHaveLength(1);
    expect(puntos[0].indicePrimitiva).toBe(1);
  });
});

describe('agregarWaypoint', () => {
  it('solo añade primitivas al final, sin tocar lo anterior', () => {
    const original = [{ tipo: 'arco', radioCm: 5, grados: 90 }, { tipo: 'avanzar', cm: 10 }];
    const resultado = agregarWaypoint(original, { x: 999, y: 999 });
    expect(resultado.slice(0, 2)).toEqual(original);
    expect(resultado.length).toBeGreaterThan(original.length);
  });
});

describe('moverWaypoint y eliminarWaypoint preservan arcos y pausas ajenos', () => {
  // Ruta: avanzar 10 [wp0] -> arco 5,90 (sin waypoint propio) -> avanzar 8 [wp1]
  const conArco = () => [
    { tipo: 'avanzar', cm: 10 },
    { tipo: 'arco', radioCm: 5, grados: 90 },
    { tipo: 'avanzar', cm: 8 },
  ];

  it('mover un waypoint ANTES del arco no cambia los parámetros del arco', () => {
    const resultado = moverWaypoint(conArco(), 0, { x: 20, y: 0 });
    const arco = resultado.find(p => p.tipo === 'arco');
    expect(arco).toEqual({ tipo: 'arco', radioCm: 5, grados: 90 });
  });

  it('mover un waypoint DESPUÉS del arco no cambia los parámetros del arco', () => {
    const resultado = moverWaypoint(conArco(), 1, { x: 5, y: 30 });
    const arco = resultado.find(p => p.tipo === 'arco');
    expect(arco).toEqual({ tipo: 'arco', radioCm: 5, grados: 90 });
  });

  it('mover wp0 re-apunta wp1 para que siga en su posición absoluta original', () => {
    const original = conArco();
    const puntosOriginales = waypointsDesdePrimitivas(original);
    const resultado = moverWaypoint(original, 0, { x: 25, y: 0 });
    const puntosNuevos = waypointsDesdePrimitivas(resultado);

    expect(puntosNuevos[0].x).toBeCloseTo(25, 6);
    expect(puntosNuevos[1].x).toBeCloseTo(puntosOriginales[1].x, 6);
    expect(puntosNuevos[1].y).toBeCloseTo(puntosOriginales[1].y, 6);
  });

  it('eliminar un waypoint conserva el arco y re-apunta el resto de la ruta', () => {
    const original = conArco();
    const puntosOriginales = waypointsDesdePrimitivas(original);
    const resultado = eliminarWaypoint(original, 0);

    const arco = resultado.find(p => p.tipo === 'arco');
    expect(arco).toEqual({ tipo: 'arco', radioCm: 5, grados: 90 });

    const puntosNuevos = waypointsDesdePrimitivas(resultado);
    expect(puntosNuevos).toHaveLength(1);
    expect(puntosNuevos[0].x).toBeCloseTo(puntosOriginales[1].x, 6);
    expect(puntosNuevos[0].y).toBeCloseTo(puntosOriginales[1].y, 6);
  });

  it('eliminar conserva pausas ajenas intactas', () => {
    const original = [
      { tipo: 'avanzar', cm: 10 },
      { tipo: 'pausa', ms: 300 },
      { tipo: 'girar', grados: 45 },
      { tipo: 'avanzar', cm: 5 },
    ];
    const resultado = eliminarWaypoint(original, 1); // borra el segundo waypoint (el último)
    expect(resultado.find(p => p.tipo === 'pausa')).toEqual({ tipo: 'pausa', ms: 300 });
  });
});

describe('moverWaypoint / eliminarWaypoint en rutas simples (sin arcos)', () => {
  it('moverWaypoint reproduce el mismo resultado que reconstruir desde cero', () => {
    const original = primitivasDesdeWaypoints([{ x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]);
    const movido = moverWaypoint(original, 1, { x: 15, y: 15 });
    const puntos = waypointsDesdePrimitivas(movido);

    expect(puntos[0].x).toBeCloseTo(10, 6);
    expect(puntos[0].y).toBeCloseTo(0, 6);
    expect(puntos[1].x).toBeCloseTo(15, 6);
    expect(puntos[1].y).toBeCloseTo(15, 6);
    expect(puntos[2].x).toBeCloseTo(0, 6);
    expect(puntos[2].y).toBeCloseTo(10, 6);
  });

  it('eliminarWaypoint el primero dejando los demás en su lugar', () => {
    const original = primitivasDesdeWaypoints([{ x: 10, y: 0 }, { x: 10, y: 10 }]);
    const resultado = eliminarWaypoint(original, 0);
    const puntos = waypointsDesdePrimitivas(resultado);
    expect(puntos).toHaveLength(1);
    expect(puntos[0].x).toBeCloseTo(10, 6);
    expect(puntos[0].y).toBeCloseTo(10, 6);
  });

  it('índice fuera de rango no modifica la ruta', () => {
    const original = primitivasDesdeWaypoints([{ x: 10, y: 0 }]);
    expect(moverWaypoint(original, 5, { x: 1, y: 1 })).toBe(original);
    expect(eliminarWaypoint(original, -1)).toBe(original);
  });
});

describe('snapRelativoAAnterior', () => {
  const origen = { x: 0, y: 0 };

  it('ajusta el ángulo al múltiplo de 45° más cercano', () => {
    const objetivo = { x: Math.cos((47 * Math.PI) / 180) * 20, y: Math.sin((47 * Math.PI) / 180) * 20 };
    const snap = snapRelativoAAnterior(origen, objetivo);
    const anguloSnap = (Math.atan2(snap.y, snap.x) * 180) / Math.PI;
    expect(anguloSnap).toBeCloseTo(45, 6);
  });

  it('ajusta la distancia al múltiplo de 5cm más cercano', () => {
    const objetivo = { x: 13, y: 0 };
    const snap = snapRelativoAAnterior(origen, objetivo);
    expect(Math.hypot(snap.x, snap.y)).toBeCloseTo(15, 6);
  });

  it('respeta pasos de snap personalizados', () => {
    const objetivo = { x: 22, y: 0 };
    const snap = snapRelativoAAnterior(origen, objetivo, { distanciaCm: 10, anguloGrados: 90 });
    expect(Math.hypot(snap.x, snap.y)).toBeCloseTo(20, 6);
  });

  it('un objetivo igual al anterior no produce división por cero', () => {
    expect(snapRelativoAAnterior(origen, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});
