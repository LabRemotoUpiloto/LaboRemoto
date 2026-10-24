import { describe, expect, it } from 'vitest';
import { esIpLocal, estadoDispositivo, haceTiempo } from '@/features/actividad/dispositivosStats';

describe('red local', () => {
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
});

describe('estadoDispositivo', () => {
  const ahora = Date.parse('2026-10-04T15:00:00.000Z');
  it('en línea, sin conexión (con el último aviso) y sin agente todavía', () => {
    expect(estadoDispositivo({ enLinea: true, ultimoLatido: '2026-10-04T14:59:50.000Z' }, ahora)).toEqual({ texto: 'En línea', ok: true });
    expect(estadoDispositivo({ enLinea: false, ultimoLatido: '2026-10-04T14:50:00.000Z' }, ahora)).toEqual({ texto: 'Sin conexión desde hace 10 min', ok: false });
    expect(estadoDispositivo({ enLinea: false, ultimoLatido: null }, ahora)).toEqual({ texto: 'Aún no ha reportado', ok: null });
  });
});
