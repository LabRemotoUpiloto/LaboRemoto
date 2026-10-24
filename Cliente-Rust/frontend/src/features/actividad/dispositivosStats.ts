// Estado de los equipos (Pi) en Actividad: si están en línea, hace cuánto avisaron y si una IP es de la red local.
import type { DispositivoActividad } from './dispositivos.service';

/** IPv4 de red local (no tiene ubicación por IP). */
export const esIpLocal = (ip: string) =>
  /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) || ip === '::1' || /^f[cd]/i.test(ip);

/** «hace 5 s», «hace 3 min», «hace 2 h», «hace 4 d». */
export function haceTiempo(iso: string | null | undefined, ahora: number): string {
  if (!iso) return 'nunca';
  const s = Math.max(0, Math.round((ahora - Date.parse(iso)) / 1000));
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86_400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86_400)} d`;
}

/** Cómo se dice que está el dispositivo: ok = verde, false = rojo, null = gris. */
export function estadoDispositivo(d: Pick<DispositivoActividad, 'enLinea' | 'ultimoLatido'>, ahora: number): { texto: string; ok: boolean | null } {
  if (d.enLinea) return { texto: 'En línea', ok: true };
  if (!d.ultimoLatido) return { texto: 'Aún no ha reportado', ok: null };
  return { texto: `Sin conexión desde ${haceTiempo(d.ultimoLatido, ahora)}`, ok: false };
}
