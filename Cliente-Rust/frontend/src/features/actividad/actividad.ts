// features/actividad/actividad.ts — la actividad del laboratorio remoto en una sola lista: prácticas, trabajo por SSH y uso de la app.
// Todo lo de la página (en vivo, histórico, mapa, personas, gráficas, «para revisar») sale de aquí; sin React, para probarlo.
import type { SesionPractica } from './sesiones.service';
import type { ConexionDispositivo } from './dispositivos.service';
import { esIpLocal } from './dispositivosStats';

export type Tipo = 'practica' | 'ssh' | 'app';
export type Filtro = 'todo' | Tipo;

export interface Actividad {
  id: string;
  tipo: Tipo;
  /** Usuario sin dominio y en minúsculas: une a la misma persona entre prácticas, SSH y app. */
  persona: string;
  nombre: string;
  /** Qué hizo: la práctica, «SSH a Pi4» o «En la app». */
  detalle: string;
  inicio: number;
  /** null mientras sigue. */
  fin: number | null;
  /** Dónde se ubica en el mapa: la del equipo, salvo que sea dudosa (entonces la de la IP). */
  lugar: string;
  lat: number | null;
  lon: number | null;
  /** Código del país de `lugar` (para «entró desde otro país»). */
  pais: string | null;
  ip: string | null;
  /** Operador de la red («AS10620 Telmex Colombia S.A.»). */
  operador: string | null;
  /** Cómo se ubicó lo que se muestra. */
  ubicadoPor: 'equipo' | 'ip' | null;
  precisionM: number | null;
  /** El equipo dijo un lugar y la IP otro muy distinto (otro país o a más de 300 km): se muestra el de la IP. */
  dudosa: boolean;
  /** Lo que dijo el equipo, cuando la ubicación es dudosa. */
  lugarEquipo: string | null;
}

export const TEXTO_TIPO: Record<Tipo, string> = { practica: 'En práctica', ssh: 'Trabajando por SSH', app: 'En la app' };

const personaDe = (usuario: string) => usuario.replace(/^.*\\/, '').split('@')[0].toLowerCase();

let paises: Intl.DisplayNames | null = null;
/** «CO» → «Colombia» (si no se sabe el nombre, queda el código). */
export function nombrePais(codigo: string | null): string | null {
  if (!codigo) return null;
  try { paises ??= new Intl.DisplayNames(['es'], { type: 'region' }); return paises.of(codigo) ?? codigo; } catch { return codigo; }
}
const lugarDe = (ciudad: string | null, pais: string | null) => [ciudad, nombrePais(pais)].filter(Boolean).join(', ') || null;

