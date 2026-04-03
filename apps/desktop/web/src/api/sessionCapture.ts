/**
 * API para captura y almacenamiento de sesiones SSH
 * Convierte el buffer de xterm.js a HTML y lo envía al backend para persistencia
 */

import { invoke } from '@tauri-apps/api/core';
import AnsiToHtml from 'ansi-to-html';

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

/**
 * Procesa el stream del terminal simulando cómo xterm maneja backspaces
 * NO procesamos \r porque puede causar pérdida de contenido
 */
function processTerminalStream(text: string): string {
  // Primero limpiar códigos de control que no sean de color
  const cleaned = cleanAnsiControlSequences(text);
  
  // Simplemente procesar backspaces carácter por carácter
  let result = '';
  
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    
    // Manejar backspace (\b o \x7F) - borrar carácter anterior
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
 * Limpia secuencias de escape ANSI de control que NO son de color/formato
 * IMPORTANTE: NO toca las secuencias SGR (Select Graphic Rendition) que terminan en 'm'
 */
function cleanAnsiControlSequences(text: string): string {
  return text
    // Reemplazar secuencias de 'clear' con un separador visible
    .replace(/\x1b\[H\x1b\[2J/g, '\n\n──────────── CLEAR ────────────\n\n')
    .replace(/\x1b\[2J\x1b\[H/g, '\n\n──────────── CLEAR ────────────\n\n')
    .replace(/\x1b\[3J/g, '\n\n──────────── CLEAR ────────────\n\n')
    // Eliminar secuencias de modo del terminal
    .replace(/\x1b\[\?[0-9;]+[hl]/g, '')
    // Eliminar secuencias OSC (Operating System Command)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    // Eliminar bracketed paste mode
    .replace(/\x1b\[200~|\x1b\[201~/g, '')
    // Eliminar secuencias de cursor save/restore
    .replace(/\x1b\[s|\x1b\[u/g, '')
    .replace(/\x1b7|\x1b8/g, '')
    // Eliminar secuencias de configuración de charset
    .replace(/\x1b\([AB0]/g, '')
    // Eliminar secuencias de movimiento de cursor (PERO NO las que terminan en 'm' que son colores)
    .replace(/\x1b\[[0-9]*A/g, '')  // Cursor up
    .replace(/\x1b\[[0-9]*B/g, '')  // Cursor down
    .replace(/\x1b\[[0-9]*C/g, '')  // Cursor forward
    .replace(/\x1b\[[0-9]*D/g, '')  // Cursor back
    .replace(/\x1b\[[0-9]*E/g, '')  // Cursor next line
    .replace(/\x1b\[[0-9]*F/g, '')  // Cursor previous line
    .replace(/\x1b\[[0-9]*G/g, '')  // Cursor horizontal absolute
    // Eliminar secuencias de posicionamiento de cursor (H y f, PERO NO m)
    .replace(/\x1b\[[0-9;]*H/g, '')
    .replace(/\x1b\[[0-9;]*f/g, '')
    // Eliminar secuencias de borrado (J y K, PERO NO m)
    .replace(/\x1b\[[0-9]*J/g, '')
    .replace(/\x1b\[[0-9]*K/g, '')
    // Eliminar scrolling
    .replace(/\x1b\[[0-9;]*r/g, '')
    // Eliminar insert/delete lines y characters
    .replace(/\x1b\[[0-9]*L/g, '')
    .replace(/\x1b\[[0-9]*M/g, '')
    .replace(/\x1b\[[0-9]*@/g, '')
    .replace(/\x1b\[[0-9]*P/g, '')
    // Eliminar caracteres de control no imprimibles EXCEPTO \n, \r, \t y ESC
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1A\x1C-\x1F\x7F]/g, '');
    // NO eliminamos \x1b (ESC) porque es necesario para los códigos ANSI de color
}

/**
 * Convierte códigos ANSI a HTML con colores preservados
 */
function convertAnsiToHtml(ansiText: string): string {
  // Procesar el stream completo (backspaces, carriage returns, limpieza de control)
  const processedText = processTerminalStream(ansiText);
  
  const converter = new AnsiToHtml({
    fg: '#d4d4d4',
    bg: '#1e1e1e',
    newline: true,
    escapeXML: true,  // Cambiar a true para seguridad
    stream: false,     // No usar stream mode
    colors: {
      0: '#1e1e1e',   // black
      1: '#cd3131',   // red
      2: '#0dbc79',   // green
      3: '#e5e510',   // yellow
      4: '#2472c8',   // blue
      5: '#bc3fbc',   // magenta
      6: '#11a8cd',   // cyan
      7: '#e5e5e5',   // white
      8: '#666666',   // bright black
      9: '#f14c4c',   // bright red
      10: '#23d18b',  // bright green
      11: '#f5f543',  // bright yellow
      12: '#3b8eea',  // bright blue
      13: '#d670d6',  // bright magenta
      14: '#29b8db',  // bright cyan
      15: '#e5e5e5',  // bright white
    }
  });

  return converter.toHtml(processedText);
}

/**
 * Genera HTML completo con estructura y estilos para el log de sesión
 */
// Eliminada generación de HTML completo en frontend; se realiza en el backend

/**
 * Calcula la duración formateada entre dos timestamps
 */
function calculateDuration(startTime: string, endTime: string): string {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const diffMs = end - start;
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Captura el buffer completo de una sesión y lo guarda
 */
export async function captureAndSaveSession(
  serializedContent: string,
  metadata: SessionMetadata
): Promise<void> {
  try {
    const htmlContent = convertAnsiToHtml(serializedContent);

    await invoke('save_session_log_fragment', {
      sessionId: metadata.sessionId,
      user: metadata.user,
      host: metadata.host,
      port: metadata.port,
      startTime: metadata.startTime,
      endTime: metadata.endTime,
      htmlFragment: htmlContent,
    });
  } catch (error) {
    throw error;
  }
}

/**
 * Captura y guarda sesión en la nube (Supabase)
 * Similar a captureAndSaveSession pero usa comandos cloud con user_id
 */
// Cloud capture removed: sin autenticación ni Supabase

/**
 * Lista todos los logs de sesión disponibles
 */
export async function listSessionLogs(): Promise<SessionLogMetadata[]> {
  try {
    return await invoke<SessionLogMetadata[]>('list_session_logs');
  } catch (error) {
    throw error;
  }
}

/**
 * Obtiene el contenido HTML de un log específico
 */
export async function getSessionLogContent(sessionId: string): Promise<string> {
  try {
    return await invoke<string>('get_session_log_content', { sessionId });
  } catch (error) {
    throw error;
  }
}

/**
 * Obtiene un log completo (metadatos + contenido)
 */
export async function getSessionLog(sessionId: string): Promise<SessionLog> {
  try {
    return await invoke<SessionLog>('get_session_log', { sessionId });
  } catch (error) {
    throw error;
  }
}

/**
 * Elimina un log de sesión
 */
export async function deleteSessionLog(sessionId: string): Promise<void> {
  try {
    await invoke('delete_session_log', { sessionId });
  } catch (error) {
    throw error;
  }
}

/**
 * Limpia logs antiguos según política de retención
 */
export async function cleanupOldLogs(days: number): Promise<number> {
  try {
    return await invoke<number>('cleanup_old_session_logs', { days });
  } catch (error) {
    throw error;
  }
}

// ============================================================================
// CLOUD STORAGE FUNCTIONS (Supabase)
// ============================================================================

// Eliminado: SaveLogCloudRequest (Supabase)

/**
 * Guarda un log de sesión en Supabase (Storage o DB)
 */
// Eliminado: saveSessionLogCloud (Supabase)

/**
 * Obtiene los logs de sesión de un usuario desde Supabase
 */
// Eliminado: getUserSessionLogs (Supabase)

/**
 * Obtiene el contenido HTML de un log desde Supabase Storage o DB
 */
// Eliminado: getLogHtmlContent (Supabase)

/**
 * Obtiene los logs de sesión filtrados por rol del usuario
 * - Estudiante (role_id=1): solo sus propios logs
 * - Profesor (role_id=2): logs de estudiantes de sus grupos
 * - Admin (role_id=3): todos los logs
 */
// Eliminado: getSessionLogsByRole (Supabase)

/**
 * Obtiene el contenido HTML de un log desde Supabase (DB o Storage)
 */
// Eliminado: getLogHtmlContentCloud (Supabase)
