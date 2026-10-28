// @vitest-environment jsdom
// Registros de las prácticas en la Pi: qué es un intento, cuándo se manda y los filtros de «Prácticas de estudiantes».
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const servicio = vi.hoisted(() => ({
  guardarCopia: vi.fn(async () => {}),
  enviarIntento: vi.fn(async () => 'enviado' as const),
  enviarPendientes: vi.fn(async () => 0),
  cerrarApp: vi.fn(async () => {}),
}));
const tauri = vi.hoisted(() => ({ alCerrar: null as null | (() => Promise<void>) }));
vi.mock('@/features/registros/registros.service', () => ({ EVENTO_CERRANDO: 'app:cerrando', registrosService: servicio }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_evento: string, f: () => Promise<void>) => { tauri.alCerrar = f; return () => { tauri.alCerrar = null; }; }),
}));

import { compararIntentos, estadoDe, notaDe, recienAprobada, type Intento } from '@/features/registros/intentos';
import { filtrar, practicasDe, diasDe } from '@/features/registros/filtros';
import { useRegistrosIntentos } from '@/features/registros/useRegistrosIntentos';
import { EVENTO_EXPORTAR_REGISTRO } from '@/features/cursos/registroSesion';
import { emitSaveSessionBeforeClose } from '@/features/conexion/ssh.service';
import type { RegistroIntento } from '@/features/registros/registros.service';

const crear = (sessionId: string, p: { practiceId: string; nombre: string }): Intento =>
  ({ id: `id-${sessionId}-${p.practiceId}`, sessionId, practica: p.practiceId, nombre: p.nombre, inicio: '2026-10-28T19:00:00Z' });

describe('intentos', () => {
  it('una pestaña nueva empieza un intento; cerrarla o cambiarle la práctica lo termina; EV3 no cuenta', () => {
    const a = compararIntentos({}, { s1: { practiceId: 'linux-m1', nombre: 'L1' }, s2: { practiceId: 'ev3-m1', nombre: 'EV3' } }, crear);
    expect(Object.keys(a.actuales)).toEqual(['s1']);
    expect(a.terminados).toEqual([]);
    const b = compararIntentos(a.actuales, { s1: { practiceId: 'linux-m1', nombre: 'L1' } }, crear);
    expect(b.actuales.s1).toBe(a.actuales.s1); // sigue siendo el mismo intento
    const c = compararIntentos(b.actuales, { s1: { practiceId: 'linux-m2', nombre: 'L2' } }, crear);
    expect(c.terminados.map((i) => i.practica)).toEqual(['linux-m1']);
    expect(c.actuales.s1.practica).toBe('linux-m2');
    expect(compararIntentos(c.actuales, {}, crear).terminados.map((i) => i.practica)).toEqual(['linux-m2']);
  });

  it('estado y nota: aprobada es «terminada»; si no, según cómo se fue', () => {
    expect(estadoDe({ passed: true, percentage: 100 }, true)).toBe('terminada');
    expect(estadoDe({ passed: false, percentage: 40 }, false)).toBe('sin_terminar');
    expect(estadoDe(null, true)).toBe('app_cerrada');
    expect(notaDe({ passed: false, percentage: 66.6 })).toBe(67);
    expect(notaDe(null)).toBeNull();
  });

  it('recién aprobada solo si antes había un resultado sin aprobar (abrir una ya aprobada no cuenta)', () => {
    expect(recienAprobada({ passed: false, percentage: 50 }, { passed: true, percentage: 100 })).toBe(true);
    expect(recienAprobada(null, { passed: true, percentage: 100 })).toBe(false);
    expect(recienAprobada({ passed: true, percentage: 100 }, { passed: true, percentage: 100 })).toBe(false);
  });
});

describe('filtros de «Prácticas de estudiantes»', () => {
  const AHORA = new Date(2026, 9, 28, 15, 0).getTime();
  const reg = (id: string, extra: Partial<RegistroIntento>): RegistroIntento => ({
    id, carpeta: 'ana', usuario: 'ana', nombre: 'Ana Pérez', practica: 'linux-m1', practicaNombre: 'Primeros pasos', estado: 'terminada',
    nota: 100, inicio: new Date(AHORA - 3_600_000).toISOString(), fin: new Date(AHORA - 60_000).toISOString(), bytes: 10, archivo: 'x.html', ...extra,
  });
  const lista = [
    reg('1', {}),
    reg('2', { carpeta: 'beto', usuario: 'beto', nombre: 'Beto Ruiz', estado: 'sin_terminar', practica: 'linux-m2', practicaNombre: 'Archivos' }),
    reg('3', { fin: new Date(AHORA - 3 * 86_400_000).toISOString() }),
  ];

  it('busca por nombre o usuario sin importar tildes, y filtra por práctica, estado y hoy', () => {
    const f = { busqueda: '', practica: '', estado: '', periodo: '7' as const };
    expect(filtrar(lista, { ...f, busqueda: 'perez' }, AHORA).map((r) => r.id)).toEqual(['1', '3']);
    expect(filtrar(lista, { ...f, busqueda: 'beto' }, AHORA).map((r) => r.id)).toEqual(['2']);
    expect(filtrar(lista, { ...f, practica: 'linux-m2' }, AHORA).map((r) => r.id)).toEqual(['2']);
    expect(filtrar(lista, { ...f, estado: 'terminada' }, AHORA).map((r) => r.id)).toEqual(['1', '3']);
    expect(filtrar(lista, { ...f, periodo: 'hoy' }, AHORA).map((r) => r.id)).toEqual(['1', '2']);
    expect(practicasDe(lista)).toEqual([{ valor: 'linux-m2', etiqueta: 'Archivos' }, { valor: 'linux-m1', etiqueta: 'Primeros pasos' }]);
    expect([diasDe('hoy'), diasDe('7'), diasDe('20')]).toEqual([1, 7, 20]);
  });
});

