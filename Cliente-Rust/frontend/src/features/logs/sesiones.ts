// features/logs/sesiones.ts — el historial de sesiones SSH para la tabla: filtro, orden y un grupo por día (hora local).
import { isRaspberryPi4, KNOWN_DEVICES } from '@/lib/devices';
import type { SessionLogMetadata } from './session.service';

/** Una sesión del historial, como la usan la tabla y la pestaña del registro. */
export interface SessionLog {
  id: string;
  user: string;
  host: string;
  port: number;
  startedAt: string;
  endedAt?: string;
  duration?: number;
  totalCommands: number;
}

export type Orden = 'recientes' | 'largas';

export const desdeMetadata = (m: SessionLogMetadata): SessionLog => ({
  id: m.session_id,
  user: m.user,
  host: m.host,
  port: m.port,
  startedAt: m.start_time,
  endedAt: m.end_time,
  duration: m.duration_seconds,
  totalCommands: m.command_count ?? 0,
});

/** Nombre del equipo si es conocido (la Pi 4 o este equipo) y su dirección. */
export function equipoDe(host: string, port: number): { nombre: string | null; direccion: string } {
  if (isRaspberryPi4(host, port)) return { nombre: KNOWN_DEVICES.RASPBERRY_PI_4.label, direccion: `${host}:${port}` };
  if (host === 'localhost' || host === '127.0.0.1') return { nombre: 'Terminal local', direccion: 'este equipo' };
  return { nombre: null, direccion: `${host}:${port}` };
}

/** Filtra por usuario y por equipo (nombre o IP, sin importar mayúsculas) y ordena. */
export function filtrarYOrdenar(sesiones: SessionLog[], usuario: string, equipo: string, orden: Orden): SessionLog[] {
  const u = usuario.trim().toLowerCase();
  const e = equipo.trim().toLowerCase();
  return sesiones
    .filter((s) => (!u || s.user.toLowerCase().includes(u))
      && (!e || `${equipoDe(s.host, s.port).nombre ?? ''} ${s.host}:${s.port}`.toLowerCase().includes(e)))
    .sort((a, b) => orden === 'largas'
      ? (b.duration ?? 0) - (a.duration ?? 0)
      : new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const claveDia = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** «Hoy, jueves 23 de octubre», «Ayer, …» o «Martes 21 de octubre», con el día en hora local (antes se agrupaba en UTC). */
export function nombreDia(d: Date, hoy = new Date()): string {
  const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1);
  const base = `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
  if (claveDia(d) === claveDia(hoy)) return `Hoy, ${base}`;
  if (claveDia(d) === claveDia(ayer)) return `Ayer, ${base}`;
  return base[0].toUpperCase() + base.slice(1) + (d.getFullYear() === hoy.getFullYear() ? '' : ` de ${d.getFullYear()}`);
}

/** Un grupo por día local; ordenadas por duración no tiene sentido partir por día: un solo grupo. */
export function agrupar(sesiones: SessionLog[], orden: Orden, hoy = new Date()): { titulo: string; sesiones: SessionLog[] }[] {
  if (orden === 'largas') return sesiones.length ? [{ titulo: 'Más largas primero', sesiones }] : [];
  const grupos = new Map<string, { titulo: string; sesiones: SessionLog[] }>();
  for (const s of sesiones) {
    const d = new Date(s.startedAt);
    const k = claveDia(d);
    if (!grupos.has(k)) grupos.set(k, { titulo: nombreDia(d, hoy), sesiones: [] });
    grupos.get(k)!.sesiones.push(s);
  }
  return [...grupos.values()];
}

export const horaDe = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function duracionTexto(seg: number): string {
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = Math.floor(seg % 60);
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : m ? `${m} min ${String(s).padStart(2, '0')} s` : `${s} s`;
}
