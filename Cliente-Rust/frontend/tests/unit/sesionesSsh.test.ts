// Sesiones SSH: filtro, orden y un grupo por día en hora LOCAL (antes se agrupaba por el día en UTC).
import { describe, expect, it } from 'vitest';
import { agrupar, desdeMetadata, duracionTexto, equipoDe, filtrarYOrdenar, nombreDia, type SessionLog } from '@/features/logs/sesiones';

const local = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).toISOString();
const s = (id: string, startedAt: string, extra: Partial<SessionLog> = {}): SessionLog =>
  ({ id, user: 'UPILOTO\\ana', host: '10.0.0.5', port: 22, startedAt, endedAt: startedAt, duration: 60, totalCommands: 3, ...extra });

const HOY = new Date(2026, 9, 23, 12, 0); // viernes 23 de octubre de 2026

describe('nombreDia', () => {
  it('hoy, ayer y los demás días con el nombre del día', () => {
    expect(nombreDia(new Date(2026, 9, 23, 8), HOY)).toBe('Hoy, viernes 23 de octubre');
    expect(nombreDia(new Date(2026, 9, 22, 23, 59), HOY)).toBe('Ayer, jueves 22 de octubre');
    expect(nombreDia(new Date(2026, 9, 18, 10), HOY)).toBe('Domingo 18 de octubre');
    expect(nombreDia(new Date(2025, 11, 31, 10), HOY)).toBe('Miércoles 31 de diciembre de 2025');
  });
});

describe('agrupar', () => {
  it('una sesión a las 21:30 hora local queda en su día aunque en UTC ya sea el siguiente', () => {
    const grupos = agrupar([s('a', local(2026, 10, 22, 21, 30)), s('b', local(2026, 10, 22, 8))], 'recientes', HOY);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].titulo).toBe('Ayer, jueves 22 de octubre');
  });

  it('ordenadas por duración van en un solo grupo', () => {
    const grupos = agrupar([s('a', local(2026, 10, 22, 8)), s('b', local(2026, 10, 20, 8))], 'largas', HOY);
    expect(grupos.map((g) => [g.titulo, g.sesiones.length])).toEqual([['Más largas primero', 2]]);
    expect(agrupar([], 'largas', HOY)).toEqual([]);
  });
});

describe('filtrarYOrdenar', () => {
  const pi = s('pi', local(2026, 10, 21, 9), { host: '200.115.181.211', port: 9000, duration: 900, user: 'UPILOTO\\beto' });
  const otra = s('otra', local(2026, 10, 22, 9), { duration: 30 });

  it('busca el equipo por su nombre o por la IP, y el usuario sin importar mayúsculas', () => {
    expect(filtrarYOrdenar([pi, otra], '', 'raspberry', 'recientes').map((x) => x.id)).toEqual(['pi']);
    expect(filtrarYOrdenar([pi, otra], '', '10.0.0', 'recientes').map((x) => x.id)).toEqual(['otra']);
    expect(filtrarYOrdenar([pi, otra], 'BETO', '', 'recientes').map((x) => x.id)).toEqual(['pi']);
  });

  it('más recientes primero o más largas primero', () => {
    expect(filtrarYOrdenar([pi, otra], '', '', 'recientes').map((x) => x.id)).toEqual(['otra', 'pi']);
    expect(filtrarYOrdenar([otra, pi], '', '', 'largas').map((x) => x.id)).toEqual(['pi', 'otra']);
  });
});

describe('datos de una fila', () => {
  it('duración legible', () => {
    expect(duracionTexto(42)).toBe('42 s');
    expect(duracionTexto(125)).toBe('2 min 05 s');
    expect(duracionTexto(3 * 3600 + 7 * 60)).toBe('3 h 07 min');
  });

  it('la Pi 4 y este equipo con su nombre; el resto con la dirección', () => {
    expect(equipoDe('200.115.181.211', 9000).nombre).toBe('Raspberry Pi 4');
    expect(equipoDe('localhost', 22)).toEqual({ nombre: 'Terminal local', direccion: 'este equipo' });
    expect(equipoDe('10.0.0.5', 22)).toEqual({ nombre: null, direccion: '10.0.0.5:22' });
  });

  it('del formato del backend al de la tabla (sin conteo = 0 comandos)', () => {
    expect(desdeMetadata({ session_id: 'x', user: 'u', host: 'h', port: 22, start_time: 'a', end_time: 'b',
      duration_seconds: 5, buffer_size_bytes: 1, command_count: null })).toEqual(
      { id: 'x', user: 'u', host: 'h', port: 22, startedAt: 'a', endedAt: 'b', duration: 5, totalCommands: 0 });
  });
});
