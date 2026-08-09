/**
 * session.service.ts
 *
 * Capa de servicio para la gestión de logs de sesión y capturas.
 * La conversión de ANSI a HTML corre en el backend (`cmd/logs/ansi_html.rs`)
 * — este módulo solo manda el buffer crudo y consume los comandos Tauri.
 */

import { invoke } from '@tauri-apps/api/core';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface SessionMetadata {
  sessionId: string;
  user: string;
  host: string;
  port: number;
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
}

export interface SessionLogMetadata {
  session_id: string;
  user: string;
  host: string;
  port: number;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  buffer_size_bytes: number;
  command_count: number | null;
}

export interface SessionLog {
  metadata: SessionLogMetadata;
  html_content: string;
}

// ── Comandos ──────────────────────────────────────────────────────────────────

/**
 * Captura el buffer completo de una sesión y lo guarda en el backend.
 * El buffer serializado (ANSI crudo) se manda tal cual — la conversión a
 * HTML corre en Rust (`save_session_log_fragment` → `ansi_html::convert_ansi_to_html`).
 */
export async function captureAndSaveSession(
  serializedContent: string,
  metadata: SessionMetadata
): Promise<void> {
  return invoke('save_session_log_fragment', {
    sessionId: metadata.sessionId,
    user: metadata.user,
    host: metadata.host,
    port: metadata.port,
    startTime: metadata.startTime,
    endTime: metadata.endTime,
    rawContent: serializedContent,
  });
}

/**
 * Lista todos los logs de sesión disponibles.
 */
export const listSessionLogs = (): Promise<SessionLogMetadata[]> =>
  invoke<SessionLogMetadata[]>('list_session_logs');

/**
 * Obtiene el contenido HTML de un log específico.
 */
export const getSessionLogContent = (sessionId: string): Promise<string> =>
  invoke<string>('get_session_log_content', { sessionId });

/**
 * Elimina un log de sesión.
 */
export const deleteSessionLog = (sessionId: string): Promise<void> =>
  invoke<void>('delete_session_log', { sessionId });

/**
 * Extrae la lista de comandos válidos detectados en el log de una sesión
 * (usado para el reporte PDF). El backend lee el HTML guardado y filtra
 * contra su lista de comandos Linux conocidos.
 */
export const extractSessionCommands = (sessionId: string): Promise<string[]> =>
  invoke<string[]>('extract_session_commands', { sessionId });
