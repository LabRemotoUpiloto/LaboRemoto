import { describe, expect, it } from 'vitest';
import {
  duracionConexion, esIpLocal, estadoDispositivo, fechaExcel, haceTiempo, nombreConexion, porUsuario, puntosDeConexiones, ubicacionConexion,
} from '@/features/actividad/dispositivosStats';
import type { ConexionDispositivo } from '@/features/actividad/dispositivos.service';

const base: ConexionDispositivo = {
  id: 'pi4:1:1', usuario: 'UPILOTO\\ana-perez', persona: 'ana-perez', nombre: null,
  inicio: '2026-10-04T14:29:00.000Z', fin: '2026-10-04T14:30:00.000Z', activa: false, cierre: 'cliente',
  ip: '203.0.113.7', ciudad: 'Bogotá', region: 'Bogotá D.C.', pais: 'CO', lat: 4.6, lon: -74.08,
};

describe('fechaExcel', () => {
  it('usa el formato del Excel: día/mes/año hora:minutos sin ceros a la izquierda salvo los minutos', () => {
    const d = new Date(2025, 1, 4, 9, 29, 12);                   // 4 de febrero de 2025, 9:29 (hora local)
    expect(fechaExcel(d.toISOString())).toBe('4/2/2025 9:29');
    expect(fechaExcel(new Date(2025, 11, 25, 14, 5).toISOString())).toBe('25/12/2025 14:05');
  });
  it('lo que no hay o no se entiende se muestra como guion', () => {
    expect(fechaExcel(null)).toBe('—');
    expect(fechaExcel(undefined)).toBe('—');
    expect(fechaExcel('basura')).toBe('—');
  });
});

describe('ubicación', () => {
  it('ciudad y país si hay; red local si la IP es privada; si no, sin ubicación', () => {
    expect(ubicacionConexion(base)).toBe('Bogotá, CO');
    expect(ubicacionConexion({ ciudad: null, pais: null, ip: '172.16.34.5' })).toBe('Red local');
    expect(ubicacionConexion({ ciudad: null, pais: null, ip: '191.156.1.1' })).toBe('Sin ubicación');
  });
  it('reconoce las redes locales', () => {
    for (const ip of ['10.0.0.1', '192.168.1.5', '172.16.0.1', '172.31.255.1', '127.0.0.1', '::1']) expect(esIpLocal(ip), ip).toBe(true);
    for (const ip of ['8.8.8.8', '172.32.0.1', '203.0.113.7']) expect(esIpLocal(ip), ip).toBe(false);
  });
});

describe('tiempos', () => {
  const ahora = Date.parse('2026-10-04T15:00:00.000Z');
  it('haceTiempo', () => {
    expect(haceTiempo('2026-10-04T14:59:55.000Z', ahora)).toBe('hace 5 s');
    expect(haceTiempo('2026-10-04T14:57:00.000Z', ahora)).toBe('hace 3 min');
    expect(haceTiempo('2026-10-04T12:00:00.000Z', ahora)).toBe('hace 3 h');
    expect(haceTiempo('2026-10-01T15:00:00.000Z', ahora)).toBe('hace 3 d');
    expect(haceTiempo(null, ahora)).toBe('nunca');
  });
  it('duracionConexion de una cerrada y de una abierta', () => {
    expect(duracionConexion(base, ahora)).toBe('1 min');
    expect(duracionConexion({ inicio: '2026-10-04T14:59:30.000Z', fin: null }, ahora)).toBe('30 s');
    expect(duracionConexion({ inicio: '2026-10-04T12:30:00.000Z', fin: null }, ahora)).toBe('2 h 30 min');
  });
});

describe('estadoDispositivo', () => {
  const ahora = Date.parse('2026-10-04T15:00:00.000Z');
  it('en línea, sin conexión (con el último aviso) y sin agente todavía', () => {
    expect(estadoDispositivo({ enLinea: true, ultimoLatido: '2026-10-04T14:59:50.000Z' }, ahora)).toEqual({ texto: 'En línea', ok: true });
    expect(estadoDispositivo({ enLinea: false, ultimoLatido: '2026-10-04T14:50:00.000Z' }, ahora)).toEqual({ texto: 'Sin conexión desde hace 10 min', ok: false });
    expect(estadoDispositivo({ enLinea: false, ultimoLatido: null }, ahora)).toEqual({ texto: 'Aún no ha reportado', ok: null });
  });
});

describe('nombre y mapa', () => {
  it('muestra el nombre completo si lo hay y, si no, el usuario del LDAP', () => {
    expect(nombreConexion({ nombre: 'Ana Pérez', usuario: 'UPILOTO\\ana-perez' })).toBe('Ana Pérez');
    expect(nombreConexion(base)).toBe('UPILOTO\\ana-perez');
  });

  it('agrupa por lugar, cuenta las activas y omite lo que no tiene coordenadas', () => {
    const c = [
      base,
      { ...base, id: '2', usuario: 'UPILOTO\\ben', nombre: 'Ben', activa: true, fin: null },
      { ...base, id: '3', lat: null, lon: null },
      { ...base, id: '4', lat: 6.25, lon: -75.56, ciudad: 'Medellín' },
    ];
    const p = puntosDeConexiones(c);
    expect(p).toHaveLength(2);
    const bogota = p.find((x) => x.lugar === 'Bogotá, CO')!;
    expect([bogota.sesiones, bogota.activas, bogota.estudiantes.sort()]).toEqual([2, 1, ['Ben', 'UPILOTO\\ana-perez']]);
    expect(bogota.aproximada).toBe(true);
  });
});

describe('porUsuario', () => {
  it('agrupa por usuario, suma el tiempo, marca al que sigue conectado y deja arriba al más reciente', () => {
    const ahora = Date.parse('2026-10-04T15:00:00.000Z');
    const c = [
      base,                                                                   // luisa, 1 min
      { ...base, id: '2', inicio: '2026-10-04T14:40:00.000Z', fin: '2026-10-04T14:50:00.000Z' }, // luisa, 10 min
      { ...base, id: '3', usuario: 'UPILOTO\\ben', nombre: 'Ben', inicio: '2026-10-04T14:55:00.000Z', fin: null, activa: true }, // ben, 5 min y en curso
    ];
    const g = porUsuario(c, ahora);
    expect(g.map((u) => [u.usuario, u.nombre, u.conexiones.length, u.tiempoTotalMs / 60_000, u.activa])).toEqual([
      ['UPILOTO\\ben', 'Ben', 1, 5, true],
      ['UPILOTO\\ana-perez', 'UPILOTO\\ana-perez', 2, 11, false],
    ]);
    expect(g[1].conexiones.map((x) => x.id)).toEqual(['2', 'pi4:1:1']);
  });
});
