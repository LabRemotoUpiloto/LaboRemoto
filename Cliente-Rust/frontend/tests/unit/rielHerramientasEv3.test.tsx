// @vitest-environment jsdom
// tests/unit/rielHerramientasEv3.test.tsx — riel de herramientas de la vista guiada de EV3 y el control por teclado,
// que no debe robarle letras al chat.
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RielHerramientas } from '@/features/practicas/ev3/RielHerramientas';
import { necesidadesDe } from '@/features/practicas/ev3/necesidadesEv3';
import KeyboardControl, { esCampoDeTexto } from '@/features/hardware/ev3/KeyboardControl';

afterEach(cleanup);

function armar(moduleId: string, abierta: Parameters<typeof RielHerramientas>[0]['abierta'] = null, tools?: Record<string, unknown>) {
  const onAlternar = vi.fn();
  const onVerTodo = vi.fn();
  render(<RielHerramientas necesidades={necesidadesDe(moduleId, tools)} abierta={abierta} onAlternar={onAlternar} onVerTodo={onVerTodo} />);
  return { onAlternar, onVerTodo, riel: screen.getByRole('navigation', { name: 'Herramientas del robot' }) };
}

describe('riel de herramientas EV3', () => {
  it('muestra las cuatro herramientas y dice cuál es nueva y cuáles no hacen falta', () => {
    armar('ev3-m1');
    expect(screen.getByRole('button', { name: 'Motores (nueva en este módulo)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sensores (no hace falta en este módulo)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Consola de Python (no hace falta en este módulo)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Estado del robot (no hace falta en este módulo)' })).toBeTruthy();
  });

  it('una herramienta con candado igual se puede abrir', () => {
    const { onAlternar } = armar('ev3-m1');
    fireEvent.click(screen.getByRole('button', { name: /^Sensores/ }));
    expect(onAlternar).toHaveBeenCalledWith('sensores');
  });

  it('marca la herramienta abierta con aria-pressed', () => {
    armar('ev3-m2', 'sensores');
    expect(screen.getByRole('button', { name: /^Sensores/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Motores' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('las herramientas ocultas no salen en el riel', () => {
    const { riel } = armar('ev3-m8', null, { avanzado: 'oculta' });
    expect(riel.querySelectorAll('[data-herramienta]')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /^Estado del robot/ })).toBeNull();
  });

  it('«Ver todo» pasa a la vista completa', () => {
    const { onVerTodo } = armar('ev3-m3');
    fireEvent.click(screen.getByRole('button', { name: /^Ver todo/ }));
    expect(onVerTodo).toHaveBeenCalledOnce();
  });
});

describe('control por teclado del robot', () => {
  it('distingue los campos donde se escribe', () => {
    const input = document.createElement('input');
    const rango = document.createElement('input');
    rango.type = 'range';
    expect(esCampoDeTexto(input)).toBe(true);
    expect(esCampoDeTexto(document.createElement('textarea'))).toBe(true);
    expect(esCampoDeTexto(rango)).toBe(false);
    expect(esCampoDeTexto(document.createElement('button'))).toBe(false);
    expect(esCampoDeTexto(null)).toBe(false);
  });

  it('escribir W/A/S/D en el chat no mueve el robot ni se pierde la letra', () => {
    const onSetSpeed = vi.fn();
    render(<><textarea aria-label="Mensaje" /><KeyboardControl status={null} onSetSpeed={onSetSpeed} /></>);
    const chat = screen.getByRole('textbox', { name: 'Mensaje' });
    const evento = new KeyboardEvent('keydown', { key: 'w', bubbles: true, cancelable: true });
    chat.dispatchEvent(evento);
    expect(onSetSpeed).not.toHaveBeenCalled();
    expect(evento.defaultPrevented).toBe(false);
  });

  it('fuera de un campo, W sigue moviendo el robot', () => {
    const onSetSpeed = vi.fn();
    render(<KeyboardControl status={null} onSetSpeed={onSetSpeed} />);
    fireEvent.keyDown(window, { key: 'w' });
    expect(onSetSpeed).toHaveBeenCalled();
  });
});
