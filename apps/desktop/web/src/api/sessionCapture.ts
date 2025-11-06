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
 * Convierte códigos ANSI a HTML con colores preservados
 */
function convertAnsiToHtml(ansiText: string): string {
  const converter = new AnsiToHtml({
    fg: '#d4d4d4',
    bg: '#1e1e1e',
    newline: true,
    escapeXML: false,
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

  return converter.toHtml(ansiText);
}

/**
 * Genera HTML completo con estructura y estilos para el log de sesión
 */
function generateSessionHtml(metadata: SessionMetadata, terminalContent: string): string {
  const duration = calculateDuration(metadata.startTime, metadata.endTime);
  
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Session ${metadata.sessionId}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      background: #1e1e1e;
      color: #d4d4d4;
      font-family: 'Cascadia Code', 'Fira Code', 'Consolas', 'Monaco', monospace;
      font-size: 14px;
      line-height: 1.5;
    }
    
    .session-header {
      background: #252526;
      border-bottom: 2px solid #007acc;
      padding: 1.5rem 2rem;
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }
    
    .session-header h1 {
      color: #007acc;
      font-size: 1.5rem;
      margin-bottom: 0.75rem;
      font-weight: 600;
    }
    
    .session-info {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 0.75rem;
      color: #cccccc;
      font-size: 0.9rem;
    }
    
    .info-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .info-label {
      color: #858585;
      font-weight: 600;
    }
    
    .info-value {
      color: #d4d4d4;
    }
    
    .terminal-content {
      padding: 2rem;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow-x: auto;
      font-size: 14px;
      line-height: 1.4;
    }
    
    /* Scrollbar personalizado */
    ::-webkit-scrollbar {
      width: 12px;
      height: 12px;
    }
    
    ::-webkit-scrollbar-track {
      background: #1e1e1e;
    }
    
    ::-webkit-scrollbar-thumb {
      background: #424242;
      border-radius: 6px;
    }
    
    ::-webkit-scrollbar-thumb:hover {
      background: #4e4e4e;
    }
    
    /* Estilos para selección de texto */
    ::selection {
      background: #264f78;
      color: #ffffff;
    }
  </style>
</head>
<body>
  <div class="session-header">
    <h1>📝 SSH Session Log</h1>
    <div class="session-info">
      <div class="info-item">
        <span class="info-label">Connection:</span>
        <span class="info-value">${metadata.user}@${metadata.host}:${metadata.port}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Session ID:</span>
        <span class="info-value">${metadata.sessionId.substring(0, 8)}...</span>
      </div>
      <div class="info-item">
        <span class="info-label">Start:</span>
        <span class="info-value">${new Date(metadata.startTime).toLocaleString()}</span>
      </div>
      <div class="info-item">
        <span class="info-label">End:</span>
        <span class="info-value">${new Date(metadata.endTime).toLocaleString()}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Duration:</span>
        <span class="info-value">${duration}</span>
      </div>
    </div>
  </div>
  <div class="terminal-content">${terminalContent}</div>
</body>
</html>`;
}

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
    // Convertir contenido ANSI a HTML
    const htmlContent = convertAnsiToHtml(serializedContent);
    
    // Generar HTML completo con estructura
    const fullHtml = generateSessionHtml(metadata, htmlContent);
    
    // Guardar en el backend
    await invoke('save_session_log', {
      sessionId: metadata.sessionId,
      user: metadata.user,
      host: metadata.host,
      port: metadata.port,
      startTime: metadata.startTime,
      endTime: metadata.endTime,
      htmlContent: fullHtml,
    });
    
    console.log(`✅ Session log saved: ${metadata.sessionId}`);
  } catch (error) {
    console.error('❌ Error saving session log:', error);
    throw error;
  }
}

/**
 * Lista todos los logs de sesión disponibles
 */
export async function listSessionLogs(): Promise<SessionLogMetadata[]> {
  try {
    return await invoke<SessionLogMetadata[]>('list_session_logs');
  } catch (error) {
    console.error('❌ Error listing session logs:', error);
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
    console.error(`❌ Error getting log content for ${sessionId}:`, error);
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
    console.error(`❌ Error getting log for ${sessionId}:`, error);
    throw error;
  }
}

/**
 * Elimina un log de sesión
 */
export async function deleteSessionLog(sessionId: string): Promise<void> {
  try {
    await invoke('delete_session_log', { sessionId });
    console.log(`🗑️ Session log deleted: ${sessionId}`);
  } catch (error) {
    console.error(`❌ Error deleting log ${sessionId}:`, error);
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
    console.error('❌ Error cleaning up old logs:', error);
    throw error;
  }
}
