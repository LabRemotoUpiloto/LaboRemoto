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

/**
 * Envía datos (stdin) a un panel de terminal local activo.
 * `retries: 0` a propósito: reintentar stdin puede duplicar teclas si el
 * write sí se aplicó pero la respuesta se reportó como error transitorio.
 */
export const localTermStdin = async (id: string, data: string, encoding?: string): Promise<void> => {
  await commandClient.invoke<LocalTermStdinPayload, LocalTermStdinResponse>(
    'local_term_stdin',
    { id, data, encoding: encoding ?? null },
    { version: '1.0', retries: 0 },
  );
};

/** Redimensiona el panel PTY. Sin retries: un resize viejo re-aplicado
 *  provocaría un SIGWINCH extra con un tamaño ya obsoleto. */
export const localTermResize = async (id: string, cols: number, rows: number): Promise<void> => {
  await commandClient.invoke<LocalTermResizePayload, LocalTermResizeResponse>(
    'local_term_resize',
    { id, cols, rows },
    { version: '1.0', retries: 0 },
  );
};

/**
 * Guarda una imagen del portapapeles (base64, PNG) en un archivo temporal
 * y devuelve la ruta absoluta — para insertar en la terminal estilo Warp.
 * (Fallback para eventos DOM `paste` que traen la imagen en clipboardData.)
 */
export const localTermSavePasteImage = (dataBase64: string): Promise<string> =>
  invoke<string>('local_term_save_paste_image', { dataBase64 });

/** Contenido del portapapeles nativo, leído desde el backend (arboard). */
export type ClipboardContent =
  | { kind: 'image'; path: string }
  | { kind: 'text'; text: string }
  | { kind: 'empty' };

/**
 * Lee el portapapeles nativo vía backend. Necesario porque el webview corre
 * en http://tauri.localhost (contexto no seguro en Windows) y ahí
 * `navigator.clipboard` no existe. Si hay imagen, el backend ya la deja
 * guardada como PNG temporal y devuelve la ruta.
 */
export const localTermReadClipboard = (): Promise<ClipboardContent> =>
  invoke<ClipboardContent>('local_term_read_clipboard');

/** Escribe texto al portapapeles nativo vía backend (acción "Copiar"). */
export const localTermWriteClipboard = (text: string): Promise<void> =>
  invoke<void>('local_term_write_clipboard', { text });

/** Cierra y mata el proceso de un panel de terminal local. */
export const localTermClose = async (id: string): Promise<void> => {
  await commandClient.invoke<LocalTermClosePayload, LocalTermCloseResponse>(
    'local_term_close',
    { id },
    { version: '1.0', retries: 0 },
  );
};