describe('useRegistrosIntentos', () => {
  // la terminal de cada pestaña responde con su registro (como useTerminalSessionCapture)
  const terminal = (e: Event) => {
    const { sessionId, responder } = (e as CustomEvent).detail;
    responder({ sessionId, user: 'ana', host: 'pi', port: 22, startTime: '2026-10-28T19:00:00Z', endTime: '2026-10-28T19:10:00Z', rawContent: 'pwd' });
  };
  beforeEach(() => {
    vi.clearAllMocks();
    window.addEventListener(EVENTO_EXPORTAR_REGISTRO, terminal);
  });
  afterEach(() => {
    cleanup(); // desmonta el hook: si no, el de la prueba anterior también oye los cierres de pestaña
    window.removeEventListener(EVENTO_EXPORTAR_REGISTRO, terminal);
  });

  const ABIERTAS = { s1: { practiceId: 'linux-m1', nombre: 'Primeros pasos' } };
  const montar = (resultados: Record<string, { passed: boolean; percentage: number } | null> = {}) =>
    renderHook(({ abiertas, resultados: r }) => useRegistrosIntentos(abiertas, r, true), { initialProps: { abiertas: ABIERTAS as Record<string, { practiceId: string; nombre: string }>, resultados } });

  it('al iniciar sesión manda lo pendiente', async () => {
    montar();
    await act(async () => {});
    expect(servicio.enviarPendientes).toHaveBeenCalledTimes(1);
  });

  it('cerrar la pestaña manda el intento «sin terminar» una sola vez, con el registro de su terminal', async () => {
    const h = montar({ 'linux-m1': { passed: false, percentage: 40 } });
    await act(async () => { emitSaveSessionBeforeClose('s1'); });
    h.rerender({ abiertas: {}, resultados: { 'linux-m1': { passed: false, percentage: 40 } } });
    await act(async () => {});
    expect(servicio.enviarIntento).toHaveBeenCalledTimes(1);
    const [x] = servicio.enviarIntento.mock.calls[0] as unknown as [{ estado: string; practica: string; nota: number; registro: { rawContent: string } }];
    expect([x.estado, x.practica, x.nota, x.registro.rawContent]).toEqual(['sin_terminar', 'linux-m1', 40, 'pwd']);
  });

  it('aprobarla la manda «terminada» en el momento; abrir una ya aprobada no', async () => {
    const h = montar({ 'linux-m1': { passed: false, percentage: 80 } });
    h.rerender({ abiertas: ABIERTAS, resultados: { 'linux-m1': { passed: true, percentage: 100 } } });
    await act(async () => {});
    expect(servicio.enviarIntento).toHaveBeenCalledTimes(1);
    expect((servicio.enviarIntento.mock.calls[0] as unknown as [{ estado: string }])[0].estado).toBe('terminada');

    vi.clearAllMocks();
    montar({ 'linux-m1': { passed: true, percentage: 100 } });
    await act(async () => {});
    expect(servicio.enviarIntento).not.toHaveBeenCalled();
  });

  it('cambiar la pestaña a otra práctica termina el intento anterior y empieza otro', async () => {
    const h = montar();
    h.rerender({ abiertas: { s1: { practiceId: 'linux-m2', nombre: 'Archivos' } }, resultados: {} });
    await act(async () => {});
    expect(servicio.enviarIntento).toHaveBeenCalledTimes(1);
    expect((servicio.enviarIntento.mock.calls[0] as unknown as [{ practica: string; estado: string }])[0]).toMatchObject({ practica: 'linux-m1', estado: 'sin_terminar' });
  });

  it('cada 2 minutos deja una copia con el estado que tendría si se cerrara la app', async () => {
    vi.useFakeTimers();
    try {
      montar();
      await act(async () => { await vi.advanceTimersByTimeAsync(2 * 60_000); });
      expect(servicio.guardarCopia).toHaveBeenCalledTimes(1);
      expect((servicio.guardarCopia.mock.calls[0] as unknown as [{ estado: string }])[0].estado).toBe('app_cerrada');
      expect(servicio.enviarIntento).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('al cerrar la app guarda la copia, intenta mandarla y cierra la ventana', async () => {
    montar();
    await act(async () => {});
    expect(tauri.alCerrar).not.toBeNull();
    await act(async () => { await tauri.alCerrar!(); });
    expect(servicio.guardarCopia).toHaveBeenCalledTimes(1);
    expect((servicio.enviarIntento.mock.calls[0] as unknown as [{ estado: string }])[0].estado).toBe('app_cerrada');
    expect(servicio.cerrarApp).toHaveBeenCalledTimes(1);
  });
});
