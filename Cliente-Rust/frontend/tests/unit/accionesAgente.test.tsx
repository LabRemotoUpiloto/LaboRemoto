// @vitest-environment jsdom
// El chat muestra lo que el agente hizo y pide confirmar lo que propuso, leyendo la `accion` de cada paso (no el texto).
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn(async (_c: string, _a?: unknown): Promise<unknown> => null);
vi.mock('@tauri-apps/api/core', () => ({ invoke: (c: string, a?: unknown) => invoke(c, a) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: () => Promise.resolve(() => {}) }));

import AccionesAgente, { accionesDe, textoCambio } from '@/features/chat/mensajes/AccionesAgente';
import { historialPara } from '@/features/chat/contextoAgente';
import type { AccionAgente } from '@/bindings/AccionAgente';
import type { AgentStep } from '@/features/chat/modos/types';

afterEach(() => { cleanup(); invoke.mockClear(); });

const paso = (accion?: AccionAgente, output = 'texto para el modelo'): AgentStep => ({ kind: 'tool_result', name: 'x', output, accion });
const pin: AccionAgente = { tipo: 'cambioPin', gpio: 17, modo: 'salida', pull: null, nivel: 1 };

describe('acciones del agente', () => {
  it('se leen del dato del paso, no del texto', () => {
    const pasos = [paso(pin, 'cualquier texto'), paso(undefined, 'PENDIENTE DE CONFIRMAR: GPIO 4')];
    expect(accionesDe(pasos, 'cambioPin')).toEqual([pin]);
    expect(textoCambio(accionesDe(pasos, 'cambioPin')[0])).toBe('modo salida, nivel alto');
  });

  it('muestra el comando guardado y la descarga', () => {
    render(<AccionesAgente sessionId="s1" pasos={[
      paso({ tipo: 'comandoGuardado', titulo: 'Temperatura', comando: 'vcgencmd measure_temp' }),
      paso({ tipo: 'descarga', rutaLocal: 'C:\\Users\\ana\\Downloads\\datos (1).csv', rutaRemota: '/home/pi/datos.csv' }),
    ]} />);
    expect(screen.getByText('Guardé «Temperatura» en Comandos.')).toBeTruthy();
    expect(screen.getByText(/Descargando «datos \(1\)\.csv» a Descargas/)).toBeTruthy();
  });

  it('el cambio de pin se aplica solo al pulsar Aplicar', async () => {
    render(<AccionesAgente sessionId="s1" pasos={[paso(pin)]} />);
    expect(invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() => expect(screen.getByText(/Listo: GPIO 17/)).toBeTruthy());
    expect(invoke).toHaveBeenCalledWith('rpi_pin_set_mode', { id: 's1', gpio: 17, mode: 'output' });
    expect(invoke).toHaveBeenCalledWith('rpi_pin_write_level', { id: 's1', gpio: 17, level: 1 });
  });

  it('Cancelar no toca nada', () => {
    render(<AccionesAgente sessionId="s1" pasos={[paso({ tipo: 'cambioPin', gpio: 4, modo: null, pull: 'arriba', nivel: null })]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText(/no cambió/)).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('la subida va por el comando único del backend, al pulsar Aplicar', async () => {
    render(<AccionesAgente sessionId="s1" pasos={[paso({ tipo: 'subida', rutaLocal: 'C:\\Users\\ana\\leds.py', rutaRemota: '/home/pi/proyecto/leds.py', esCarpeta: false })]} />);
    expect(screen.getByText(/Voy a subir el archivo/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() => expect(screen.getByText(/Subiendo «leds.py»/)).toBeTruthy());
    expect(invoke).toHaveBeenCalledWith('sftp_subir', { id: 's1', rutaLocal: 'C:\\Users\\ana\\leds.py', rutaRemota: '/home/pi/proyecto/leds.py' });
  });
});

it('el historial deja fuera los mensajes del sistema y los vacíos', () => {
  expect(historialPara([
    { id: '1', sender: 'system', text: 'aviso' },
    { id: '2', sender: 'user', text: 'hola' },
    { id: '3', sender: 'ai', text: '' },
    { id: '4', sender: 'ai', text: '¿en qué te ayudo?' },
  ] as never)).toEqual([{ rol: 'user', texto: 'hola' }, { rol: 'assistant', texto: '¿en qué te ayudo?' }]);
});
