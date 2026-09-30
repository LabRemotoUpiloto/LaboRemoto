/**
 * labPractices.service.ts
 *
 * Capa de servicio para el catálogo externo de prácticas
 * (cmd::integration::lab_practices) y su binding local a un entorno real
 * (cmd::practices::lab_connection).
 *
 * IMPORTANTE: `ExternalLabPractice` es contenido NO confiable (puede venir
 * de una aplicación de autoría de terceros). Nunca trae host/usuario/
 * contraseña — solo `execution_requirements` declarativos. La conexión real
 * (host/credenciales) vive en un `LabConnectionProfile` local
 * (`config/lab_connections/<id>.json`, gitignored) y solo se resuelve del
 * lado del backend — nunca llega al frontend salvo al iniciar la práctica.
 */

import { invoke } from '@tauri-apps/api/core';
import type { ExternalLabPractice } from '../bindings/ExternalLabPractice';

export type { ExternalLabPractice };

/** `ExternalLabPractice` con el flag de binding local resuelto. */
export interface RunnableLabPractice extends ExternalLabPractice {
  /** true si existe un LabConnectionProfile local — o sea, si se puede iniciar en este equipo. */
  runnable: boolean;
}

// Mismo shape que devuelve `practicas_get_config` / `lab_practices_get_runnable`
// en Rust (cmd::practices::practicas::Practice) — compartido para no duplicar
// el contrato entre las prácticas locales (Eve3 P1/P2) y las del catálogo.
export interface PracticeConnection {
  host: string;
  port: number;
  user: string;
  password: string;
  setup_commands: unknown[];
}

export interface TerminalConfig {
  allowed_commands: string[];
  working_directory: string;
  allow_navigation: boolean;
  allow_nano: boolean;
}

export interface PanelConfig {
  camera: boolean;
  chat: boolean;
  chat_context: string;
  chat_tutorial: string;
  robot_dashboard: boolean;
}

export interface Practice {
  id: string;
  name: string;
  description: string;
  difficulty: string;
  moodle_assignment_id?: number;
  connection: PracticeConnection;
  terminal: TerminalConfig;
  panels: PanelConfig;
}

/** Lista el catálogo de prácticas publicadas (caché de 5 min en el backend). */
export const labPracticesList = (): Promise<ExternalLabPractice[]> =>
  invoke<ExternalLabPractice[]>('lab_practices_list');

/** Consulta una práctica externa por id. */
export const labPracticesGet = (id: string): Promise<ExternalLabPractice> =>
  invoke<ExternalLabPractice>('lab_practices_get', { id });

/** Catálogo con `runnable` resuelto: reemplaza a `labPracticesList` en la UI unificada. */
export const labPracticesListRunnable = (): Promise<RunnableLabPractice[]> =>
  invoke<RunnableLabPractice[]>('lab_practices_list_runnable');

/** Arma la práctica completa (con credenciales) para iniciar sesión. Falla con NOT_RUNNABLE si no hay binding local. */
export const labPracticesGetRunnable = (id: string): Promise<Practice> =>
  invoke<Practice>('lab_practices_get_runnable', { id });

/** Ejecuta los setup_commands del binding local (misma semántica que `practicas_run_setup`). */
export const labPracticesRunSetup = (id: string): Promise<string[]> =>
  invoke<string[]>('lab_practices_run_setup', { id });
