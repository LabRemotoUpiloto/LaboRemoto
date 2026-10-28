// Actividad: prácticas, trabajo por SSH y uso de la app en una sola lista.
import { describe, expect, it } from 'vitest';
import {
  ajustarRango, cuandoSeUsa, delFiltro, delPeriodo, desdeConexiones, desdeSesiones, encuadrar, enVivo, isoLocal, lapso, lugares,
  nombreOperador, paraRevisar, periodo, personas, porDia, porHora, recientes, total, ubicar, type Actividad,
} from '@/features/actividad/actividad';
import type { SesionPractica } from '@/features/actividad/sesiones.service';
import type { ConexionDispositivo } from '@/features/actividad/dispositivos.service';

const AHORA = new Date(2026, 9, 24, 16, 0).getTime();
const hace = (min: number) => new Date(AHORA - min * 60_000).toISOString();

const sesion = (id: string, extra: Partial<SesionPractica> = {}): SesionPractica => ({
  id, clase: null, sesion_id: id, usuario: 'ana-perez', nombre: 'Ana Pérez', correo: null, practica_id: 'linux', practica_nombre: 'Práctica: Linux 1',
  inicio: hace(60), ultimo_latido: hace(30), fin: hace(30), cierre: 'cliente', ip: '203.0.113.7',
  ciudad: 'Bogotá', region: null, pais: 'CO', lat: 4.6, lon: -74.08, fuente_ubicacion: 'ip', precision_m: null, ...extra,
});
const conexion = (id: string, extra: Partial<ConexionDispositivo> = {}): ConexionDispositivo => ({
  id, usuario: 'UPILOTO\\ana-perez', persona: 'ana-perez', nombre: null, inicio: hace(50), fin: hace(40), activa: false, cierre: 'cliente',
  ip: '203.0.113.7', ciudad: 'Chía', region: null, pais: 'CO', lat: 4.86, lon: -74.05, ...extra,
});

describe('unir prácticas, app y SSH', () => {
  it('la clase separa prácticas de uso de la app; las viejas (sin clase) son prácticas; «Práctica:» sobra', () => {
    const [p, a] = desdeSesiones([sesion('s1'), sesion('s2', { clase: 'app', practica_id: null, practica_nombre: null })]);
    expect([p.tipo, p.detalle, p.persona]).toEqual(['practica', 'Linux 1', 'ana-perez']);
    expect([a.tipo, a.detalle]).toEqual(['app', 'En la app']);
  });

  it('una conexión SSH durante una práctica de la misma persona cuenta solo como práctica', () => {
    const practicas = desdeSesiones([sesion('s1')]);
    const dentro = conexion('c1');                                     // 50–40 min, dentro de la práctica (60–30)
    const fuera = conexion('c2', { inicio: hace(200), fin: hace(180) });
    const deOtro = conexion('c3', { persona: 'beto', usuario: 'UPILOTO\\beto' });
    expect(desdeConexiones([dentro, fuera, deOtro], 'Pi4', practicas, AHORA).map((a) => a.id)).toEqual(['c2', 'c3']);
  });

  it('SSH: detalle con el equipo, abierta si sigue activa y «Red local» cuando la IP es de la red del laboratorio', () => {
    const [a, b] = desdeConexiones([
      conexion('c1', { activa: true, fin: null }),
      conexion('c2', { ciudad: null, pais: null, lat: null, lon: null, ip: '172.16.34.5' }),
    ], 'Pi4', [], AHORA);
    expect([a.detalle, a.fin]).toEqual(['SSH a Pi4', null]);
    expect(b.lugar).toBe('Red local');
  });
});

const RANGO = { desde: '2026-10-20', hasta: '2026-10-22' };
/** Minutos entre un momento de octubre de 2026 y AHORA (para `act`). */
const minDesde = (dia: number, h: number, m = 0) => (AHORA - new Date(2026, 9, dia, h, m).getTime()) / 60_000;

