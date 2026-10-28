// @vitest-environment jsdom
// Actividad: «Actualizar» vuelve a pedir de verdad, y una respuesta vieja (de otro período) no pisa a la nueva.
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useResumen } from '@/features/actividad/useResumen';

/** Una promesa que se resuelve a mano. */
function pendiente<T>() {
  let resolver!: (v: T) => void;
  const promesa = new Promise<T>((ok) => { resolver = ok; });
  return { promesa, resolver };
}

describe('useResumen', () => {
  it('recargar vuelve a pedir al backend y dice si llegaron datos', async () => {
    const pedir = vi.fn(async (dias: number) => ({ dias, vez: pedir.mock.calls.length }));
    const { result } = renderHook(() => useResumen(pedir, 30));
    await waitFor(() => expect(result.current.datos).toEqual({ dias: 30, vez: 1 }));

    let ok: boolean | null = null;
    await act(async () => { ok = await result.current.recargar(); });
    expect(ok).toBe(true);
    expect(pedir).toHaveBeenCalledTimes(2);
    expect(result.current.datos).toEqual({ dias: 30, vez: 2 });
    expect(result.current.cargando).toBe(false);
  });

  it('si falla, lo dice y deja los datos que había', async () => {
    const pedir = vi.fn().mockResolvedValueOnce('viejo').mockRejectedValueOnce({ message: 'sin red' });
    const { result } = renderHook(() => useResumen(pedir, 30));
    await waitFor(() => expect(result.current.datos).toBe('viejo'));

    let ok: boolean | null = null;
    await act(async () => { ok = await result.current.recargar(); });
    expect(ok).toBe(false);
    expect(result.current.error).toBe('sin red');
    expect(result.current.datos).toBe('viejo');
  });

  it('la respuesta de un período anterior que llega tarde se descarta', async () => {
    const lenta = pendiente<string>();
    const pedir = vi.fn((dias: number) => (dias === 30 ? lenta.promesa : Promise.resolve(`de ${dias}`)));
    const { result, rerender } = renderHook(({ dias }) => useResumen(pedir, dias), { initialProps: { dias: 30 } });

    rerender({ dias: 1 });
    await waitFor(() => expect(result.current.datos).toBe('de 1'));
    await act(async () => { lenta.resolver('de 30'); await lenta.promesa; });
    expect(result.current.datos).toBe('de 1');
  });
});
