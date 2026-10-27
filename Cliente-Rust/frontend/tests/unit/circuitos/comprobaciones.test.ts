import { describe, expect, it } from 'vitest';
import { corrienteLed, evaluar, valorResistencia } from '@/features/circuitos/comprobaciones';
import type { EstadoSimulador } from '@/features/circuitos/simulador';

const estado = (parcial: Partial<EstadoSimulador> = {}): EstadoSimulador => ({
  componentes: [{ id: 'r1', tipo: 'resistor', propiedades: { value: '390' } }],
  cables: [],
  redes: { 'led1:A': 'n1', 'led1:C': 'n2', 'r1:1': 'n0' },
  voltajes: {},
  corrientes: { v_led1_sense: 0.0178 },
  quemadas: [],
  convergio: true,
  error: null,
  ...parcial,
});

describe('corrienteLed', () => {
  it('lee la fuente de sensado del LED y la deja positiva', () => {
    expect(corrienteLed(estado({ corrientes: { v_led1_sense: -0.012 } }), 'led1')).toBeCloseTo(0.012);
  });
  it('sin dato devuelve null', () => {
    expect(corrienteLed(estado({ corrientes: {} }), 'led1')).toBeNull();
  });
});

describe('valorResistencia', () => {
  it.each([['330', 330], ['1k', 1000], ['4.7k', 4700], ['1M', 1e6]])('%s → %d Ω', (v, ohm) => {
    expect(valorResistencia(estado({ componentes: [{ id: 'r1', tipo: 'resistor', propiedades: { value: v } }] }), 'r1')).toBe(ohm);
  });
});

describe('evaluar', () => {
  const rango = { id: 'x', type: 'led_current', led: 'led1', min: 0.015, max: 0.02, text: '' } as const;

  it('sin estado todavía, todo falta', () => {
    expect(evaluar(rango, null)).toBe('falta');
  });
  it('corriente dentro del rango', () => {
    expect(evaluar(rango, estado())).toBe('bien');
  });
  it('corriente fuera del rango: hay que revisar', () => {
    expect(evaluar(rango, estado({ corrientes: { v_led1_sense: 0.07 } }))).toBe('mal');
  });
  it('LED apagado (circuito abierto): falta, no está mal', () => {
    expect(evaluar(rango, estado({ corrientes: { v_led1_sense: 0 } }))).toBe('falta');
    expect(evaluar({ id: 'x', type: 'led_on', led: 'led1', text: '' }, estado({ corrientes: { v_led1_sense: 0 } }))).toBe('falta');
  });
  it('LED quemado', () => {
    expect(evaluar(rango, estado({ quemadas: ['led1'] }))).toBe('mal');
    expect(evaluar({ id: 'x', type: 'not_burnt', parts: ['led1', 'r1'], text: '' }, estado({ quemadas: ['r1'] }))).toBe('mal');
    expect(evaluar({ id: 'x', type: 'led_on', led: 'led1', text: '' }, estado({ quemadas: ['led1'] }))).toBe('falta');
  });
  it('pieza conectada si alguno de sus pines tiene red', () => {
    expect(evaluar({ id: 'x', type: 'connected', part: 'r1', text: '' }, estado())).toBe('bien');
    expect(evaluar({ id: 'x', type: 'connected', part: 'bat', text: '' }, estado())).toBe('falta');
  });
});
