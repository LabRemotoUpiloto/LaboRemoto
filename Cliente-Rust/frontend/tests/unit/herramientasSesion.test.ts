// @vitest-environment jsdom
// Cada sesión guarda su propio mosaico; ocultar todo no cierra nada; al cerrar la sesión se olvida.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: () => Promise.resolve(() => {}) }));

import { hojas } from '@/components/mosaico/arbol';
import { abrir, alternar, arbolDe, marcarVisible, olvidar, sesionQueSeVe } from '@/features/sesion/herramientasSesion';
import { sirveEn, snippetsDelNavegador, type Comando } from '@/features/comandos/comandos';

describe('mosaico por sesión', () => {
  it('una sesión nueva abre solo con la terminal', () => {
    expect(hojas(arbolDe('s-nueva'))).toEqual(['terminal']);
  });

  it('lo que se abre en una sesión no aparece en otra', () => {
    alternar('s-a', 'chat');
    alternar('s-a', 'comandos');
    expect(hojas(arbolDe('s-a'))).toEqual(['terminal', 'chat', 'comandos']);
    expect(hojas(arbolDe('s-b'))).toEqual(['terminal']);
  });

  it('se puede ocultar todo, terminal incluida, y volver a mostrarla', () => {
    alternar('s-c', 'terminal');
    expect(arbolDe('s-c')).toBeNull();
    abrir('s-c', 'terminal');
    expect(hojas(arbolDe('s-c'))).toEqual(['terminal']);
  });

  it('al cerrar la sesión se olvida su mosaico y deja de ser la que se ve', () => {
    alternar('s-d', 'pines');
    marcarVisible('s-d');
    olvidar('s-d');
    expect(sesionQueSeVe()).toBeNull();
    expect(hojas(arbolDe('s-d'))).toEqual(['terminal']);
  });

  it('el recorrido guiado abre el chat en la sesión que se ve', () => {
    marcarVisible('s-e');
    window.dispatchEvent(new Event('tour:open-chat'));
    expect(hojas(arbolDe('s-e'))).toContain('chat');
  });
});

describe('comandos', () => {
  const c = (terminal: string | null): Comando => ({ id: 'x', titulo: 'x', comando: 'ls', descripcion: null, categoria: null, terminal, creado: 1, actualizado: null });

  it('los que no dicen terminal sirven en cualquiera; los demás, solo en la suya', () => {
    expect(sirveEn(c(null), 'powershell')).toBe(true);
    expect(sirveEn(c('linux'), 'linux')).toBe(true);
    expect(sirveEn(c('linux'), 'powershell')).toBe(false);
    expect(sirveEn(c('powershell'))).toBe(true);
  });

  it('pasa los snippets del navegador a la forma nueva (y descarta los vacíos)', () => {
    const datos = JSON.stringify([
      { id: 'a', title: 'Temperatura', content: 'vcgencmd measure_temp', createdAt: 10, category: 'Pi' },
      { id: 'b', title: 'Vacío', content: '   ', createdAt: 11 },
    ]);
    expect(snippetsDelNavegador(datos)).toEqual([
      { id: 'a', titulo: 'Temperatura', comando: 'vcgencmd measure_temp', descripcion: null, categoria: 'Pi', terminal: null, creado: 10, actualizado: null },
    ]);
    expect(snippetsDelNavegador('no es json')).toEqual([]);
  });
});
