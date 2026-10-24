// @vitest-environment jsdom
// El chat muestra lo que el agente guardó y pide confirmar los cambios de pin que propuso (nunca los aplica solo).
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn(async () => null);
vi.mock('@tauri-apps/api/core', () => ({ invoke: (c: string, a?: unknown) => invoke(c, a) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: () => Promise.resolve(() => {}) }));

import AccionesAgente, { cambiosPropuestos, comandosGuardados, descargasEmpezadas, subidasPropuestas, textoCambio } from '@/features/chat/mensajes/AccionesAgente';
import { historialPara } from '@/features/chat/contextoAgente';
import type { AgentStep } from '@/features/chat/modos/types';

afterEach(cleanup);

const llamada = (name: string, input: object): AgentStep => ({ kind: 'tool_call', name, input: JSON.stringify(input) });
const resultado = (name: string, output: string): AgentStep => ({ kind: 'tool_result', name, output });

describe('lo que el agente hizo', () => {
  it('reconoce los comandos guardados', () => {
    expect(comandosGuardados([resultado('guardar_comando', 'Guardado en Comandos: «Temperatura» (vcgencmd measure_temp)')])).toEqual(['Temperatura']);
    expect(comandosGuardados([resultado('guardar_comando', 'No se pudo guardar: lleno')])).toEqual([]);
  });

  it('solo ofrece los cambios de pin que el backend dejó pendientes', () => {
    const pasos = [
      llamada('cambiar_pin', { gpio: 17, modo: 'salida', nivel: 1 }), resultado('cambiar_pin', 'PENDIENTE DE CONFIRMAR: GPIO 17'),
      llamada('cambiar_pin', { gpio: 40, nivel: 1 }), resultado('cambiar_pin', 'GPIO inválido'),
    ];
    const cambios = cambiosPropuestos(pasos);
    expect(cambios).toEqual([{ gpio: 17, modo: 'salida', nivel: 1, pull: undefined }]);
    expect(textoCambio(cambios[0])).toBe('modo salida, nivel alto');
  });

  it('el cambio se aplica solo al pulsar Aplicar', async () => {
    render(<AccionesAgente sessionId="s1" pasos={[llamada('cambiar_pin', { gpio: 17, modo: 'salida', nivel: 1 }), resultado('cambiar_pin', 'PENDIENTE DE CONFIRMAR')]} />);
    expect(invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() => expect(screen.getByText(/Listo: GPIO 17/)).toBeTruthy());
    expect(invoke).toHaveBeenCalledWith('rpi_pin_set_mode', { id: 's1', gpio: 17, mode: 'output' });
    expect(invoke).toHaveBeenCalledWith('rpi_pin_write_level', { id: 's1', gpio: 17, level: 1 });
  });

  it('Cancelar no toca el pin', () => {
    invoke.mockClear();
    render(<AccionesAgente sessionId="s1" pasos={[llamada('cambiar_pin', { gpio: 4, pull: 'arriba' }), resultado('cambiar_pin', 'PENDIENTE DE CONFIRMAR')]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText(/no cambió/)).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('archivos', () => {
  it('reconoce las descargas que empezó y dónde quedan', () => {
    expect(descargasEmpezadas([resultado('descargar_archivo', 'DESCARGANDO a C:\\Users\\ana\\Downloads\\datos (1).csv (desde /home/pi/datos.csv). El progreso se ve en Archivos.')]))
      .toEqual(['C:\\Users\\ana\\Downloads\\datos (1).csv']);
  });

  it('la subida solo se hace al pulsar Aplicar, y con el mismo nombre si el destino es una carpeta', async () => {
    invoke.mockClear();
    invoke.mockImplementation(async (c: string) => {
      if (c === 'local_list_dir') throw new Error('no es carpeta');
      if (c === 'sftp_upload_start') return { status: 'success', data: { transfer_id: 't1' } } as never;
      return null;
    });
    const pasos = [llamada('subir_archivo', { ruta_local: 'C:\\Users\\ana\\leds.py', ruta_remota: '/home/pi/proyecto/' }), resultado('subir_archivo', 'PENDIENTE DE CONFIRMAR: subir')];
    expect(subidasPropuestas(pasos)).toEqual([{ local: 'C:\\Users\\ana\\leds.py', remota: '/home/pi/proyecto/leds.py' }]);
    render(<AccionesAgente sessionId="s1" pasos={pasos} />);
    expect(invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() => expect(screen.getByText(/Subiendo «leds.py»/)).toBeTruthy());
    expect(invoke).toHaveBeenCalledWith('sftp_upload_start', expect.objectContaining({
      req: expect.objectContaining({ payload: { id: 's1', local_path: 'C:\\Users\\ana\\leds.py', remote_path: '/home/pi/proyecto/leds.py' } }),
    }));
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
