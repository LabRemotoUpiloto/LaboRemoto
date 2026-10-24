// @vitest-environment jsdom
// Sidebar: secciones por lo que la persona viene a hacer (Aprender, Conectar, Laboratorio, Personas), cada rol ve solo
// lo suyo y «Temas» vive en el menú del usuario. Nueve entradas como mucho: Archivos y Mis comandos van en «Esta sesión»,
// Equipos guardados, Terminal local y Sesiones SSH en Conexiones, y Encuestas es una pestaña de Prácticas.
import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';

vi.mock('@tauri-apps/api/app', () => ({ getVersion: () => Promise.resolve('1.2.3') }));

import Sidebar from '@/app/layout/Sidebar';
import { useAppStore } from '@/store/app';

beforeAll(() => {
  // Mantine pide matchMedia y ResizeObserver, que jsdom no trae
  window.matchMedia ??= ((q: string) => ({
    matches: false, media: q, onchange: null, addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as never;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
});

afterEach(cleanup);

function armar(roles: string[], activePanel = 'landing') {
  act(() => useAppStore.setState({ user: { preferred_username: 'ana', roles } as never }));
  const onOpenPanel = vi.fn();
  render(
    <MantineProvider>
      <Sidebar activePanel={activePanel} onOpenPanel={onOpenPanel} />
    </MantineProvider>,
  );
  const nav = screen.getByRole('navigation', { name: 'Secciones' });
  const paginas = [...nav.querySelectorAll('[data-page]')].map((e) => e.getAttribute('data-page'));
  return { nav, paginas, onOpenPanel };
}

const abrirMenu = () => fireEvent.click(document.querySelector('[data-tour="sidebar-usuario"]')!);

describe('Sidebar', () => {
  it('el administrador ve las cuatro secciones en orden y Temas no está en la barra', () => {
    const { nav, paginas } = armar(['admin_lab']);
    for (const s of ['Aprender', 'Conectar', 'Laboratorio', 'Personas']) within(nav).getByText(s);
    expect(paginas).toEqual([
      'landing', 'practices', 'mis-cursos', 'reservas',
      'connect',
      'rendimiento', 'vigilancia',
      'dashboard', 'admin-users',
    ]);
  });

  it('el docente ve Conexiones (solo los registros de sesiones SSH)', () => {
    const { paginas } = armar(['docente']);
    expect(paginas).toEqual(['landing', 'practices', 'mis-cursos', 'reservas', 'connect']);
  });

  it('las páginas que viven dentro de otra marcan su entrada: Sesiones SSH en Conexiones, Encuestas en Prácticas', () => {
    let { nav } = armar(['admin_lab'], 'logs');
    expect(nav.querySelector('[aria-current="page"]')?.getAttribute('data-page')).toBe('connect');
    cleanup();
    ({ nav } = armar(['admin_lab'], 'encuestas'));
    expect(nav.querySelector('[aria-current="page"]')?.getAttribute('data-page')).toBe('practices');
  });

  it('el estudiante solo ve Aprender (Inicio y Prácticas): las secciones vacías no aparecen', () => {
    const { nav, paginas } = armar([]);
    expect(paginas).toEqual(['landing', 'practices']);
    for (const s of ['Conectar', 'Laboratorio', 'Personas']) expect(within(nav).queryByText(s)).toBeNull();
  });

  it('Temas se abre desde el menú del usuario', async () => {
    const { onOpenPanel } = armar(['admin_lab']);
    abrirMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Temas' }));
    expect(onOpenPanel).toHaveBeenCalledWith('themes');
  });

  it('quien usa el tema institucional no ve Temas en el menú', async () => {
    armar(['laboratorista']);
    abrirMenu();
    await screen.findByRole('menuitem', { name: 'Perfil' });
    expect(screen.queryByRole('menuitem', { name: 'Temas' })).toBeNull();
  });

  it('«Saltar al contenido» lleva el foco a main#contenido', () => {
    armar(['admin_lab']);
    const main = document.createElement('main');
    main.id = 'contenido';
    main.tabIndex = -1;
    document.body.appendChild(main);
    fireEvent.click(screen.getByRole('link', { name: 'Saltar al contenido' }));
    expect(document.activeElement).toBe(main);
    main.remove();
  });
});

describe('Esta sesión', () => {
  function sesion(roles: string[]) {
    act(() => useAppStore.setState({ user: { preferred_username: 'ana', roles } as never }));
    const onOpenPanel = vi.fn();
    render(
      <MantineProvider>
        <Sidebar activePanel="terminal" onOpenPanel={onOpenPanel} showSessionActions onViewChange={() => {}} onToggleChat={() => {}} />
      </MantineProvider>,
    );
    return { onOpenPanel };
  }

  it('Archivos y Mis comandos se abren desde la sesión abierta (ya no son entradas del menú)', () => {
    const { onOpenPanel } = sesion(['semillerista']);
    screen.getByText('Esta sesión');
    fireEvent.click(screen.getByRole('button', { name: 'Archivos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mis comandos' }));
    expect(onOpenPanel.mock.calls).toEqual([['sftp'], ['snippets']]);
  });

  it('quien no opera equipos no los ve', () => {
    sesion(['laboratorista']);
    screen.getByText('Esta sesión');
    expect(screen.queryByRole('button', { name: 'Archivos' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mis comandos' })).toBeNull();
  });
});

describe('Esta sesión en un mosaico', () => {
  function mosaico(roles: string[], local: boolean) {
    act(() => useAppStore.setState({ user: { preferred_username: 'ana', roles } as never }));
    render(
      <MantineProvider>
        <Sidebar activePanel="terminal" onOpenPanel={() => {}} sesionMosaico="s1" sesionMosaicoLocal={local} />
      </MantineProvider>,
    );
    return screen.getAllByRole('button', { pressed: undefined }).filter((b) => b.hasAttribute('aria-pressed')).map((b) => b.getAttribute('aria-label'));
  }

  it('en una sesión SSH: las siete herramientas, con la terminal visible al empezar', () => {
    expect(mosaico(['admin_lab'], false)).toEqual(['Terminal', 'Chat', 'Cámara', 'Escritorio remoto', 'Pines', 'Archivos del servidor', 'Comandos']);
    expect(screen.getByRole('button', { name: 'Terminal' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('en la terminal local: solo Terminal y Comandos', () => {
    expect(mosaico(['admin_lab'], true)).toEqual(['Terminal', 'Comandos']);
  });

  it('quien no opera equipos no ve Archivos ni Comandos', () => {
    expect(mosaico(['laboratorista'], false)).toEqual(['Terminal', 'Chat', 'Cámara', 'Escritorio remoto', 'Pines']);
  });
});
