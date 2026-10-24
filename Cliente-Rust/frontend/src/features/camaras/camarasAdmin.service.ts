import { invoke } from '@tauri-apps/api/core';
import type { CamaraAdmin } from '@/bindings/CamaraAdmin';
import type { CamaraEntrada } from '@/bindings/CamaraEntrada';
import type { CamarasAdminLista } from '@/bindings/CamarasAdminLista';
import type { PruebaCamara } from '@/bindings/PruebaCamara';
import type { ResultadoGuardado } from '@/bindings/ResultadoGuardado';
import type { ResultadoPrueba } from '@/bindings/ResultadoPrueba';

export type { CamaraAdmin, CamaraEntrada, CamarasAdminLista, PruebaCamara, ResultadoGuardado, ResultadoPrueba };

/**
 * Administración de cámaras (solo admin_lab; el broker lo exige). Las claves se mandan al broker y NUNCA vuelven:
 * `CamaraAdmin` solo trae `tienePassword`.
 */
export const camarasAdminService = {
  listar: () => invoke<CamarasAdminLista>('camaras_listar'),
  /** `id`: probar una cámara existente con su clave guardada (si `entrada.password` va vacío). */
  probar: (entrada: CamaraEntrada, id?: string) => invoke<ResultadoPrueba>('camaras_probar', { entrada, id: id ?? null }),
  crear: (entrada: CamaraEntrada) => invoke<ResultadoGuardado>('camaras_crear', { entrada }),
  actualizar: (id: string, entrada: CamaraEntrada) => invoke<ResultadoGuardado>('camaras_actualizar', { id, entrada }),
  eliminar: (id: string) => invoke<void>('camaras_eliminar', { id }),
};

/** Rutas RTSP habituales. «otra» deja escribirla a mano. */
export const RUTAS_RTSP = [
  { value: '/h264Preview_01_sub', label: 'Reolink en baja resolución (recomendada para la vista en vivo)' },
  { value: '/h264Preview_01_main', label: 'Reolink en alta resolución' },
  { value: 'otra', label: 'Otra ruta…' },
] as const;

export interface LineaPrueba { ok: boolean | null; texto: string }

/** Resultado de «Probar conexión» en frases cortas para mostrar al administrador. */
export function describirPrueba(p: PruebaCamara): LineaPrueba[] {
  const l: LineaPrueba[] = [];
  if (p.rtsp.ok) {
    const v = p.rtsp.video;
    const medidas = v && v.ancho && v.alto ? ` ${v.ancho}×${v.alto}` : '';
    l.push({ ok: true, texto: `Video: funciona (${(v?.codec ?? 'video').toUpperCase()}${medidas})` });
  } else {
    l.push({ ok: false, texto: `Video: ${p.rtsp.mensaje ?? 'no se pudo abrir'}` });
  }
  if (p.api.ok) l.push({ ok: true, texto: `Cámara Reolink${p.api.modelo ? `: ${p.api.modelo}` : ''}` });
  else if (p.rtsp.ok) l.push({ ok: null, texto: p.api.mensaje ?? 'No se pudo leer el modelo (no impide guardarla)' });
  if (p.ptz === true) l.push({ ok: true, texto: 'PTZ: sí, responde a comandos de movimiento' });
  else if (p.ptz === false) l.push({ ok: null, texto: 'PTZ: no disponible en esta cámara' });
  return l;
}

/** Estado de una cámara administrada, en palabras. */
export function etiquetaCamara(c: Pick<CamaraAdmin, 'habilitada' | 'estado' | 'video'>): { texto: string; ok: boolean | null } {
  if (!c.habilitada) return { texto: 'Deshabilitada', ok: null };
  if (c.video === 'transmitiendo' && c.estado === 'active') return { texto: 'Transmitiendo', ok: true };
  if (c.video === 'transmitiendo') return { texto: 'Video listo (Shinobi conectando)', ok: true };
  if (c.estado === 'active') return { texto: 'Activa en Shinobi (sin WebRTC)', ok: true };
  return { texto: c.video === 'sin video' ? 'Sin video' : 'Conectando…', ok: false };
}

/** Une los errores por campo del broker en un solo texto (para avisos generales). */
export function textoErrores(errores: Record<string, string> | null | undefined): string {
  return Object.entries(errores ?? {}).map(([k, v]) => `${k}: ${v}`).join('; ');
}

/** Solo manda al broker lo que cambió al editar: así una edición de nombre no vuelve a probar ni reescribe la conexión. */
export function soloCambios(original: CamaraAdmin, e: CamaraEntrada): CamaraEntrada {
  const out: CamaraEntrada = {};
  if (e.nombre !== undefined && e.nombre !== original.nombre) out.nombre = e.nombre;
  if (e.host !== undefined && e.host !== original.host) out.host = e.host;
  if (e.puerto !== undefined && e.puerto !== original.puerto) out.puerto = e.puerto;
  if (e.usuario !== undefined && e.usuario !== original.usuario) out.usuario = e.usuario;
  if (e.password) out.password = e.password; // vacío = conservar la actual
  if (e.rtspPath !== undefined && e.rtspPath !== original.rtspPath) out.rtspPath = e.rtspPath;
  if (e.ptz !== undefined && e.ptz !== original.ptz) out.ptz = e.ptz;
  if (e.habilitada !== undefined && e.habilitada !== original.habilitada) out.habilitada = e.habilitada;
  if (e.forzar) out.forzar = true;
  return out;
}
