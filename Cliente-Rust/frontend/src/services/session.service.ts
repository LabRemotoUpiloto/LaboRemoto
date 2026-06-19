/**
 * session.service.ts
 * 
 * Capa de servicio para la gestión de logs de sesión y capturas.
 * Centraliza la conversión de ANSI a HTML y la comunicación con el backend.
 */

import { invoke } from '@tauri-apps/api/core';
import AnsiToHtml from 'ansi-to-html';

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

// ── Utilidades Internas ───────────────────────────────────────────────────────

/**
 * Procesa el stream del terminal simulando cómo xterm maneja backspaces.
 */
function processTerminalStream(text: string): string {
  const cleaned = cleanAnsiControlSequences(text);
  let result = '';
  
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (char === '\b' || char === '\x7F') {
      if (result.length > 0 && result[result.length - 1] !== '\n') {
        result = result.slice(0, -1);
      }
      continue;
    }
    result += char;
  }
  return result;
}

/**
 * Limpia secuencias de escape ANSI de control que NO son de color/formato.
 */
function cleanAnsiControlSequences(text: string): string {
  return text
    .replace(/\x1b\[H\x1b\[2J/g, '\n\n──────────── CLEAR ────────────\n\n')
    .replace(/\x1b\[2J\x1b\[H/g, '\n\n──────────── CLEAR ────────────\n\n')
    .replace(/\x1b\[3J/g, '\n\n──────────── CLEAR ────────────\n\n')
    .replace(/\x1b\[\?[0-9;]+[hl]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[200~|\x1b\[201~/g, '')
    .replace(/\x1b\[s|\x1b\[u/g, '')
    .replace(/\x1b7|\x1b8/g, '')
    .replace(/\x1b\([AB0]/g, '')
    .replace(/\x1b\[[0-9]*A/g, '')
    .replace(/\x1b\[[0-9]*B/g, '')
    .replace(/\x1b\[[0-9]*C/g, '')
    .replace(/\x1b\[[0-9]*D/g, '')
    .replace(/\x1b\[[0-9]*E/g, '')
    .replace(/\x1b\[[0-9]*F/g, '')
    .replace(/\x1b\[[0-9]*G/g, '')
    .replace(/\x1b\[[0-9;]*H/g, '')
    .replace(/\x1b\[[0-9;]*f/g, '')
    .replace(/\x1b\[[0-9]*J/g, '')
    .replace(/\x1b\[[0-9]*K/g, '')
    .replace(/\x1b\[[0-9;]*r/g, '')
    .replace(/\x1b\[[0-9]*L/g, '')
    .replace(/\x1b\[[0-9]*M/g, '')
    .replace(/\x1b\[[0-9]*@/g, '')
    .replace(/\x1b\[[0-9]*P/g, '')
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1A\x1C-\x1F\x7F]/g, '');
}

/**
 * Convierte códigos ANSI a HTML con colores preservados.
 */
function convertAnsiToHtml(ansiText: string): string {
  const processedText = processTerminalStream(ansiText);
  const converter = new AnsiToHtml({
    fg: '#d4d4d4',
    bg: '#1e1e1e',
    newline: true,
    escapeXML: true,
    stream: false,
    colors: {
      0: '#1e1e1e', 1: '#cd3131', 2: '#0dbc79', 3: '#e5e510',
      4: '#2472c8', 5: '#bc3fbc', 6: '#11a8cd', 7: '#e5e5e5',
      8: '#666666', 9: '#f14c4c', 10: '#23d18b', 11: '#f5f543',
      12: '#3b8eea', 13: '#d670d6', 14: '#29b8db', 15: '#e5e5e5',
    }
  });
  return converter.toHtml(processedText);
}

// ── Comandos ──────────────────────────────────────────────────────────────────

/**
 * Captura el buffer completo de una sesión y lo guarda en el backend.
 */
export async function captureAndSaveSession(
  serializedContent: string,
  metadata: SessionMetadata
): Promise<void> {
  const htmlContent = convertAnsiToHtml(serializedContent);
  return invoke('save_session_log_fragment', {
    sessionId: metadata.sessionId,
    user: metadata.user,
    host: metadata.host,
    port: metadata.port,
    startTime: metadata.startTime,
    endTime: metadata.endTime,
    htmlFragment: htmlContent,
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
