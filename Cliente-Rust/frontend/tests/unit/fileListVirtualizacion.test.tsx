// @vitest-environment jsdom
// FileList dibuja solo las filas que caben en pantalla (virtualización a mano). Si el usuario baja por una carpeta
// larga y entra a otra corta, el desplazamiento guardado quedaba fuera de rango y la lista se veía EN BLANCO aunque
// la carpeta tuviera archivos (la barra de desplazamiento seguía mostrando un contenido largo). Esta prueba lo fija.
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import FileList from '@/features/sftp/FileList';

const ALTO_VIEWPORT = 300;

beforeAll(() => {
  // jsdom no mide nada: el viewport mide 0 y FileList, antes de medir, pinta todo. Se simula una altura real.
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => ALTO_VIEWPORT });
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
  window.matchMedia ??= ((q: string) => ({
    matches: false, media: q, onchange: null, addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as never;
});

afterEach(cleanup);

const entradas = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `archivo-${i}.txt`, kind: 'file', size: 10, mtime: 0 }));

const lista = (entries: ReturnType<typeof entradas>) => (
  <MantineProvider>
    <FileList
      entries={entries as never}
      loading={false}
      selectedPaths={new Set()}
      onSelectOnly={vi.fn()}
      onToggleSelect={vi.fn()}
      onSelectRange={vi.fn()}
      onClearSelection={vi.fn()}
      onOpen={vi.fn()}
      onContextMenu={vi.fn()}
      sortKey="name"
      sortDir="asc"
      onSort={vi.fn()}
      getEntryPath={(e) => (e as { name: string }).name}
    />
  </MantineProvider>
);

const viewport = (c: HTMLElement) => c.querySelector('.mantine-ScrollArea-viewport') as HTMLElement;

describe('FileList: virtualización', () => {
  it('muestra solo una ventana de filas en una lista larga', () => {
    render(lista(entradas(300)));
    expect(screen.queryByText('archivo-0.txt')).not.toBeNull();
    expect(screen.queryByText('archivo-299.txt')).toBeNull();
  });

  it('tras bajar por una lista larga y pasar a una corta, sigue mostrando los archivos (no se queda en blanco)', () => {
    const { container, rerender } = render(lista(entradas(300)));
    // El usuario baja hasta la fila ~178
    fireEvent.scroll(viewport(container), { target: { scrollTop: 5000 } });
    expect(screen.queryByText('archivo-0.txt')).toBeNull();
    // Entra a una carpeta con 5 archivos: el contenedor del scroll sigue "desplazado" en el estado de React
    rerender(lista(entradas(5)));
    for (let i = 0; i < 5; i++) {
      expect(screen.queryByText(`archivo-${i}.txt`), `archivo-${i}.txt`).not.toBeNull();
    }
  });

  it('con el desplazamiento al final de una lista que se acorta, muestra las últimas filas', () => {
    const { container, rerender } = render(lista(entradas(300)));
    fireEvent.scroll(viewport(container), { target: { scrollTop: 8000 } });
    rerender(lista(entradas(40)));
    expect(screen.queryByText('archivo-39.txt')).not.toBeNull();
  });
});
