/**
 * Utility to extract valid Linux commands from a terminal HTML/Text buffer.
 */

// A comprehensive but not exhaustive set of common Linux commands and utilities.
// This is used to filter out typos or non-commands from the heuristic extraction.
const COMMON_COMMANDS = new Set([
  'ls', 'cd', 'pwd', 'cat', 'echo', 'rm', 'cp', 'mv', 'mkdir', 'rmdir', 'touch',
  'ln', 'find', 'grep', 'awk', 'sed', 'head', 'tail', 'less', 'more', 'nano', 'vim', 'vi',
  'df', 'du', 'free', 'top', 'htop', 'ps', 'kill', 'killall', 'pkill', 'bg', 'fg', 'jobs',
  'tar', 'gzip', 'gunzip', 'zip', 'unzip', 'bzip2', 'xz',
  'chmod', 'chown', 'chgrp', 'usermod', 'useradd', 'userdel', 'groupadd', 'passwd',
  'su', 'sudo', 'apt', 'apt-get', 'dpkg', 'yum', 'dnf', 'rpm', 'pacman', 'zypper',
  'systemctl', 'journalctl', 'service', 'chkconfig',
  'ping', 'netstat', 'ss', 'ip', 'ifconfig', 'curl', 'wget', 'ssh', 'scp', 'rsync', 'ftp', 'sftp', 'telnet', 'nc', 'nmap',
  'docker', 'docker-compose', 'kubectl', 'git', 'svn', 'hg',
  'python', 'python3', 'pip', 'pip3', 'node', 'npm', 'yarn', 'pnpm', 'npx', 'ruby', 'gem', 'go', 'cargo', 'rustc', 'php', 'composer', 'java', 'javac', 'mvn', 'gradle',
  'bash', 'sh', 'zsh', 'fish', 'tmux', 'screen', 'clear', 'history', 'alias', 'unalias', 'export', 'source',
  'make', 'cmake', 'gcc', 'g++', 'clang',
  'mysql', 'psql', 'sqlite3', 'mongo', 'redis-cli',
  'htpasswd', 'apache2ctl', 'nginx',
  'crontab', 'at', 'date', 'cal', 'uptime', 'whoami', 'id', 'groups', 'who', 'w', 'last',
  // Raspberry Pi specifics that might be relevant based on the codebase
  'raspi-gpio', 'vcgencmd', 'pinout'
]);

export function extractValidCommands(htmlContent: string): string[] {
  // 1. Strip HTML tags to get raw text, replacing <br> and <div> with newlines
  let text = htmlContent
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]*>?/gm, ''); // remove all other tags
    
  // Convert HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  const lines = text.split('\n');
  const commands: string[] = [];

  // Regex to detect common terminal prompts:
  // e.g., user@hostname:~$ 
  // e.g., root@hostname:/var/log#
  // This looks for a $, #, or % followed by a space, which is the standard prompt ending.
  const promptRegex = /[$#%]\s+(.*)$/;

  for (const line of lines) {
    const match = line.match(promptRegex);
    if (match && match[1]) {
      // The text after the prompt
      let possibleCommand = match[1].trim();
      
      // Clean up common terminal garbage (like unexpected control characters if any survived)
      possibleCommand = possibleCommand.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
      
      if (!possibleCommand) continue;

      // Extract the primary command (first word)
      const firstWord = possibleCommand.split(/\s+/)[0];
      
      // Remove any leading path stuff for the check (e.g., ./script.sh -> script.sh, /usr/bin/python -> python)
      const baseCommand = firstWord.split('/').pop() || firstWord;

      // Check if it's a known valid command OR if it's an execution of a local script (./)
      if (COMMON_COMMANDS.has(baseCommand) || firstWord.startsWith('./') || firstWord.startsWith('/')) {
        // avoid duplicates in immediate succession (e.g. if the user hit enter multiple times with the same command lying around, or visual glitches from terminal redraws)
        if (commands.length === 0 || commands[commands.length - 1] !== possibleCommand) {
          commands.push(possibleCommand);
        }
      }
    }
  }

  return commands;
}

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
