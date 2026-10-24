// @vitest-environment jsdom
// Conexiones: una sola página para conectarse (equipos del laboratorio, guardados, recientes, nueva conexión y terminal
// local) con los registros de sesiones SSH en una pestaña. Cada rol ve solo su parte.
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (cmd: string, args?: unknown) => invoke(cmd, args) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: () => Promise.resolve(() => {}) }));
vi.mock('@/app/providers/ToastContext', () => ({ useToasts: () => ({ push: vi.fn() }) }));
vi.mock('@/app/providers/LoadingContext', () => ({ useLoading: () => ({ setLoading: vi.fn(), loading: false }) }));

import ConexionesPage from '@/features/conexion/ConexionesPage';
import { useAppStore } from '@/store/app';

const guardado = (file: string, name: string, host: string, user: string) =>
  ({ file, payload: { name, host, port: 22, user, password: 'x' } });

beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({
    matches: false, media: q, onchange: null, addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as never;
});

beforeEach(() => {
  try { window.localStorage.removeItem('ssh-recent-connections-v1'); } catch { /* Node 25 trae un localStorage a medias */ }
  invoke.mockReset();
  invoke.mockImplementation(async (cmd: string) => {
    if (cmd === 'list_hosts_entries') return [guardado('a.json.enc', 'Servidor de pruebas', '10.0.0.5', 'ubuntu')];
    if (cmd === 'list_session_logs') return [];
    return null;
  });
});

afterEach(cleanup);

function armar(roles: string[], pestanaInicial?: 'equipos' | 'registros') {
  act(() => useAppStore.setState({ user: { preferred_username: 'ana', roles } as never }));
  const onConnected = vi.fn();
  render(<ConexionesPage onConnected={onConnected} pestanaInicial={pestanaInicial} />);
  return { onConnected };
}

describe('Conexiones', () => {
  it('quien se conecta ve las pestañas, Terminal local, Nueva conexión y sus equipos', async () => {
    armar(['admin_lab']);
    expect(screen.getByRole('button', { name: 'Equipos' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Registros' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Terminal local/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Nueva conexión/ })).toBeTruthy();
    expect(await screen.findByText('Servidor de pruebas')).toBeTruthy();
    expect(screen.getByText('Raspberry Pi 4')).toBeTruthy();
  });

  it('el docente solo ve los registros: sin pestañas ni botones para conectarse', async () => {
    armar(['docente']);
    expect(await screen.findByText('Todavía no hay sesiones SSH registradas')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Equipos' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Nueva conexión/ })).toBeNull();
    expect(invoke).not.toHaveBeenCalledWith('list_hosts_entries', undefined);
  });

  it('abre en Registros cuando se llega desde un enlace viejo a Sesiones SSH', async () => {
    armar(['admin_lab'], 'registros');
    expect(await screen.findByText('Todavía no hay sesiones SSH registradas')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Registros' }).getAttribute('aria-current')).toBe('page');
  });

  it('Terminal local abre una pestaña nueva por el evento de siempre', () => {
    armar(['semillerista']);
    const oyente = vi.fn();
    window.addEventListener('app:open-local-terminal', oyente);
    fireEvent.click(screen.getByRole('button', { name: /Terminal local/ }));
    window.removeEventListener('app:open-local-terminal', oyente);
    expect(oyente).toHaveBeenCalledTimes(1);
  });

  it('Nueva conexión abre el diálogo y no deja conectar hasta llenar los datos', async () => {
    armar(['admin_lab']);
    fireEvent.click(screen.getByRole('button', { name: /Nueva conexión/ }));
    const dialogo = await screen.findByRole('dialog');
    const conectar = within(dialogo).getByRole('button', { name: /Conectar/ }) as HTMLButtonElement;
    expect(conectar.disabled).toBe(true);
    fireEvent.change(within(dialogo).getByLabelText('Host'), { target: { value: '10.0.0.9' } });
    fireEvent.change(within(dialogo).getByLabelText('Usuario'), { target: { value: 'ubuntu' } });
    fireEvent.change(within(dialogo).getByLabelText('Contraseña'), { target: { value: 'secreta' } });
    expect(conectar.disabled).toBe(false);
  });

  it('la Pi del laboratorio abre el diálogo con la dirección ya puesta (sin campos de host)', async () => {
    armar(['admin_lab']);
    fireEvent.click(within(screen.getByText('Raspberry Pi 4').closest('[role="row"]') ?? document.body).getByRole('button', { name: /Conectar/ }));
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText('Conectar a la Raspberry Pi 4')).toBeTruthy();
    expect(within(dialogo).queryByLabelText('Host')).toBeNull();
  });

  it('eliminar un equipo pide confirmación y lo borra', async () => {
    armar(['admin_lab']);
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar Servidor de pruebas' }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: /Eliminar/ }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('delete_host_file', { id: 'a.json.enc' }));
    await waitFor(() => expect(screen.queryByText('Servidor de pruebas')).toBeNull());
  });
});
