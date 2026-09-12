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

/** Telemetría completa del robot (motores, sensores, batería, alertas). */
export const getEv3Status = (sessionId: string): Promise<Ev3Status> =>
  invoke<Ev3Status>('ev3_status', { id: sessionId });

/** Mueve un motor. `port` acepta "A" u "outA"; `speed` en % (-100..100). */
export const setEv3Motor = (sessionId: string, port: string, speed: number): Promise<Ev3ApiResult> =>
  invoke<Ev3ApiResult>('ev3_set_motor', { id: sessionId, port, speed });

/** Detiene todos los motores, o uno solo si se pasa `port`. */
export const stopEv3Motors = (sessionId: string, port?: string): Promise<Ev3ApiResult> =>
  invoke<Ev3ApiResult>('ev3_stop_all', { id: sessionId, port: port ?? null });