const act = (id: string, persona: string, tipo: Actividad['tipo'], inicioMin: number, finMin: number | null, extra: Partial<Actividad> = {}): Actividad => ({
  id, tipo, persona, nombre: persona, detalle: tipo, inicio: AHORA - inicioMin * 60_000, fin: finMin === null ? null : AHORA - finMin * 60_000,
  lugar: 'Bogotá, CO', lat: 4.6, lon: -74.08, pais: 'CO', ip: '203.0.113.7', operador: null, ubicadoPor: 'ip', precisionM: null,
  dudosa: false, lugarEquipo: null, ...extra,
});

describe('en vivo', () => {
  it('si alguien está en práctica o por SSH, eso manda sobre «en la app»; quien solo tiene la app abierta aparece en la app', () => {
    const vivo = enVivo([
      act('a1', 'ana', 'app', 90, null), act('p1', 'ana', 'practica', 20, null),
      act('a2', 'beto', 'app', 10, null),
      act('x', 'carla', 'practica', 50, 40),
    ]);
    expect(vivo.map((a) => a.id)).toEqual(['a2', 'p1']);
  });

  it('lo último que terminó, lo más reciente primero', () => {
    expect(recientes([act('1', 'a', 'ssh', 90, 80), act('2', 'b', 'practica', 30, 5), act('3', 'c', 'app', 10, null)], 2).map((a) => a.id)).toEqual(['2', '1']);
  });
});

describe('histórico', () => {
  const lista = [
    act('1', 'ana', 'practica', 60, 30), act('2', 'ana', 'ssh', 3 * 24 * 60, 3 * 24 * 60 - 20),
    act('3', 'beto', 'app', 40 * 24 * 60, 40 * 24 * 60 - 10),
  ];

  it('período y filtro por tipo', () => {
    expect(delPeriodo(lista, periodo('30', RANGO, AHORA)).map((a) => a.id)).toEqual(['1', '2']);
    expect(lista.filter(delFiltro('ssh')).map((a) => a.id)).toEqual(['2']);
    expect(lista.filter(delFiltro('todo'))).toHaveLength(3);
  });

  it('una fila por persona con veces, tiempo total y la última vez, la más reciente primero', () => {
    const [ana, beto] = personas(lista, AHORA);
    expect([ana.persona, ana.veces, ana.ms]).toEqual(['ana', 2, 50 * 60_000]);
    expect(beto.persona).toBe('beto');
  });

  it('un lugar por ciudad con cuántas veces; sin coordenadas no va al mapa', () => {
    const ls = lugares([...lista, act('4', 'c', 'ssh', 5, 1, { lugar: 'Chía, CO', lat: 4.86, lon: -74.05 }), act('5', 'd', 'ssh', 5, 1, { lat: null, lon: null })]);
    expect(ls.map((l) => [l.lugar, l.veces])).toEqual([['Bogotá, CO', 3], ['Chía, CO', 1]]);
  });

  it('el mapa encuadra donde está la mayoría y deja aparte lo lejano', () => {
    const { dentro, fuera } = encuadrar([{ lat: 4.6, lon: -74.08 }, { lat: 4.86, lon: -74.05 }, { lat: 4.7, lon: -74.2 }, { lat: 10.48, lon: -66.9 }]);
    expect(dentro).toHaveLength(3);
    expect(fuera).toEqual([{ lat: 10.48, lon: -66.9 }]);
  });

  it('por día: todos los días del período, separados por tipo', () => {
    const dias = porDia(lista, periodo('7', RANGO, AHORA).dias);
    expect(dias).toHaveLength(7);
    expect(dias[6].por).toEqual({ practica: 1, ssh: 0, app: 0 });
    expect(dias[3].por.ssh).toBe(1);
    expect(dias.reduce((s, d) => s + d.total, 0)).toBe(2);
  });

  it('cuándo se usa: día de la semana (lunes primero) por hora de inicio', () => {
    const celdas = cuandoSeUsa([act('1', 'a', 'practica', 60, 30)]);            // sábado 24 oct, 15:00
    expect(celdas[5][15]).toBe(1);
    expect(celdas.flat().reduce((s, v) => s + v, 0)).toBe(1);
  });
});

