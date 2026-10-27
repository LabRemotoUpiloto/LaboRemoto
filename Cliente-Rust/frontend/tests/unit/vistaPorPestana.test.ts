// @vitest-environment jsdom
// La vista (terminal o escritorio remoto) es de cada pestaña: si una práctica se cerraba con el escritorio a la
// vista, la sesión siguiente arrancaba directo en el escritorio (y lo encendía en la Pi).
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/cuenta/usePermissions', () => ({ useEffectiveRole: () => 'estudiante', canAccessPage: () => true }));

import { useAppTabs } from '@/app/hooks/useAppTabs';

describe('useAppTabs: vista por pestaña', () => {
  it('una sesión nueva empieza en la terminal aunque la anterior se cerró en el escritorio', () => {
    const { result } = renderHook(() => useAppTabs());
    act(() => result.current.openSession('s1', 'Práctica 1'));
    act(() => result.current.setActiveView('escritorio'));
    expect(result.current.activeView).toBe('escritorio');
    act(() => result.current.closeTab('s1'));
    act(() => result.current.openSession('s2', 'Práctica 2'));
    expect(result.current.activeView).toBe('terminal');
  });

  it('reusar el id de una sesión cerrada también empieza en la terminal', () => {
    const { result } = renderHook(() => useAppTabs());
    act(() => result.current.openSession('s1'));
    act(() => result.current.setActiveView('escritorio'));
    act(() => result.current.closeTab('s1'));
    act(() => result.current.openSession('s1'));
    expect(result.current.activeView).toBe('terminal');
  });

  it('cada pestaña recuerda su propia vista', () => {
    const { result } = renderHook(() => useAppTabs());
    act(() => result.current.openSession('s1'));
    act(() => result.current.setActiveView('escritorio'));
    act(() => result.current.openSession('s2'));
    expect(result.current.activeView).toBe('terminal');
    act(() => result.current.setActiveTabId('s1'));
    expect(result.current.activeView).toBe('escritorio');
  });
});
