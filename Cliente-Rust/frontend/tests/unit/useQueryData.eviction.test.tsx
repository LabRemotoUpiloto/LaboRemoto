// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAppStore } from '../../src/store/app';
import { MAX_QUERY_CACHE_ENTRIES } from '../../src/store/queryCache';
import { useQueryData } from '../../src/hooks/useQueryData';

/**
 * Test de regresión del gap detectado por pr-reviewer en el fix de eviction
 * de `useQueryData` (Batch 3): un componente que sigue montado con una
 * `key` que fue evictada del cache (LRU, `evictOldestEntries`) por *otro*
 * consumidor debe refetchear automáticamente en lugar de quedarse
 * indefinidamente en `isLoading: true`.
 */
describe('useQueryData — auto-refetch on external cache eviction', () => {
  beforeEach(() => {
    useAppStore.getState().invalidateAllQueries();
  });

  it('refetches automatically when its cache entry is evicted while mounted', async () => {
    const queryFn = vi.fn().mockResolvedValue('initial-data');

    const { result } = renderHook(() => useQueryData('evict-target', queryFn));

    // El hook hace su fetch inicial al montar.
    await waitFor(() => expect(result.current.data).toBe('initial-data'));
    expect(queryFn).toHaveBeenCalledTimes(1);

    // Simulamos que OTRO consumidor llena el cache hasta forzar la eviction
    // LRU de 'evict-target' (la entrada más antigua), sin que el componente
    // montado cambie ninguna de sus dependencias ([key, ttl, enabled]).
    const { setQueryData } = useAppStore.getState();
    for (let i = 0; i < MAX_QUERY_CACHE_ENTRIES; i++) {
      setQueryData(`other-key-${i}`, i);
    }

    // La entrada de 'evict-target' debe haber sido evictada del store.
    expect(useAppStore.getState().queryCache['evict-target']).toBeUndefined();

    // El hook debe detectar la desaparición de su entry y refetchear solo,
    // sin que el consumidor haga nada (sin refetch() manual).
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.data).toBe('initial-data'));
    expect(result.current.isLoading).toBe(false);

    // No debe quedar en loop: tras el refetch, ni el store ni queryFn deben
    // seguir siendo tocados.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it('does not refetch when the entry disappears because the component itself invalidated it manually before ever having data', async () => {
    const queryFn = vi.fn().mockResolvedValue('data');

    // Un hook que arranca deshabilitado nunca tuvo `entry`, así que no debe
    // disparar un refetch fantasma cuando se habilita luego con normalidad
    // (evita falsos positivos del detector de eviction).
    const { result, rerender } = renderHook(({ enabled }) => useQueryData('never-had-data', queryFn, { enabled }), {
      initialProps: { enabled: false },
    });

    expect(queryFn).not.toHaveBeenCalled();

    rerender({ enabled: true });

    await waitFor(() => expect(result.current.data).toBe('data'));
    expect(queryFn).toHaveBeenCalledTimes(1);
  });
});