describe('formatos', () => {
  it('lapso pasa a días; el total se queda en horas', () => {
    expect(lapso(8 * 60_000)).toBe('8 min');
    expect(lapso(125 * 60_000)).toBe('2 h 05 min');
    expect(lapso(50 * 3_600_000)).toBe('2 d');
    expect(total(31 * 3_600_000 + 5 * 60_000)).toBe('31 h 05 min');
  });
});

describe('ubicación', () => {
  const bogota = { ciudad: 'Bogotá', pais: 'CO', lat: 4.6, lon: -74.08 };
  const chia = { ciudad: 'Chía', pais: 'CO', lat: 4.86, lon: -74.05 };
  const mariara = { ciudad: 'Libertador, Mariara', pais: 'VE', lat: 10.29, lon: -67.71 };

  it('la del equipo manda si cuadra con la de la IP', () => {
    expect(ubicar(chia, bogota)).toMatchObject({ lugar: 'Chía, Colombia', ubicadoPor: 'equipo', dudosa: false, lugarEquipo: null });
  });

  it('si el equipo dice otro país (o está a más de 300 km de la IP), se muestra la IP y queda dudosa', () => {
    expect(ubicar(mariara, bogota)).toMatchObject({ lugar: 'Bogotá, Colombia', lat: 4.6, ubicadoPor: 'ip', dudosa: true, lugarEquipo: 'Libertador, Mariara, Venezuela' });
    expect(ubicar({ ciudad: 'Cali', pais: 'CO', lat: 3.45, lon: -76.53 }, bogota).dudosa).toBe(true);
  });

  it('sin la del equipo, la de la IP; sin ninguna, sin ubicación', () => {
    expect(ubicar(null, bogota)).toMatchObject({ lugar: 'Bogotá, Colombia', ubicadoPor: 'ip' });
    expect(ubicar(null, null)).toMatchObject({ lugar: 'Sin ubicación', ubicadoPor: null, lat: null });
  });

  it('una sesión guarda las dos: el caso de Venezuela con una IP de Bogotá', () => {
    const [a] = desdeSesiones([sesion('s1', {
      fuente_ubicacion: 'dispositivo', ciudad: 'Libertador, Mariara', pais: 'VE', lat: 10.29, lon: -67.71, precision_m: 110,
      ip_ciudad: 'Bogotá', ip_region: null, ip_pais: 'CO', ip_lat: 4.6, ip_lon: -74.08, ip_org: 'AS10620 Telmex Colombia S.A.',
    })]);
    expect([a.lugar, a.dudosa, a.lugarEquipo, a.operador]).toEqual(['Bogotá, Colombia', true, 'Libertador, Mariara, Venezuela', 'AS10620 Telmex Colombia S.A.']);
  });
});

describe('para revisar', () => {
  it('ubicaciones que no cuadran, un país distinto al de siempre y servidores o VPN; agrupado y lo más reciente primero', () => {
    const items = paraRevisar([
      act('1', 'haider', 'practica', 300, 280, { dudosa: true, lugarEquipo: 'Mariara, Venezuela', lugar: 'Bogotá, Colombia', operador: 'AS10620 Telmex Colombia S.A.' }),
      act('2', 'haider', 'practica', 200, 180, { dudosa: true, lugarEquipo: 'Mariara, Venezuela', lugar: 'Bogotá, Colombia' }),
      act('3', 'ana', 'ssh', 100, 90), act('4', 'ana', 'ssh', 90, 80), act('5', 'ana', 'ssh', 50, 40, { pais: 'BR', lugar: 'São Paulo, Brasil' }),
      act('6', 'beto', 'ssh', 20, 10, { operador: 'AS14061 DigitalOcean, LLC', ip: '159.89.1.1' }),
    ]);
    expect(items.map((x) => [x.motivo, x.persona, x.veces])).toEqual([['servidor', 'beto', 1], ['pais', 'ana', 1], ['dudosa', 'haider', 2]]);
    expect(items[1].lineas).toEqual(['Esta vez: São Paulo, Brasil', 'Lo habitual: Colombia']);
    expect(items[0].lineas).toEqual(['Operador: DigitalOcean, LLC', 'IP: 159.89.1.1, Bogotá, CO']);
    expect(items[2].lineas).toEqual(['Equipo: Mariara, Venezuela', 'IP: Bogotá, Colombia (Telmex Colombia S.A.)']);
  });

  it('sin nada raro, nada que revisar; el operador se muestra sin el número de AS', () => {
    expect(paraRevisar([act('1', 'ana', 'ssh', 10, 5)])).toEqual([]);
    expect(nombreOperador('AS10620 Telmex Colombia S.A.')).toBe('Telmex Colombia S.A.');
  });
});