/** Distancia en km entre dos puntos (haversine). */
export function distanciaKm(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

interface Punto { ciudad: string | null; pais: string | null; lat: number | null; lon: number | null }
type Ubicacion = Pick<Actividad, 'lugar' | 'lat' | 'lon' | 'pais' | 'ubicadoPor' | 'dudosa' | 'lugarEquipo'>;

/**
 * Decide qué ubicación mostrar. La del equipo es la más precisa, pero el servicio de ubicación de Windows a veces se equivoca
 * feo (dijo Venezuela para una IP de Bogotá): si equipo e IP caen en países distintos o a más de 300 km, se muestra la de la IP
 * y queda marcada como dudosa, con lo que dijo el equipo.
 */
export function ubicar(equipo: Punto | null, ip: Punto | null): Ubicacion {
  const tiene = (p: Punto | null): p is Punto => !!p && (p.lat != null || !!p.ciudad || !!p.pais);
  const conCoordenadas = (p: Punto | null): p is Punto & { lat: number; lon: number } => !!p && p.lat != null && p.lon != null;
  const dudosa = conCoordenadas(equipo) && conCoordenadas(ip) && (
    (!!equipo.pais && !!ip.pais && equipo.pais !== ip.pais) || distanciaKm([equipo.lat, equipo.lon], [ip.lat, ip.lon]) > 300);
  const usar = !dudosa && tiene(equipo) ? equipo : tiene(ip) ? ip : null;
  return {
    lugar: (usar && lugarDe(usar.ciudad, usar.pais)) || 'Sin ubicación',
    lat: usar?.lat ?? null, lon: usar?.lon ?? null, pais: usar?.pais ?? null,
    ubicadoPor: !usar ? null : usar === equipo ? 'equipo' : 'ip',
    dudosa, lugarEquipo: dudosa ? lugarDe(equipo!.ciudad, equipo!.pais) : null,
  };
}

/** Prácticas y uso de la app, del registro de sesiones (`clase`; las viejas no lo traen y son prácticas). */
export function desdeSesiones(sesiones: SesionPractica[]): Actividad[] {
  return sesiones.map((s) => {
    const app = s.clase === 'app';
    const principal = { ciudad: s.ciudad, pais: s.pais, lat: s.lat, lon: s.lon };
    const delEquipo = s.fuente_ubicacion === 'dispositivo';
    // Las sesiones guardadas antes de separar la ubicación por IP solo traen la principal: si era por IP, esa es.
    const deIp = s.ip_pais != null ? { ciudad: s.ip_ciudad, pais: s.ip_pais, lat: s.ip_lat, lon: s.ip_lon } : delEquipo ? null : principal;
    return {
      id: s.id, tipo: app ? 'app' : 'practica', persona: personaDe(s.usuario), nombre: s.nombre || s.usuario,
      detalle: app ? 'En la app' : (s.practica_nombre || s.practica_id || 'Práctica sin nombre').replace(/^Práctica:\s*/, ''),
      inicio: Date.parse(s.inicio), fin: s.fin ? Date.parse(s.fin) : null,
      ...ubicar(delEquipo ? principal : null, deIp),
      ip: s.ip, operador: s.ip_org ?? null, precisionM: delEquipo ? s.precision_m : null,
    };
  });
}

/**
 * Conexiones SSH a un equipo. Una práctica también entra por SSH: la conexión que coincide en persona y horario con una práctica
 * se descarta, para que esa persona cuente solo como en práctica.
 */
export function desdeConexiones(conexiones: ConexionDispositivo[], equipo: string, practicas: Actividad[], ahora: number): Actividad[] {
  const dePractica = (c: ConexionDispositivo, persona: string) => {
    const ini = Date.parse(c.inicio), fin = c.fin ? Date.parse(c.fin) : ahora;
    return practicas.some((p) => p.tipo === 'practica' && p.persona === persona && ini < (p.fin ?? ahora) && fin > p.inicio);
  };
  return conexiones.flatMap((c) => {
    const persona = c.persona ? c.persona.toLowerCase() : personaDe(c.usuario);
    if (dePractica(c, persona)) return [];
    const principal = { ciudad: c.ciudad, pais: c.pais, lat: c.lat, lon: c.lon };
    const delEquipo = c.fuente === 'dispositivo';
    const deIp = c.ipPais != null ? { ciudad: c.ipCiudad, pais: c.ipPais, lat: c.ipLat, lon: c.ipLon } : delEquipo ? null : principal;
    const u = ubicar(delEquipo ? principal : null, deIp);
    return [{
      id: c.id, tipo: 'ssh' as const, persona, nombre: c.nombre || c.usuario, detalle: `SSH a ${equipo}`,
      inicio: Date.parse(c.inicio), fin: c.activa ? null : c.fin ? Date.parse(c.fin) : null,
      ...u,
      // desde la red del laboratorio no hay ubicación por IP: se dice así en vez de «Sin ubicación»
      lugar: u.ubicadoPor === null && esIpLocal(c.ip) ? 'Red local' : u.lugar,
      ip: c.ip, operador: c.ipOrg ?? null, precisionM: delEquipo ? c.precisionM : null,
    }];
  });
}

export const delFiltro = (filtro: Filtro) => (a: Actividad) => filtro === 'todo' || a.tipo === filtro;

/** Quién está ahora: una fila por persona. Si alguien está en práctica o por SSH, eso manda sobre «en la app». */
export function enVivo(actividades: Actividad[]): Actividad[] {
  const abiertas = actividades.filter((a) => a.fin === null);
  const ocupadas = new Set(abiertas.filter((a) => a.tipo !== 'app').map((a) => a.persona));
  const vistas = new Set<string>();
  return abiertas
    .filter((a) => a.tipo !== 'app' || !ocupadas.has(a.persona))
    .sort((a, b) => b.inicio - a.inicio)
    .filter((a) => { const k = `${a.persona}:${a.tipo}`; if (vistas.has(k)) return false; vistas.add(k); return true; });
}

/** Lo último que terminó (para cuando no hay nadie). */
export const recientes = (actividades: Actividad[], n = 5) =>
  actividades.filter((a) => a.fin !== null).sort((a, b) => b.fin! - a.fin!).slice(0, n);

export const delPeriodo = (actividades: Actividad[], dias: number, ahora: number) =>
  actividades.filter((a) => a.inicio >= ahora - dias * 86_400_000);

export interface ResumenPersona { persona: string; nombre: string; veces: number; ms: number; ultima: number }

export function personas(actividades: Actividad[], ahora: number): ResumenPersona[] {
  const m = new Map<string, ResumenPersona>();
  for (const a of actividades) {
    const p = m.get(a.persona) ?? { persona: a.persona, nombre: a.nombre, veces: 0, ms: 0, ultima: 0 };
    p.veces++;
    p.ms += Math.max(0, (a.fin ?? ahora) - a.inicio);
    p.ultima = Math.max(p.ultima, a.inicio);
    if (a.nombre !== a.persona && p.nombre === p.persona) p.nombre = a.nombre;
    m.set(a.persona, p);
  }
  return [...m.values()].sort((a, b) => b.ultima - a.ultima);
}

export interface Lugar { id: string; lugar: string; lat: number; lon: number; veces: number }

/** Un lugar por ciudad (sin rastros): cuántas veces se conectaron desde ahí. */
export function lugares(actividades: Actividad[]): Lugar[] {
  const m = new Map<string, Lugar>();
  for (const a of actividades) {
    if (a.lat == null || a.lon == null) continue;
    const l = m.get(a.lugar) ?? { id: a.lugar, lugar: a.lugar, lat: a.lat, lon: a.lon, veces: 0 };
    l.veces++;
    m.set(a.lugar, l);
  }
  return [...m.values()].sort((a, b) => b.veces - a.veces);
}

/**
 * Encuadre del mapa alrededor de donde está la mayoría (la mediana), para que un lugar lejano no amontone a los demás.
 * Lo que queda fuera se nombra aparte y se puede ir hasta allá.
 */
export function encuadrar<P extends { lat: number; lon: number }>(puntos: P[], radioGrados = 1.5): { dentro: P[]; fuera: P[] } {
  if (!puntos.length) return { dentro: [], fuera: [] };
  const mediana = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
  const [la, lo] = [mediana(puntos.map((p) => p.lat)), mediana(puntos.map((p) => p.lon))];
  const cerca = (p: P) => Math.abs(p.lat - la) <= radioGrados && Math.abs(p.lon - lo) <= radioGrados;
  return { dentro: puntos.filter(cerca), fuera: puntos.filter((p) => !cerca(p)) };
}

/** Un registro por día del período (incluye los días sin nada), separado por tipo. */
export function porDia(actividades: Actividad[], dias: number, ahora: number): { dia: Date; por: Record<Tipo, number>; total: number }[] {
  return Array.from({ length: dias }, (_, i) => {
    const dia = new Date(ahora - (dias - 1 - i) * 86_400_000);
    dia.setHours(0, 0, 0, 0);
    const desde = dia.getTime(), hasta = desde + 86_400_000;
    const delDia = actividades.filter((a) => a.inicio >= desde && a.inicio < hasta);
    const por = { practica: 0, ssh: 0, app: 0 };
    for (const a of delDia) por[a.tipo]++;
    return { dia, por, total: delDia.length };
  });
}

/** Cuántas veces empezó algo en cada día de la semana (lunes primero) y hora. */
export function cuandoSeUsa(actividades: Actividad[]): number[][] {
  const celdas = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const a of actividades) {
    const d = new Date(a.inicio);
    celdas[(d.getDay() + 6) % 7][d.getHours()]++;
  }
  return celdas;
}

