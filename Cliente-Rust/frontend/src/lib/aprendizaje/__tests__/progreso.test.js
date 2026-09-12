import { describe, it, expect, beforeEach } from 'vitest';

// Node (entorno de estos tests) no trae `localStorage` global como el
// navegador. En vez de sumar jsdom solo para esto, un mapa en memoria alcanza
// para probar cargarProgreso/guardarProgreso tal como los usa la app real.
if (typeof localStorage === 'undefined') {
  const almacen = new Map();
  globalThis.localStorage = {
    getItem: clave => (almacen.has(clave) ? almacen.get(clave) : null),
    setItem: (clave, valor) => almacen.set(clave, String(valor)),
    removeItem: clave => almacen.delete(clave),
    clear: () => almacen.clear(),
  };
}

import {
  progresoVacio,
  cargarProgreso,
  guardarProgreso,
  marcarPasoCompletado,
  pasoCompletado,
  contarPasosCompletados,
  moduloCompletado,
} from '../progreso.js';

describe('marcarPasoCompletado / pasoCompletado', () => {
  it('un paso recién creado no está completado', () => {
    expect(pasoCompletado(progresoVacio(), 'modulo-1', 'intro')).toBe(false);
  });

  it('marca un paso sin afectar otros módulos ni pasos', () => {
    let progreso = progresoVacio();
    progreso = marcarPasoCompletado(progreso, 'modulo-1', 'intro');
    expect(pasoCompletado(progreso, 'modulo-1', 'intro')).toBe(true);
    expect(pasoCompletado(progreso, 'modulo-1', 'quiz')).toBe(false);
    expect(pasoCompletado(progreso, 'modulo-2', 'intro')).toBe(false);
  });

  it('no muta el objeto original', () => {
    const original = progresoVacio();
    marcarPasoCompletado(original, 'modulo-1', 'intro');
    expect(original).toEqual(progresoVacio());
  });

  it('marcar el mismo paso dos veces es idempotente', () => {
    let progreso = progresoVacio();
    progreso = marcarPasoCompletado(progreso, 'modulo-1', 'intro');
    progreso = marcarPasoCompletado(progreso, 'modulo-1', 'intro');
    expect(pasoCompletado(progreso, 'modulo-1', 'intro')).toBe(true);
  });
});

describe('contarPasosCompletados / moduloCompletado', () => {
  const pasos = ['intro', 'sensores', 'quiz'];

  it('cuenta solo los pasos completados de la lista dada', () => {
    let progreso = progresoVacio();
    progreso = marcarPasoCompletado(progreso, 'modulo-1', 'intro');
    progreso = marcarPasoCompletado(progreso, 'modulo-1', 'quiz');
    expect(contarPasosCompletados(progreso, 'modulo-1', pasos)).toBe(2);
  });

  it('un módulo está completo solo cuando todos sus pasos lo están', () => {
    let progreso = progresoVacio();
    progreso = marcarPasoCompletado(progreso, 'modulo-1', 'intro');
    progreso = marcarPasoCompletado(progreso, 'modulo-1', 'sensores');
    expect(moduloCompletado(progreso, 'modulo-1', pasos)).toBe(false);
    progreso = marcarPasoCompletado(progreso, 'modulo-1', 'quiz');
    expect(moduloCompletado(progreso, 'modulo-1', pasos)).toBe(true);
  });

  it('una lista de pasos vacía nunca cuenta como completa', () => {
    expect(moduloCompletado(progresoVacio(), 'modulo-1', [])).toBe(false);
  });
});

describe('cargarProgreso / guardarProgreso', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      // entorno sin localStorage: los tests de esta sección igual deben pasar
    }
  });

  it('sin nada guardado, devuelve progreso vacío', () => {
    expect(cargarProgreso()).toEqual(progresoVacio());
  });

  it('guarda y vuelve a leer el mismo progreso', () => {
    const progreso = marcarPasoCompletado(progresoVacio(), 'modulo-1', 'intro');
    guardarProgreso(progreso);
    expect(cargarProgreso()).toEqual(progreso);
  });

  it('datos corruptos en el storage no rompen la carga', () => {
    try {
      localStorage.setItem('ev3_aprendizaje_progreso', '{esto no es json válido');
    } catch {
      return; // sin localStorage no aplica este caso
    }
    expect(cargarProgreso()).toEqual(progresoVacio());
  });
});
