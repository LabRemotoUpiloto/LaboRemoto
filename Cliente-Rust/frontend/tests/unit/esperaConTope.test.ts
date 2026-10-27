// La práctica no puede depender del chat: si la explicación del tutor falla, se queda pensando o se cancela, el paso
// siguiente tiene que salir igual (antes la práctica quedaba bloqueada).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { esperarConTope } from '@/features/chat/esperaConTope';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('esperarConTope', () => {
  it('libera cuando la explicación termina', async () => {
    const alLiberar = vi.fn();
    esperarConTope(Promise.resolve(), 15_000, alLiberar);
    await vi.advanceTimersByTimeAsync(0);
    expect(alLiberar).toHaveBeenCalledTimes(1);
  });

  it('libera cuando la explicación falla', async () => {
    const alLiberar = vi.fn();
    esperarConTope(Promise.reject(new Error('servicio de IA caído')), 15_000, alLiberar);
    await vi.advanceTimersByTimeAsync(0);
    expect(alLiberar).toHaveBeenCalledTimes(1);
  });

  it('si la explicación nunca termina, libera al cumplirse el tope', async () => {
    const alLiberar = vi.fn();
    esperarConTope(new Promise(() => {}), 15_000, alLiberar);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(alLiberar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(alLiberar).toHaveBeenCalledTimes(1);
  });

  it('al cancelar la respuesta libera de inmediato y una sola vez', async () => {
    const alLiberar = vi.fn();
    let terminar!: () => void;
    const liberar = esperarConTope(new Promise<void>((r) => { terminar = r; }), 15_000, alLiberar);
    liberar();
    terminar();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(alLiberar).toHaveBeenCalledTimes(1);
  });
});
