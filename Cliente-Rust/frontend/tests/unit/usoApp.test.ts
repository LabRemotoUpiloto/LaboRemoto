// @vitest-environment jsdom
// Uso de la app: inicio al entrar, un latido por minuto y fin al salir; con un broker viejo (404) no insiste.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reportar = vi.fn();
vi.mock('@/features/actividad/sesiones.service', () => ({ sesionesService: { reportarUsoApp: (...a: unknown[]) => reportar(...a) } }));

import { useUsoAppReporter } from '@/features/actividad/useUsoAppReporter';

const tipos = () => reportar.mock.calls.map((c) => c[0]);

beforeEach(() => { vi.useFakeTimers(); reportar.mockReset(); reportar.mockResolvedValue(undefined); });
afterEach(() => vi.useRealTimers());

describe('useUsoAppReporter', () => {
  it('avisa inicio, un latido por minuto y el fin al cerrar la sesión, siempre con el mismo id', async () => {
    const { rerender } = renderHook(({ on }) => useUsoAppReporter(on), { initialProps: { on: true } });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(120_000); });
    rerender({ on: false });
    await act(async () => { await Promise.resolve(); });
    expect(tipos()).toEqual(['inicio', 'latido', 'latido', 'fin']);
    const ids = new Set(reportar.mock.calls.map((c) => c[1]));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toMatch(/^app-/);
  });

  it('sin sesión no avisa nada', () => {
    renderHook(() => useUsoAppReporter(false));
    expect(reportar).not.toHaveBeenCalled();
  });

  it('si el broker no tiene el registro de la app (404), no manda latidos ni fin', async () => {
    reportar.mockRejectedValueOnce(new Error('404'));
    const { rerender } = renderHook(({ on }) => useUsoAppReporter(on), { initialProps: { on: true } });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(180_000); });
    rerender({ on: false });
    expect(tipos()).toEqual(['inicio']);
  });

  it('finalizar (antes de cerrar sesión) avisa el fin una sola vez', async () => {
    const { result, unmount } = renderHook(() => useUsoAppReporter(true));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await result.current.finalizar(); });
    unmount();
    expect(tipos()).toEqual(['inicio', 'fin']);
  });
});
