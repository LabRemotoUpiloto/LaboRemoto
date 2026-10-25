// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCommandHistory } from '@/features/terminal/useCommandHistory';

// TerminalView reporta `commandHistory` en un efecto, y cada reporte puede terminar en un
// POST /validate a la Pi: la referencia solo puede cambiar cuando entra un comando nuevo.
describe('useCommandHistory: commandHistory estable', () => {
  it('un re-render sin comandos nuevos devuelve el mismo arreglo', () => {
    const { result, rerender } = renderHook(() => useCommandHistory());
    const antes = result.current.commandHistory;
    rerender();
    rerender();
    expect(result.current.commandHistory).toBe(antes);
  });

  it('un comando nuevo (Enter) cambia el arreglo y lo agrega', () => {
    const { result, rerender } = renderHook(() => useCommandHistory());
    const antes = result.current.commandHistory;
    act(() => result.current.processTerminalInput('whoami\r'));
    expect(result.current.commandHistory).not.toBe(antes);
    expect(result.current.commandHistory).toEqual(['whoami']);
    const despues = result.current.commandHistory;
    rerender();
    expect(result.current.commandHistory).toBe(despues);
  });
});

// nano usa la pantalla alterna: un Enter adentro es un salto de línea del archivo, no un comando.
describe('useCommandHistory: programas de pantalla completa', () => {
  it('lo que se teclea dentro de nano no se registra como comando', () => {
    const { result } = renderHook(() => useCommandHistory());
    act(() => result.current.processTerminalInput('nano hola.sh\r'));
    act(() => result.current.processTerminalData('\x1b[?1049h\x1b[22;0;0t\x1b[1;24r'));
    act(() => result.current.processTerminalInput('#!/bin/bash\r'));
    act(() => result.current.processTerminalInput('whoami\r'));
    act(() => result.current.processTerminalData('\x1b[?1049l'));
    act(() => result.current.processTerminalInput('./hola.sh\r'));
    expect(result.current.commandHistory).toEqual(['nano hola.sh', './hola.sh']);
  });

  it('la secuencia puede llegar partida en dos fragmentos', () => {
    const { result } = renderHook(() => useCommandHistory());
    act(() => result.current.processTerminalData('texto\x1b[?10'));
    act(() => result.current.processTerminalData('49h'));
    act(() => result.current.processTerminalInput('hola\r'));
    expect(result.current.commandHistory).toEqual([]);
  });
});
