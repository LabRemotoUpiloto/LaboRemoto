/**
 * gpio.service.ts
 * 
 * Capa de servicio para el control de pines GPIO en Raspberry Pi.
 */

import { invoke } from '@tauri-apps/api/core';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface GpioLine {
  gpio: number;
  level: number | null;
  func: string;
  pull: string | null;
}

export type GpioMode = 'input' | 'output';
export type GpioPull = 'up' | 'down' | 'none';

// ── Comandos ──────────────────────────────────────────────────────────────────

/**
 * Obtiene el estado completo de los pines GPIO.
 */
export async function getPinsStatus(sessionId: string): Promise<GpioLine[]> {
  const res = await invoke<any[]>('rpi_pins_status', { id: sessionId });
  return res.map(r => ({
    gpio: Number(r.gpio),
    level: r.level == null ? null : Number(r.level),
    func: String(r.func || ''),
    pull: r.pull == null ? null : String(r.pull),
  }));
}

/**
 * Cambia el modo (entrada/salida) de un pin específico.
 */
export const setPinMode = (sessionId: string, gpio: number, mode: GpioMode): Promise<void> =>
  invoke<void>('rpi_pin_set_mode', { id: sessionId, gpio, mode });

/**
 * Configura la resistencia de pull (up/down/none) de un pin.
 */
export const setPinPull = (sessionId: string, gpio: number, pull: GpioPull): Promise<void> =>
  invoke<void>('rpi_pin_set_pull', { id: sessionId, gpio, pull });

/**
 * Escribe un nivel lógico (0 o 1) en un pin de salida.
 */
export const writePinLevel = (sessionId: string, gpio: number, level: 0 | 1): Promise<void> =>
  invoke<void>('rpi_pin_write_level', { id: sessionId, gpio, level });

/**
 * Lee el estado actual de un pin específico.
 */
export async function readPin(sessionId: string, gpio: number): Promise<GpioLine> {
  const r = await invoke<any>('rpi_pin_read', { id: sessionId, gpio });
  return {
    gpio: Number(r.gpio),
    level: r.level == null ? null : Number(r.level),
    func: String(r.func || ''),
    pull: r.pull == null ? null : String(r.pull),
  };
}

/**
 * Inicia el monitoreo continuo en segundo plano desde el backend Rust.
 */
export async function startPinsMonitor(sessionId: string, intervalMs?: number): Promise<void> {
  return invoke<void>('rpi_pins_monitor_start', { id: sessionId, intervalMs });
}

/**
 * Detiene el monitoreo continuo en segundo plano en Rust.
 */
export async function stopPinsMonitor(sessionId: string): Promise<void> {
  return invoke<void>('rpi_pins_monitor_stop', { id: sessionId });
}

