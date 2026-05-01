/**
 * storage.service.ts
 *
 * Capa de servicio centralizada para almacenamiento de hosts y operaciones de FS local.
 * Consolida `src/api/storage.ts` (que puede eliminarse después de migrar todas las referencias).
 */

import { invoke } from '@tauri-apps/api/core';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface HostPayload {
  host: string;
  port: number;
  user: string;
  password: string;
  name?: string;
}

export interface HostEntry {
  id: string;
  host: string;
  port: number;
  user: string;
  name?: string;
}

// ── Hosts guardados ───────────────────────────────────────────────────────────

/** Guarda un host con cifrado maestro. */
export const saveHostWithMaster = (id: string, payload: HostPayload): Promise<void> => {
  const jsonPayload = JSON.stringify(payload);
  return invoke<void>('save_host_master', { id, jsonPayload });
};

/** Carga un host cifrado con la clave maestra. */
export const loadHostWithMaster = (id: string): Promise<string> =>
  invoke<string>('load_host_master', { id });

/** Guarda un host con cifrado simple (sin clave maestra). */
export const saveHostEncrypted = (id: string, payload: HostPayload): Promise<void> => {
  const jsonPayload = JSON.stringify(payload);
  return invoke<void>('save_host_encrypted', { id, jsonPayload });
};

/** Carga un host cifrado simple. */
export const loadHostEncrypted = (id: string): Promise<string> =>
  invoke<string>('load_host_encrypted', { id });

/** Lista todas las entradas de hosts guardados. */
export const listHostEntries = (): Promise<HostEntry[]> =>
  invoke<HostEntry[]>('list_hosts_entries');

/** Lista los archivos de hosts disponibles. */
export const listHostFiles = (): Promise<string[]> =>
  invoke<string[]>('list_hosts_files');

/** Elimina un archivo de host guardado. */
export const deleteHostFile = (id: string): Promise<void> =>
  invoke<void>('delete_host_file', { id });

// ── FS Local ──────────────────────────────────────────────────────────────────

/** Devuelve el directorio home del usuario local. */
export const localHomeDir = (): Promise<string> =>
  invoke<string>('local_home_dir');

/** Lista el contenido de un directorio local. */
export const localListDir = (path: string) =>
  invoke('local_list_dir', { path });

/** Lista las unidades disponibles (Windows). */
export const localListDrives = () =>
  invoke('local_list_drives');

/** Guarda un archivo de texto en el FS local. */
export const saveTextFile = (path: string, content: string): Promise<void> =>
  invoke<void>('save_text_file', { path, content });

// ── Historial de chat ─────────────────────────────────────────────────────────

export const chatHistoryLoad = (key: string) =>
  invoke('chat_history_load', { key });

export const chatHistorySave = (key: string, data: unknown): Promise<void> =>
  invoke<void>('chat_history_save', { key, data: JSON.stringify(data) });

export const chatHistoryDeleteEntry = (key: string, entryId: string): Promise<void> =>
  invoke<void>('chat_history_delete_entry', { key, entryId });
