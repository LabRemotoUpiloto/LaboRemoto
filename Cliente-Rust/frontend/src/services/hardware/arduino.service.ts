/**
 * arduino.service.ts
 * 
 * Capa de servicio para la comunicación serial con Arduino a través del bridge.
 */

import { invoke } from '@tauri-apps/api/core';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface BridgeStatus {
  port: string | null;
  open: boolean;
  last_error: string | null;
  rx_lines: number | null;
  reachable: boolean;
}

export interface ArduinoResponse {
  response: string;
  http_code: number;
}

// ── Comandos ──────────────────────────────────────────────────────────────────

/**
 * Obtiene el estado del puente serie con el Arduino.
 */
export const getBridgeStatus = (sessionId: string): Promise<BridgeStatus> =>
  invoke<BridgeStatus>('arduino_bridge_status', { id: sessionId });

/**
 * Envía un comando de texto al Arduino a través del puente.
 */
export const sendCmd = (sessionId: string, cmd: string): Promise<ArduinoResponse> =>
  invoke<ArduinoResponse>('arduino_send_cmd', { id: sessionId, cmd });
