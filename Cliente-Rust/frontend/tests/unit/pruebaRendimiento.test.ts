import { describe, it, expect, beforeEach, vi } from 'vitest';

// Entorno node: un localStorage mínimo para comprobar que la prueba queda guardada en el equipo.
const almacen = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => almacen.get(k) ?? null,
  setItem: (k: string, v: string) => { almacen.set(k, v); },
  removeItem: (k: string) => { almacen.delete(k); },
});
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import type { MuestraPi } from '../../src/services/rendimiento.service';
import {
  agregarMuestras, descartarPrueba, iniciarPrueba, pruebaActual, terminarPrueba,
} from '../../src/services/pruebaRendimiento';

const m = (t: number) => ({ t, api: { peticiones: 0, errores: 0 } }) as unknown as MuestraPi;
const guardada = () => JSON.parse(almacen.get('labo:rendimiento:prueba:v1') ?? 'null');

describe('prueba de rendimiento guardada en el equipo', () => {
  beforeEach(() => descartarPrueba());

  it('al iniciar se guarda con las muestras de su tramo', () => {
    iniciarPrueba(10, [m(5), m(10), m(12)]);
    expect(pruebaActual()).toMatchObject({ inicio: 10, fin: null });
    expect(guardada().muestras.map((x: MuestraPi) => x.t)).toEqual([10, 12]);
  });

  it('suma muestras nuevas sin repetir ni volver atrás', () => {
    iniciarPrueba(10);
    agregarMuestras([m(8), m(12), m(14)]);
    agregarMuestras([m(14), m(16)]);
    expect(pruebaActual()!.muestras.map((x) => x.t)).toEqual([12, 14, 16]);
  });

  it('terminada ya no graba más, pero sigue guardada para ver el resumen', () => {
    iniciarPrueba(10);
    agregarMuestras([m(12)]);
    terminarPrueba(13);
    agregarMuestras([m(20)]);
    expect(pruebaActual()).toMatchObject({ fin: 13 });
    expect(guardada().muestras.map((x: MuestraPi) => x.t)).toEqual([12]);
  });

  it('descartar la borra del equipo', () => {
    iniciarPrueba(10);
    descartarPrueba();
    expect(pruebaActual()).toBeNull();
    expect(almacen.has('labo:rendimiento:prueba:v1')).toBe(false);
  });
});
