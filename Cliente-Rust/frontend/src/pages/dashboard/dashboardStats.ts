// Agregaciones del dashboard sobre la lista cruda de sesiones del broker.
import type { SesionPractica } from '../../services/sesiones.service';

export const esActiva = (s: SesionPractica) => s.fin === null;

export function duracionMs(s: SesionPractica, ahora: number): number {
  const fin = s.fin ? Date.parse(s.fin) : ahora;
  return Math.max(0, fin - Date.parse(s.inicio));
}

// El nombre llega como la etiqueta de la pestaña ("Práctica: X" / "Linux — X");
// "Linux —" dice la categoría, "Práctica:" no aporta nada.
export const nombrePractica = (s: SesionPractica) =>
  (s.practica_nombre || s.practica_id || 'Sin nombre').replace(/^Práctica:\s*/, '');
export const nombreEstudiante = (s: SesionPractica) => s.nombre || s.usuario;
export const ubicacion = (s: SesionPractica) =>
  [s.ciudad, s.pais].filter(Boolean).join(', ') || 'Desconocida';

export const esUbicacionAproximada = (s: SesionPractica) => s.fuente_ubicacion !== 'dispositivo';

/** Cómo se obtuvo la ubicación, para mostrar al lado del lugar. */
export function detalleUbicacion(s: SesionPractica): string | null {
  if (s.lat == null) return null;
  if (!esUbicacionAproximada(s)) return s.precision_m != null ? `Equipo · ±${Math.max(s.precision_m, 110)} m` : 'Equipo';
  return 'Aprox. por IP';
}

function claveDia(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface ResumenGeneral {
  activas: number;
  total: number;
  estudiantes: number;
  duracionPromedioMs: number | null;
  practicaTop: string | null;
}

export function resumenGeneral(sesiones: SesionPractica[], ahora: number): ResumenGeneral {
  const terminadas = sesiones.filter((s) => !esActiva(s));
  const top = conteoPorPractica(sesiones)[0];
  return {
    activas: sesiones.filter(esActiva).length,
    total: sesiones.length,
    estudiantes: new Set(sesiones.map((s) => s.usuario)).size,
    duracionPromedioMs: terminadas.length
      ? terminadas.reduce((acc, s) => acc + duracionMs(s, ahora), 0) / terminadas.length
      : null,
    practicaTop: top ? top.nombre : null,
  };
}

/** Un punto por día del período (incluye días sin sesiones). */
export function sesionesPorDia(sesiones: SesionPractica[], dias: number, ahora: number) {
  const conteo = new Map<string, number>();
  for (let i = dias - 1; i >= 0; i--) conteo.set(claveDia(ahora - i * 86_400_000), 0);
  for (const s of sesiones) {
    const k = claveDia(Date.parse(s.inicio));
    if (conteo.has(k)) conteo.set(k, conteo.get(k)! + 1);
  }
  return [...conteo].map(([dia, total]) => ({ dia, total }));
}

export function conteoPorPractica(sesiones: SesionPractica[]) {
  const conteo = new Map<string, number>();
  for (const s of sesiones) conteo.set(nombrePractica(s), (conteo.get(nombrePractica(s)) ?? 0) + 1);
  return [...conteo].map(([nombre, total]) => ({ nombre, total })).sort((a, b) => b.total - a.total);
}

export interface PuntoUbicacion {
  lat: number;
  lon: number;
  lugar: string;
  sesiones: number;
  activas: number;
  estudiantes: string[];
  /** Todas sus sesiones se ubicaron solo por IP (centro de ciudad, no el lugar real). */
  aproximada: boolean;
}

export function porUbicacion(sesiones: SesionPractica[]): PuntoUbicacion[] {
  const puntos = new Map<string, PuntoUbicacion & { _est: Set<string> }>();
  for (const s of sesiones) {
    if (s.lat == null || s.lon == null) continue;
    const k = `${s.lat.toFixed(3)},${s.lon.toFixed(3)}`;
    let p = puntos.get(k);
    if (!p) {
      p = { lat: s.lat, lon: s.lon, lugar: ubicacion(s), sesiones: 0, activas: 0, estudiantes: [], aproximada: true, _est: new Set() };
      puntos.set(k, p);
    }
    p.sesiones++;
    if (!esUbicacionAproximada(s)) p.aproximada = false;
    if (esActiva(s)) p.activas++;
    p._est.add(nombreEstudiante(s));
  }
  return [...puntos.values()].map(({ _est, ...p }) => ({ ...p, estudiantes: [..._est] }));
}

export interface ResumenEstudiante {
  usuario: string;
  nombre: string;
  sesiones: number;
  tiempoTotalMs: number;
  ultima: string;
  activa: boolean;
}

export function porEstudiante(sesiones: SesionPractica[], ahora: number): ResumenEstudiante[] {
  const mapa = new Map<string, ResumenEstudiante>();
  for (const s of sesiones) {
    let e = mapa.get(s.usuario);
    if (!e) {
      e = { usuario: s.usuario, nombre: nombreEstudiante(s), sesiones: 0, tiempoTotalMs: 0, ultima: s.inicio, activa: false };
      mapa.set(s.usuario, e);
    }
    e.sesiones++;
    e.tiempoTotalMs += duracionMs(s, ahora);
    if (s.inicio > e.ultima) e.ultima = s.inicio;
    if (esActiva(s)) e.activa = true;
  }
  return [...mapa.values()].sort((a, b) => b.ultima.localeCompare(a.ultima));
}

export function formatoDuracion(ms: number | null): string {
  if (ms == null) return '—';
  const min = Math.round(ms / 60_000);
  if (min < 1) return '<1 min';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

export function formatoFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
