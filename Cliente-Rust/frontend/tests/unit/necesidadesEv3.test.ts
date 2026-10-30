// tests/unit/necesidadesEv3.test.ts — matriz de herramientas por módulo de la vista guiada de EV3 y tramos de la barra.
import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HERRAMIENTAS_EV3, NECESIDADES_EV3, herramientasVisibles, necesidadesDe,
} from '@/features/practicas/ev3/necesidadesEv3';
import { tramosDe } from '@/features/practicas/ev3/BarraMisionEv3';
import { MIN_ESCENARIO, repartoAncho } from '@/features/practicas/ev3/repartoAncho';

const ROOT = resolve(__dirname, '../../../../infra/practicas-ev3');
if (!existsSync(ROOT)) throw new Error(`No están los módulos EV3 en ${ROOT}`);
const idsModulos = readdirSync(ROOT).filter((d) => /^ev3-m\d+$/.test(d));

describe('necesidades de cada módulo de EV3', () => {
  it('todo módulo de infra/practicas-ev3 tiene su fila en la matriz', () => {
    expect(idsModulos.length).toBeGreaterThan(0);
    for (const id of idsModulos) expect(NECESIDADES_EV3[id], id).toBeDefined();
  });

  it('cada fila dice el estado de las cuatro herramientas', () => {
    for (const [id, n] of Object.entries(NECESIDADES_EV3)) {
      expect(Object.keys(n.herramientas).sort(), id).toEqual([...HERRAMIENTAS_EV3].sort());
    }
  });

  it('la herramienta que se abre sola no está bloqueada ni oculta', () => {
    for (const [id, n] of Object.entries(NECESIDADES_EV3)) {
      if (n.abierta) expect(['inicio', 'paso'], id).toContain(n.herramientas[n.abierta]);
    }
  });

  it('el módulo 1 marca los motores como nuevos y deja el resto con candado', () => {
    const n = necesidadesDe('ev3-m1');
    expect(n.herramientas).toEqual({ motores: 'paso', sensores: 'bloqueada', consola: 'bloqueada', avanzado: 'bloqueada' });
    expect(n.abierta).toBeNull();
  });

  it('en Python para robots la consola se abre sola', () => {
    expect(necesidadesDe('ev3-m5').abierta).toBe('consola');
  });

  it('un módulo que no está en la tabla tiene todo disponible', () => {
    const n = necesidadesDe('ev3-m42');
    expect(herramientasVisibles(n)).toEqual(HERRAMIENTAS_EV3);
    expect(Object.values(n.herramientas).every((e) => e === 'inicio')).toBe(true);
  });

  it('environment.tools del módulo manda sobre la tabla', () => {
    const n = necesidadesDe('ev3-m1', { sensores: 'inicio', avanzado: 'oculta', abierta: 'motores' });
    expect(n.herramientas.sensores).toBe('inicio');
    expect(n.herramientas.avanzado).toBe('oculta');
    expect(n.abierta).toBe('motores');
    expect(herramientasVisibles(n)).toEqual(['motores', 'sensores', 'consola']);
  });

  it('lo mal escrito en environment.tools se ignora', () => {
    const n = necesidadesDe('ev3-m1', { motores: 'abierto', camara: 'inicio', abierta: 'terminal' });
    expect(n).toEqual(necesidadesDe('ev3-m1'));
  });

  it('una herramienta oculta no se abre sola', () => {
    expect(necesidadesDe('ev3-m5', { consola: 'oculta' }).abierta).toBeNull();
    expect(necesidadesDe('ev3-m5', { abierta: 'ninguna' }).abierta).toBeNull();
  });
});

describe('tramos de la barra de misión', () => {
  it('sin total no hay tramos', () => {
    expect(tramosDe(null, false)).toEqual([]);
    expect(tramosDe({ titulo: 'x', numero: null, total: null }, false)).toEqual([]);
  });

  it('los anteriores al paso actual están hechos', () => {
    expect(tramosDe({ titulo: 'x', numero: 3, total: 5 }, false))
      .toEqual(['hecho', 'hecho', 'actual', 'pendiente', 'pendiente']);
  });

  it('práctica completa: todos hechos', () => {
    expect(tramosDe({ titulo: 'x', numero: 2, total: 3 }, true)).toEqual(['hecho', 'hecho', 'hecho']);
  });

  it('un número fuera de rango no rompe la barra', () => {
    expect(tramosDe({ titulo: 'x', numero: 9, total: 2 }, false)).toEqual(['hecho', 'actual']);
    expect(tramosDe({ titulo: 'x', numero: 0, total: 2 }, false)).toEqual(['actual', 'pendiente']);
  });
});

describe('reparto del ancho de la vista guiada', () => {
  it('pantalla ancha: la guía conserva su ancho y el cajón empuja al escenario', () => {
    const r = repartoAncho(1680, 400, true, 460);
    expect(r).toEqual({ guia: 400, derecha: 452, cajonFlota: false });
    expect(1680 - r.derecha - 460).toBeGreaterThanOrEqual(MIN_ESCENARIO);
  });

  it('pantalla mediana: el cajón flota para no aplastar el escenario', () => {
    expect(repartoAncho(1180, 400, true, 320).cajonFlota).toBe(true);
  });

  it('pantalla angosta: la guía se angosta hasta su mínimo, nunca menos', () => {
    expect(repartoAncho(900, 400, true, 0).guia).toBe(400);
    expect(repartoAncho(800, 400, true, 0).guia).toBe(328);
    expect(repartoAncho(700, 400, true, 0).guia).toBe(320);
  });

  it('sin guía ni cajón, todo es escenario', () => {
    expect(repartoAncho(1000, 400, false, 0)).toEqual({ guia: 0, derecha: 48, cajonFlota: false });
  });
});
