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
