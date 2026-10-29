// @vitest-environment jsdom
// tests/unit/pruebaRobotEv3.test.tsx — «Probar con mi robot»: conexión directa con un EV3 de la red local.
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
// El gemelo 3D trae three.js: aquí basta un marcador.
vi.mock('@/app/diferidos', () => ({ Ev3Twin: () => <div>gemelo</div>, precargar: () => {} }));

import { PruebaRobotEv3 } from '@/features/practicas/ev3/PruebaRobotEv3';

const ESTADO = {
  connected: true, ip: 'ev3dev.local', battery: 7.9, alerts: [],
  motors: [{ port: 'outB', connected: true, speed: 0, position: 90 }], sensors: [],
};

beforeEach(() => {
  invoke.mockReset();
  localStorage.clear();
});
afterEach(cleanup);

const campo = () => screen.getByLabelText('Dirección del robot') as HTMLInputElement;

describe('Probar con mi robot', () => {
  it('antes de conectar explica qué debe estar listo en el robot', () => {
    render(<PruebaRobotEv3 onVolver={() => {}} />);
    expect(screen.getByText('Conecta tu robot')).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('conecta pasando la dirección al backend y la recuerda', async () => {
    invoke.mockResolvedValue(ESTADO);
    render(<PruebaRobotEv3 onVolver={() => {}} />);
    fireEvent.change(campo(), { target: { value: ' ev3dev.local ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Desconectar' })).toBeTruthy());
    expect(invoke).toHaveBeenCalledWith('ev3_status', { id: 'robot-directo', robot: 'ev3dev.local' });
    expect(localStorage.getItem('labremoto.ev3.robotDirecto')).toBe('ev3dev.local');
    expect(campo().disabled).toBe(true);
  });

  it('muestra el motivo si el backend rechaza la dirección', async () => {
    invoke.mockRejectedValue({ code: 'INVALID_INPUT', message: 'Solo se permiten direcciones de tu red local.' });
    render(<PruebaRobotEv3 onVolver={() => {}} />);
    fireEvent.change(campo(), { target: { value: 'ejemplo.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }));

    expect((await screen.findByRole('alert')).textContent).toContain('red local');
    expect(screen.queryByRole('button', { name: 'Desconectar' })).toBeNull();
  });

  it('sin dirección no llama al backend', () => {
    render(<PruebaRobotEv3 onVolver={() => {}} />);
    fireEvent.change(campo(), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }));
    expect(screen.getByRole('alert').textContent).toContain('Escribe la dirección');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('el escenario cambia entre el gemelo 3D y el editor de trayectorias', async () => {
    HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
    invoke.mockResolvedValue(ESTADO);
    render(<PruebaRobotEv3 onVolver={() => {}} />);
    fireEvent.change(campo(), { target: { value: 'ev3dev.local' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }));
    await screen.findByRole('button', { name: 'Desconectar' });

    expect(screen.getByText('gemelo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Trayectorias' }));
    expect(screen.queryByText('gemelo')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Editor de trayectorias' })).toBeTruthy();
  });

  it('al desconectar frena los motores del robot', async () => {
    invoke.mockResolvedValue(ESTADO);
    render(<PruebaRobotEv3 onVolver={() => {}} />);
    fireEvent.change(campo(), { target: { value: 'ev3dev.local' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }));
    const desconectar = await screen.findByRole('button', { name: 'Desconectar' });

    await act(async () => { fireEvent.click(desconectar); });
    expect(invoke).toHaveBeenCalledWith('ev3_stop_all', { id: 'robot-directo', port: null, robot: 'ev3dev.local' });
  });
});