// ── Para revisar ──────────────────────────────────────────────────────────────

/** Operadores de centros de datos y VPN: una persona del laboratorio no suele entrar desde ahí. */
const SERVIDOR = /amazon|aws|google cloud|google llc|microsoft|azure|digitalocean|ovh|hetzner|linode|akamai|vultr|oracle|contabo|m247|datacamp|cloudflare|leaseweb|choopa|hosting|vpn|\btor\b|proxy/i;

/** «AS10620 Telmex Colombia S.A.» → «Telmex Colombia S.A.». */
export const nombreOperador = (org: string | null) => (org ? org.replace(/^AS\d+\s+/, '') : null);

export interface ParaRevisar {
  id: string;
  motivo: 'dudosa' | 'pais' | 'servidor';
  persona: string;
  nombre: string;
  texto: string;
  veces: number;
  ultima: number;
  /** El lugar del mapa al que lleva. */
  lugar: string | null;
}

/**
 * Lo que se sale de lo normal en el período: ubicaciones que no cuadran, una persona que entra desde un país distinto al de
 * siempre y entradas desde centros de datos o VPN. Agrupado por persona y motivo; lo más reciente primero.
 */
export function paraRevisar(actividades: Actividad[]): ParaRevisar[] {
  const grupos = new Map<string, ParaRevisar>();
  const sumar = (clave: string, a: Actividad, motivo: ParaRevisar['motivo'], texto: string) => {
    const g = grupos.get(clave) ?? { id: clave, motivo, persona: a.persona, nombre: a.nombre, texto, veces: 0, ultima: 0, lugar: a.lugar };
    g.veces++;
    g.ultima = Math.max(g.ultima, a.inicio);
    grupos.set(clave, g);
  };
  const paisesPorPersona = new Map<string, Map<string, number>>();
  for (const a of actividades) {
    if (!a.pais) continue;
    const m = paisesPorPersona.get(a.persona) ?? new Map<string, number>();
    m.set(a.pais, (m.get(a.pais) ?? 0) + 1);
    paisesPorPersona.set(a.persona, m);
  }
  const habitual = (persona: string) => {
    const m = paisesPorPersona.get(persona);
    return m && m.size > 1 ? [...m.entries()].sort((x, y) => y[1] - x[1])[0][0] : null;
  };
  for (const a of actividades) {
    if (a.dudosa) {
      sumar(`dudosa:${a.persona}:${a.lugarEquipo}:${a.lugar}`, a, 'dudosa',
        `el equipo dijo ${a.lugarEquipo} y la IP es de ${a.lugar}${a.operador ? ` (${nombreOperador(a.operador)})` : ''}`);
    }
    if (a.operador && SERVIDOR.test(a.operador)) {
      sumar(`servidor:${a.persona}:${a.operador}`, a, 'servidor', `entró desde un servidor o VPN: ${nombreOperador(a.operador)}, IP ${a.ip}`);
    }
    const h = habitual(a.persona);
    if (a.pais && h && a.pais !== h) {
      sumar(`pais:${a.persona}:${a.pais}`, a, 'pais', `entró desde ${nombrePais(a.pais)}; lo habitual es ${nombrePais(h)}`);
    }
  }
  return [...grupos.values()].sort((a, b) => b.ultima - a.ultima);
}

// ── Formatos ──────────────────────────────────────────────────────────────────

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dos = (n: number) => String(n).padStart(2, '0');

/** Cuánto lleva o hace cuánto: «8 min», «2 h 05 min», «3 d». */
export function lapso(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ${dos(m % 60)} min` : `${Math.floor(h / 24)} d`;
}

/** Un total en horas y minutos, sin pasar a días: «31 h 05 min». */
export function total(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${dos(m % 60)} min`;
}

/** «21 oct 20:55». */
export function fechaCorta(t: number | Date): string {
  const d = new Date(t);
  return `${d.getDate()} ${MESES[d.getMonth()]} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

export const diaCorto = (d: Date) => `${d.getDate()} ${MESES[d.getMonth()]}`;
