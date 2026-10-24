// @vitest-environment jsdom
// Sidebar: secciones por lo que la persona viene a hacer (Aprender · Conectar · Laboratorio · Personas), cada rol ve solo
// lo suyo y «Temas» vive en el menú del usuario.
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

function armar(roles: string[]) {
  act(() => useAppStore.setState({ user: { preferred_username: 'ana', roles } as never }));
  const onOpenPanel = vi.fn();
  render(
    <MantineProvider>
      <Sidebar activePanel="landing" onOpenPanel={onOpenPanel} />
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
      'connect', 'hosts', 'local-terminal-new', 'sftp', 'snippets',
      'rendimiento', 'vigilancia',
      'dashboard', 'admin-users', 'logs',
    ]);
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
