// services/rendimiento.service.ts — signos vitales de la Pi para el panel de Rendimiento (solo admin_lab).
// Los calcula metrics_svc.py en la API de prácticas; el backend los trae por el túnel (`rendimiento_pi`).
import { invoke } from '@tauri-apps/api/core';

export interface Frenado {
  bajo_voltaje: boolean;
  frecuencia_limitada: boolean;
  frenada: boolean;
  limite_temperatura: boolean;
  hubo_bajo_voltaje: boolean;
  hubo_frenado: boolean;
}

export interface ResumenApi {
  peticiones: number;
  errores: number;
  en_curso: number;
  p50_ms: number | null;
  p95_ms: number | null;
  max_ms: number | null;
  bytes: number;
  por_tipo: Record<string, { n: number; errores: number; p95_ms: number | null }>;
}

/** Una muestra (cada ~2 s). Lo que la Pi no pudo leer llega en null. */
export interface MuestraPi {
  t: number;
  cpu_pct: number | null;
  cpu_nucleos: number[] | null;
  iowait_pct: number | null;
  carga: [number, number, number] | null;
  memoria: { total_mb: number; usada_mb: number; pct: number | null; swap_usada_mb: number } | null;
  temperatura_c: number | null;
  frenado: Frenado | null;
  red_rx_kbps: number | null;
  red_tx_kbps: number | null;
  conexiones: Record<string, number> | null;
  sesiones_ssh: { estudiantes: number; estudiantes_distintos: number; tuneles_app: number; otras: number } | null;
  camaras: { total: number; por_camara: Record<string, number> } | null;
  api: ResumenApi;
}

export interface ProcesoPi {
  comando: string;
  usuario: string;
  cpu_pct: number;
  ram_mb: number;
  procesos: number;
}

export interface InformePi {
  intervalo_s: number;
  info: { modelo: string | null; nucleos: number | null; interfaz: string | null };
  muestras: MuestraPi[];
  procesos_top: ProcesoPi[];
}

export const rendimientoPi = (desde?: number): Promise<InformePi> =>
  invoke<InformePi>('rendimiento_pi', { desde: desde ?? null });

/** Una petición a la API de prácticas, tal como la registró la Pi. `estado` 0 = falló antes de responder. */
export interface RegistroApi {
  t: number;
  metodo: string | null;
  ruta: string | null;
  tipo: string;
  estado: number;
  ms: number;
  bytes: number;
}

export type TipoEventoSsh =
  | 'entrada' | 'salida' | 'clave_incorrecta' | 'usuario_inexistente'
  | 'rechazada_por_exceso' | 'cortada' | 'cerrada_sin_entrar' | 'tiempo_agotado';

/** Un evento de SSH del auth.log de la Pi. */
export interface EventoSsh {
  t: number;
  tipo: TipoEventoSsh;
  usuario: string | null;
  ip: string | null;
  mensaje: string;
}

export interface LogsPi {
  api: RegistroApi[];
  /** null si la Pi no puede leer su auth.log. */
  ssh: EventoSsh[] | null;
}

export const rendimientoLogs = (desdeApi?: number, desdeSsh?: number): Promise<LogsPi> =>
  invoke<LogsPi>('rendimiento_logs', { desdeApi: desdeApi ?? null, desdeSsh: desdeSsh ?? null });
