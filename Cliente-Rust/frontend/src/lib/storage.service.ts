/**
 * storage.service.ts
 *
 * Capa de servicio centralizada para almacenamiento de hosts y operaciones de FS local.
 * Consolida `src/api/storage.ts` (que puede eliminarse después de migrar todas las referencias).
 */

import { invoke } from '@tauri-apps/api/core';
import type { LocalEntry } from '@/types';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface HostPayload {
  host: string;
  port: number;
  user: string;
  password: string;
  name?: string;
  /** Para qué es el equipo (texto libre). Va en el JSON cifrado: el backend no le impone esquema. */
  description?: string;
}

export interface HostEntry {
  id: string;
  host: string;
  port: number;
  user: string;
  name?: string;
}

/**
 * Forma real de `list_hosts_entries` (ver storage.rs::list_hosts_entries) --
 * el comando arma a mano `{"file": name, "payload": payload_val}` con el
 * contenido YA descifrado (incluye password), no el `HostEntry` plano de
 * arriba (ese es de otro comando). `file` es el nombre de archivo dentro del
 * directorio de storage (ej. "abcd1234.json.enc") -- también sirve como el
 * `id` que espera `deleteHostFile`.
 */
export interface SavedHostFileEntry {
  file: string;
  payload: HostPayload;
}

// ── Hosts guardados ───────────────────────────────────────────────────────────

/** Guarda un host con cifrado maestro. */
export const saveHostWithMaster = (id: string, payload: HostPayload): Promise<void> => {
  const jsonPayload = JSON.stringify(payload);
  return invoke<void>('save_host_master', { id, jsonPayload });
};

/** Lista todas las entradas de hosts guardados. */
export const listHostEntries = (): Promise<SavedHostFileEntry[]> =>
  invoke<SavedHostFileEntry[]>('list_hosts_entries');

/** Elimina un archivo de host guardado. */
export const deleteHostFile = (id: string): Promise<void> =>
  invoke<void>('delete_host_file', { id });

// ── FS Local ──────────────────────────────────────────────────────────────────

/** Devuelve el directorio home del usuario local. */
export const localHomeDir = (): Promise<string> =>
  invoke<string>('local_home_dir');

/** Lista el contenido de un directorio local. */
export const localListDir = (path: string): Promise<LocalEntry[]> =>
  invoke<LocalEntry[]>('local_list_dir', { path });

/** Lista las unidades disponibles (Windows). */
export const localListDrives = (): Promise<string[]> =>
  invoke<string[]>('local_list_drives');

// ── Historial de chat ─────────────────────────────────────────────────────────

/** Historial por sesión y modo (ver `chat_history_*` en backend/src/cmd/filesystem/local.rs). `T` es la forma de cada entrada. */
export const chatHistoryLoad = <T = unknown>(sessionId: string, mode: string): Promise<T[]> =>
  invoke<T[]>('chat_history_load', { sessionId, mode });

export const chatHistorySave = (sessionId: string, mode: string, entries: unknown[]): Promise<void> =>
  invoke<void>('chat_history_save', { sessionId, mode, entries });

/** Devuelve el historial que queda tras borrar la entrada. */
export const chatHistoryDeleteEntry = <T = unknown>(sessionId: string, mode: string, entryId: string): Promise<T[]> =>
  invoke<T[]>('chat_history_delete_entry', { sessionId, mode, entryId });