describe('período del histórico', () => {
  it('hoy: desde la medianoche, con la gráfica por horas', () => {
    const p = periodo('hoy', RANGO, AHORA);
    expect([p.frase, p.dias.length, p.pedir]).toEqual(['hoy', 1, 1]);
    const lista = [act('1', 'a', 'app', minDesde(24, 1), null), act('2', 'a', 'app', minDesde(23, 23, 30), null)];
    expect(delPeriodo(lista, p).map((a) => a.id)).toEqual(['1']);
    const horas = porHora(delPeriodo(lista, p));
    expect(horas).toHaveLength(24);
    expect(horas[1].por.app).toBe(1);
  });

  it('un rango incluye sus dos días completos y le pide al broker lo que lo cubra', () => {
    const p = periodo('rango', RANGO, AHORA);
    expect(p.frase).toBe('del 20 oct al 22 oct');
    expect(p.dias.map(isoLocal)).toEqual(['2026-10-20', '2026-10-21', '2026-10-22']);
    expect(p.pedir).toBe(5); // del 20 oct a medianoche al 24 oct a las 16:00 van 4 días y 16 horas
    const lista = [
      act('antes', 'a', 'ssh', minDesde(19, 23, 59), null), act('primero', 'a', 'ssh', minDesde(20, 0), null),
      act('ultimo', 'a', 'ssh', minDesde(22, 23, 59), null), act('despues', 'a', 'ssh', minDesde(23, 0), null),
    ];
    expect(delPeriodo(lista, p).map((a) => a.id)).toEqual(['primero', 'ultimo']);
    expect(porDia(lista, p.dias).map((c) => [c.etiqueta, c.total])).toEqual([['20 oct', 1], ['21 oct', 0], ['22 oct', 1]]);
  });

  it('un rango de un solo día se nombra por su fecha, o «hoy» si es hoy', () => {
    expect(periodo('rango', { desde: '2026-10-21', hasta: '2026-10-21' }, AHORA).frase).toBe('el 21 oct');
    expect(periodo('rango', { desde: '2026-10-24', hasta: '2026-10-24' }, AHORA).frase).toBe('hoy');
  });

  it('el rango no se sale de los 90 días que guardan los brokers ni queda al revés', () => {
    expect(ajustarRango(RANGO, 'desde', '2026-01-01', AHORA).desde).toBe('2026-07-27');
    expect(ajustarRango(RANGO, 'hasta', '2027-01-01', AHORA).hasta).toBe('2026-10-24');
    expect(ajustarRango(RANGO, 'desde', '2026-10-23', AHORA)).toEqual({ desde: '2026-10-23', hasta: '2026-10-23' });
    expect(ajustarRango(RANGO, 'hasta', '2026-10-18', AHORA)).toEqual({ desde: '2026-10-18', hasta: '2026-10-18' });
    expect(periodo('rango', { desde: '2026-07-27', hasta: '2026-10-24' }, AHORA).pedir).toBe(90);
  });
});
