/**
 * Utilidad para armar el reporte PDF de comandos de una sesión. La
 * extracción de los comandos en sí (`extractValidCommands`) corre ahora en
 * el backend (`cmd/logs/logs.rs::extract_session_commands`) — ver
 * `services/session.service.ts::extractSessionCommands`.
 */

import { unipilotoLogo } from '../assets/logoBase64';

/**
 * Builds the HTML content for the Commands Report PDF.
 */
export function buildCommandsReportHtml(
  commands: string[],
  metadata: {
    sessionId: string;
    user: string;
    host: string;
    startTime: string;
    endTime?: string;
  }
): string {
  const safeHost = metadata.host || "unknown";
  const safeUser = metadata.user || "unknown";
  
  const formattedDate = new Date(metadata.startTime).toLocaleString('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'medium'
  });

  // Unipiloto colors: Red #C0281D, Dark Red #8B1B13, Dark Gray #3D3D3D, Black #111111
  const primaryRed = '#C0281D';
  const darkRed = '#8B1B13';
  const darkGray = '#3D3D3D';
  const almostBlack = '#111111';

  const commandsListHtml = commands.length > 0
    ? commands.map((cmd, i) => `
      <div style="background-color: #F5F5F5; border-left: 4px solid ${primaryRed}; padding: 12px 20px; margin-bottom: 10px; border-radius: 0 4px 4px 0; display: flex; align-items: flex-start; font-size: 14px;">
        <div style="color: ${darkGray}; width: 35px; min-width: 35px; user-select: none; font-weight: bold;">${i + 1}.</div>
        <div style="font-family: 'Courier New', Courier, monospace; color: ${almostBlack}; word-break: break-all; flex: 1;">${cmd}</div>
      </div>
      `).join('')
    : '<div style="background-color: #F5F5F5; border-left: 4px solid #ADADAD; padding: 15px; text-align: center; color: #ADADAD; font-style: italic; border-radius: 0 4px 4px 0;">No se detectaron comandos válidos en esta sesión.</div>';

  return `
    <div style="background-color: #ffffff; color: ${almostBlack}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 40px; box-sizing: border-box;">
      
      <!-- HEADER CON LOGO -->
      <table style="width: 100%; border-bottom: 3px solid ${primaryRed}; padding-bottom: 20px; margin-bottom: 30px;">
        <tr>
          <td style="width: 100px; vertical-align: middle;">
            <img src="${unipilotoLogo}" alt="Logo Unipiloto" style="width: 100px; height: auto;" />
          </td>
          <td style="vertical-align: middle; padding-left: 20px;">
            <h1 style="color: ${darkRed}; margin: 0; font-size: 24px; font-weight: 700; font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; letter-spacing: 0.5px;">Reportes de Sesión</h1>
          </td>
        </tr>
      </table>
      
      <!-- INFO DE CONEXION -->
      <div style="background-color: #F5F5F5; border-left: 4px solid ${primaryRed}; padding: 15px 20px; margin-bottom: 30px; border-radius: 0 4px 4px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 4px 0; color: ${darkGray}; width: 150px; font-weight: bold;">ID Sesión:</td>
            <td style="padding: 4px 0; color: ${almostBlack}; font-family: monospace;">${metadata.sessionId}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: ${darkGray}; font-weight: bold;">Destino:</td>
            <td style="padding: 4px 0; color: ${primaryRed}; font-weight: bold;">${safeUser}@${safeHost}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: ${darkGray}; font-weight: bold;">Fecha de Conexión:</td>
            <td style="padding: 4px 0; color: ${almostBlack};">${formattedDate}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: ${darkGray}; font-weight: bold;">Comandos Detectados:</td>
            <td style="padding: 4px 0; color: ${almostBlack};">${commands.length}</td>
          </tr>
        </table>
      </div>

      <!-- LISTA DE COMANDOS -->
      <h3 style="color: ${darkRed}; font-size: 18px; margin-bottom: 15px; border-bottom: 1px solid #ADADAD; padding-bottom: 5px;">Historial de Ejecución</h3>
      
      <div>
        ${commandsListHtml}
      </div>
      
      <!-- FOOTER -->
      <div style="margin-top: 50px; text-align: center; color: #ADADAD; font-size: 11px; border-top: 1px solid #E8E8E8; padding-top: 20px;">
        Universidad Piloto de Colombia - Sistema de Laboratorios Remotos<br/>
        Documento generado automáticamente.
      </div>
    </div>
  `;
}
