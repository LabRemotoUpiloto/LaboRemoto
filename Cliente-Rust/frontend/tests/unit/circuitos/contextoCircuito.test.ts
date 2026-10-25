import { describe, expect, it } from 'vitest';
import { contextoTutorCircuito, describirCircuito } from '@/features/circuitos/contextoCircuito';
import type { PracticaCircuito } from '@/features/circuitos/practicas';
import type { EstadoSimulador } from '@/features/circuitos/simulador';

const practica: PracticaCircuito = {
  id: 'circ-m1', order: 1, title: 'Ley de Ohm', difficulty: 'inicial', estimated_minutes: 20, objective: 'Encender el LED.',
  intro: 'Hola.', outro: 'Listo.',
  steps: [{ id: 'armar', title: 'Arma el circuito', text: 'Pon todo en la protoboard.', checks: ['enciende'] }],
  circuit: { components: [], wires: [] },
  checks: [{ id: 'enciende', type: 'led_on', led: 'led1', text: 'El LED enciende' }],
  readings: [],
  parts: { bat: 'pila de 9 V', r1: 'resistencia R1', led1: 'LED rojo', bb1: 'protoboard mini' },
  tutor_context: 'Guía con preguntas.',
};

// Lo que mandó el simulador con el circuito completo en la protoboard (redes y valores reales de ngspice, recortados)
const completo: EstadoSimulador = {
  componentes: [
    { id: 'bb1', tipo: 'breadboard-mini', propiedades: {} },
    { id: 'bat', tipo: 'battery-9v', propiedades: {} },
    { id: 'r1', tipo: 'resistor', propiedades: { value: '390' } },
    { id: 'led1', tipo: 'led', propiedades: { color: 'red' } },
  ],
  cables: [],
  redes: {
    'bat:+': 'n0', 'bb1:3t.a': 'n0', 'r1:1': 'n0', 'bb1:3t.c': 'n0',
    'r1:2': 'n1', 'bb1:7t.c': 'n1', 'led1:A': 'n1', 'bb1:7t.d': 'n1',
    'led1:C': 'n2', 'bb1:9t.d': 'n2', 'bat:−': 'n2', 'bb1:9t.a': 'n2',
  },
  voltajes: { n0: 8.97, n1: 1.85, n2: 0 },
  corrientes: { v_led1_sense: 0.0183 },
  quemadas: [],
  convergio: true,
  error: null,
};

describe('describirCircuito', () => {
  const texto = describirCircuito(practica, completo);

  it('nombra las piezas como la práctica, con su valor y color', () => {
    expect(texto).toContain('resistencia R1 [r1] de 390 Ω');
    expect(texto).toContain('LED rojo [led1] (rojo)');
    expect(texto).not.toContain('protoboard mini [bb1]');
  });

  it('dice qué queda unido, con voltaje respecto del − de la pila y las columnas de la protoboard', () => {
    expect(texto).toContain('Unidos (1,85 V respecto del − de la pila): pata 2 de resistencia R1 + ánodo (pata larga, A) de LED rojo');
    expect(texto).toContain('columna 7 de arriba (fila c)');
  });

  it('dice si el LED enciende y con cuánta corriente', () => {
    expect(texto).toContain('LED rojo: encendido, 18,3 mA');
  });

  it('señala los pines sueltos y no inventa voltajes sin el − de la pila', () => {
    const redes = Object.fromEntries(Object.entries(completo.redes).filter(([k]) => k !== 'bat:−' && k !== 'bb1:9t.a'));
    const abierto = describirCircuito(practica, { ...completo, redes, corrientes: { v_led1_sense: 0 } });
    expect(abierto).toContain('Sin conectar: borne − de pila de 9 V.');
    expect(abierto).not.toContain('respecto del − de la pila');
    expect(abierto).toContain('LED rojo: apagado');
  });

  it('sin conexiones no muestra el aviso «no vectors» de ngspice', () => {
    const vacio = describirCircuito(practica, { ...completo, redes: {}, voltajes: {}, corrientes: {}, error: 'Error: There are no vectors currently active.' });
    expect(vacio).toContain('Conexiones: ninguna todavía');
    expect(vacio).not.toContain('no vectors');
  });
});

describe('contextoTutorCircuito', () => {
  it('lleva las reglas, el contexto de la práctica, las comprobaciones y el circuito', () => {
    const ctx = contextoTutorCircuito(practica, completo, new Set());
    expect(ctx).toContain('PASO EN EL QUE VA AHORA: 1. Arma el circuito');
    expect(contextoTutorCircuito(practica, completo, new Set(['armar']))).toContain('YA TERMINÓ TODOS LOS PASOS');
    expect(ctx).toContain('MODO PRÁCTICA DE CIRCUITOS');
    expect(ctx).toContain('Guía con preguntas.');
    expect(ctx).toContain('- El LED enciende: cumplida');
    expect(ctx).toContain('SU CIRCUITO AHORA:');
  });
});
