/**
 * ev3.service.ts
 *
 * Capa de servicio para el robot EV3 a través del puente HTTP
 * (`ev3_bridge.py`, ver cmd::hardware::ev3 en el backend). Igual que
 * arduino.service.ts, cada llamada tuneliza un `curl` sobre la sesión SSH ya
 * autenticada — no hay conexión TCP directa desde el cliente.
 */

import { invoke } from '@tauri-apps/api/core';

export interface Ev3Motor {
  port: string;
  connected: boolean;
  speed: number;
  /** Grados acumulados del encoder; `null` si el puente no los envía. */
  position: number | null;
}

export interface Ev3Sensor {
  port: string;
  sensor_type: string;
  value: number;
}

export interface Ev3Status {
  connected: boolean;
  ip: string;
  battery: number;
  motors: Ev3Motor[];
  sensors: Ev3Sensor[];
  alerts: string[];
  reachable: boolean;
}

export interface Ev3ApiResult {
  status: string;
  message: string;
}

// `robot`: IP o nombre `.local` de un robot físico en la red local (vista «Probar con mi robot»). Con él, el backend
// habla directo con el robot (cmd::hardware::ev3_directo) y `sessionId` no se usa; sin él, va por el laboratorio.

/** Telemetría completa del robot (motores, sensores, batería, alertas). */
export const getEv3Status = (sessionId: string, robot?: string | null): Promise<Ev3Status> =>
  invoke<Ev3Status>('ev3_status', { id: sessionId, robot: robot ?? null });

/** Mueve un motor. `port` acepta "A" u "outA"; `speed` en % (-100..100). */
export const setEv3Motor = (sessionId: string, port: string, speed: number, robot?: string | null): Promise<Ev3ApiResult> =>
  invoke<Ev3ApiResult>('ev3_set_motor', { id: sessionId, port, speed, robot: robot ?? null });

// ── Consola de Python (cmd::hardware::ev3_console) ──

export interface Ev3RunStarted {
  run_id: string;
}

export interface Ev3RunOutput {
  /** Texto nuevo desde el `offset` pedido (puede venir vacío). */
  chunk: string;
  /** Offset a pedir en la próxima consulta. */
  next_offset: number;
  /** "running" mientras corre; "done" al terminar; "gone" si el robot ya no la conoce. */
  state: 'running' | 'done' | 'gone';
  exit_code: number | null;
}

/** Sube el programa al robot y lo ejecuta (un solo programa a la vez en el robot). */
export const startEv3Program = (sessionId: string, code: string): Promise<Ev3RunStarted> =>
  invoke<Ev3RunStarted>('ev3_run_start', { id: sessionId, code });

/** Salida nueva y estado de una ejecución. */
export const getEv3RunOutput = (sessionId: string, runId: string, offset: number): Promise<Ev3RunOutput> =>
  invoke<Ev3RunOutput>('ev3_run_output', { id: sessionId, runId, offset });

/** Corta la ejecución y frena los motores del robot. */
export const stopEv3Program = (sessionId: string, runId: string): Promise<void> =>
  invoke<void>('ev3_run_stop', { id: sessionId, runId });

/** Detiene todos los motores, o uno solo si se pasa `port`. */
export const stopEv3Motors = (sessionId: string, port?: string, robot?: string | null): Promise<Ev3ApiResult> =>
  invoke<Ev3ApiResult>('ev3_stop_all', { id: sessionId, port: port ?? null, robot: robot ?? null });
