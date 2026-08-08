/**
 * localTerminal.service.ts
 *
 * Capa de servicio centralizada para la terminal local embebida (PTY nativa,
 * no SSH). Mismo criterio que ssh.service.ts: el frontend nunca invoca
 * `invoke()` directo para estos comandos.
 */

import { invoke } from '@tauri-apps/api/core';
import { commandClient } from './command.service';

// ── Tipos ────────────────────────────────────────────────────────────────────

// Deben reflejar las structs Rust en backend/src/cmd/terminal_local/mod.rs.
export interface LocalTermSpawnPayload {
  id?: string;
  cols: number;
  rows: number;
}

export interface LocalTermSpawnResponse {
  session_id: string;
  shell: string;
  user: string;
}

export interface LocalTermStdinPayload {
  id: string;
  data: string;
  encoding?: string | null;
}

export interface LocalTermStdinResponse {
  ok: boolean;
}

export interface LocalTermResizePayload {
  id: string;
  cols: number;
  rows: number;
}

export interface LocalTermResizeResponse {
  ok: boolean;
}

export interface LocalTermClosePayload {
  id: string;
}

export interface LocalTermCloseResponse {
  ok: boolean;
}

// ── Comandos ──────────────────────────────────────────────────────────────────

/** Spawnea una nueva terminal local (PTY nativa) y devuelve su sesión. */
export const localTermSpawn = async (id: string, cols: number, rows: number): Promise<LocalTermSpawnResponse> => {
  return commandClient.invoke<LocalTermSpawnPayload, LocalTermSpawnResponse>(
    'local_term_spawn',
    { id, cols, rows },
    { version: '1.0', retries: 0 },
  );
};

/** Señala al backend que la UI ya está lista para recibir output del panel. */
export const localTermUiReady = (id: string): Promise<void> =>
  invoke<void>('local_term_ui_ready', { id });

/** Envía datos (stdin) a un panel de terminal local activo. */
export const localTermStdin = async (id: string, data: string, encoding?: string): Promise<void> => {
  await commandClient.invoke<LocalTermStdinPayload, LocalTermStdinResponse>(
    'local_term_stdin',
    { id, data, encoding: encoding ?? null },
    { version: '1.0', retries: 3 },
  );
};

/** Redimensiona el panel PTY. */
export const localTermResize = async (id: string, cols: number, rows: number): Promise<void> => {
  await commandClient.invoke<LocalTermResizePayload, LocalTermResizeResponse>(
    'local_term_resize',
    { id, cols, rows },
    { version: '1.0', retries: 3 },
  );
};

/** Cierra y mata el proceso de un panel de terminal local. */
export const localTermClose = async (id: string): Promise<void> => {
  await commandClient.invoke<LocalTermClosePayload, LocalTermCloseResponse>(
    'local_term_close',
    { id },
    { version: '1.0', retries: 0 },
  );
};
