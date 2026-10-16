// Formatos y agregaciones de la pestaña «Dispositivos» de Actividad.
import type { ConexionDispositivo, DispositivoActividad } from '../../services/dispositivos.service';
import type { PuntoUbicacion } from './dashboardStats';

const dos = (n: number) => String(n).padStart(2, '0');

/** Como en el Excel de conexiones: `4/2/2025 9:29` (día/mes/año hora:minutos, en la hora de quien mira). */
export function fechaExcel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${d.getHours()}:${dos(d.getMinutes())}`;
}

/** IPv4 de red local (no tiene ubicación por IP). */
export const esIpLocal = (ip: string) =>
  /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) || ip === '::1' || /^f[cd]/i.test(ip);

export function ubicacionConexion(c: Pick<ConexionDispositivo, 'ciudad' | 'pais' | 'ip'>): string {
  return [c.ciudad, c.pais].filter(Boolean).join(', ') || (esIpLocal(c.ip) ? 'Red local' : 'Sin ubicación');
}

/** «hace 5 s», «hace 3 min», «hace 2 h», «hace 4 d». */
export function haceTiempo(iso: string | null | undefined, ahora: number): string {
  if (!iso) return 'nunca';
  const s = Math.max(0, Math.round((ahora - Date.parse(iso)) / 1000));
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86_400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86_400)} d`;
}

/** Cuánto duró (o lleva) una conexión, en palabras cortas. */
export function duracionConexion(c: Pick<ConexionDispositivo, 'inicio' | 'fin'>, ahora: number): string {
  const fin = c.fin ? Date.parse(c.fin) : ahora;
  const s = Math.max(0, Math.round((fin - Date.parse(c.inicio)) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Cómo se dice que está el dispositivo: ok = verde, false = rojo, null = gris. */
export function estadoDispositivo(d: Pick<DispositivoActividad, 'enLinea' | 'ultimoLatido'>, ahora: number): { texto: string; ok: boolean | null } {
  if (d.enLinea) return { texto: 'En línea', ok: true };
  if (!d.ultimoLatido) return { texto: 'Aún no ha reportado', ok: null };
  return { texto: `Sin conexión · último aviso ${haceTiempo(d.ultimoLatido, ahora)}`, ok: false };
}

/** Nombre a mostrar de una persona: el completo si ya usó la app; si no, el usuario como llega del LDAP. */
export const nombreConexion = (c: Pick<ConexionDispositivo, 'nombre' | 'usuario'>) => c.nombre || c.usuario;

/** Un punto del mapa por lugar (para reutilizar el mapa de las prácticas). */
export function puntosDeConexiones(conexiones: ConexionDispositivo[]): PuntoUbicacion[] {
  const puntos = new Map<string, PuntoUbicacion & { _quienes: Set<string> }>();
  for (const c of conexiones) {
    if (c.lat == null || c.lon == null) continue;
    const k = `${c.lat.toFixed(3)},${c.lon.toFixed(3)}`;
    let p = puntos.get(k);
    if (!p) {
      p = { lat: c.lat, lon: c.lon, lugar: ubicacionConexion(c), sesiones: 0, activas: 0, estudiantes: [], aproximada: true, _quienes: new Set() };
      puntos.set(k, p);
    }
    p.sesiones++;
    if (c.activa) p.activas++;
    p._quienes.add(nombreConexion(c));
  }
  return [...puntos.values()].map(({ _quienes, ...p }) => ({ ...p, estudiantes: [..._quienes] }));
}

export interface ResumenUsuarioDispositivo {
  usuario: string;
  nombre: string;
  conexiones: ConexionDispositivo[];
  tiempoTotalMs: number;
  ultima: string;
  activa: boolean;
}

/** Las conexiones agrupadas por usuario, la persona más reciente primero (como «Por estudiante» en las prácticas). */
export function porUsuario(conexiones: ConexionDispositivo[], ahora: number): ResumenUsuarioDispositivo[] {
  const mapa = new Map<string, ResumenUsuarioDispositivo>();
  for (const c of conexiones) {
    let u = mapa.get(c.usuario);
    if (!u) {
      u = { usuario: c.usuario, nombre: nombreConexion(c), conexiones: [], tiempoTotalMs: 0, ultima: c.inicio, activa: false };
      mapa.set(c.usuario, u);
    }
    u.conexiones.push(c);
    u.tiempoTotalMs += Math.max(0, (c.fin ? Date.parse(c.fin) : ahora) - Date.parse(c.inicio));
    if (c.inicio > u.ultima) u.ultima = c.inicio;
    if (c.activa) u.activa = true;
  }
  for (const u of mapa.values()) u.conexiones.sort((a, b) => b.inicio.localeCompare(a.inicio));
  return [...mapa.values()].sort((a, b) => b.ultima.localeCompare(a.ultima));
}
