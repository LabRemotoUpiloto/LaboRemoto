// @vitest-environment jsdom
// Si el estudiante vuelve a un paso del escritorio remoto que ya completó (o al de cerrarlo), tiene que poder ver la
// interfaz gráfica otra vez y volver a cerrarla. Antes la tarjeta solo decía «¡Listo!» y no había cómo reabrirla.
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/practicas/linuxPractice.service', () => ({ linuxGetMedia: vi.fn(), linuxGetMediaUrl: vi.fn() }));

import { BlockView } from '@/features/practicas/linux/blocks/BlockRenderer';
import type { LinuxBlock } from '@/features/practicas/linuxPractice.service';
import {
  EVENTO_DETENER_ESCRITORIO, EVENTO_VISTA_PRACTICA, marcarAccionEscritorio, olvidarAccionesEscritorio,
} from '@/features/practicas/linux/escritorioPractica';

beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({
    matches: false, media: q, onchange: null, addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as never;
});

afterEach(() => {
  cleanup();
  olvidarAccionesEscritorio();
});

const escuchar = (evento: string) => {
  const vistos: unknown[] = [];
  const alOir = (ev: Event) => vistos.push((ev as CustomEvent).detail);
  document.addEventListener(evento, alOir);
  return { vistos, dejar: () => document.removeEventListener(evento, alOir) };
};

const pintar = (block: LinuxBlock) =>
  render(
    <MantineProvider>
      <BlockView block={block} rules={[]} result={null} practiceId="linux-m1" sessionId="s1" />
    </MantineProvider>,
  );

describe('escritorio de la práctica: verlo otra vez', () => {
  it('con la tarea hecha, el paso ofrece abrir el escritorio otra vez', () => {
    marcarAccionEscritorio('g');
    pintar({ type: 'desktop_task', id: 'g', programa: 'terminal', goal_md: 'Abrí la terminal' });
    const vista = escuchar(EVENTO_VISTA_PRACTICA);
    fireEvent.click(screen.getByText('Ver el escritorio otra vez'));
    expect(vista.vistos).toEqual([{ vista: 'escritorio' }]);
    vista.dejar();
  });

  it('después de cerrarlo, se puede abrir y volver a cerrar (apagándolo en la Pi)', () => {
    marcarAccionEscritorio('c');
    pintar({ type: 'desktop_close', id: 'c' });
    const vista = escuchar(EVENTO_VISTA_PRACTICA);
    const detener = escuchar(EVENTO_DETENER_ESCRITORIO);
    fireEvent.click(screen.getByText('Ver el escritorio otra vez'));
    fireEvent.click(screen.getByText('Cerrarlo y volver a la terminal'));
    expect(vista.vistos).toEqual([{ vista: 'escritorio' }, { vista: 'terminal' }]);
    expect(detener.vistos).toEqual([{ sessionId: 's1' }]);
    vista.dejar();
    detener.dejar();
  });
});
