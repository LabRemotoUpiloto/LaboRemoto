import { ERROR_PATTERNS } from '../components/chatPane/chatPane.constants';

/** Línea que parece prompt de shell (con o sin comando ya escrito). */
export function isPromptLine(line: string): boolean {
  if (line.length >= 120) return false;
  return /[\$#%>](?:[ \t]{0,3}$|[ \t]\S)/.test(line);
}

export function stripTerminalAnsi(raw: string): string {
  return raw
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '');
}

/** Normaliza salida PTY: quita ANSI y deja el fragmento visible tras el último \\r de cada línea. */
export function normalizeTerminalContext(raw: string): string[] {
  const noAnsi = stripTerminalAnsi(raw);
  return noAnsi
    .split('\n')
    .map(line => {
      const parts = line.split('\r').filter(p => p.length > 0);
      return (parts.length ? parts[parts.length - 1] : line).trim();
    })
    .filter(Boolean);
}

const COMMAND_NOT_FOUND = /(?:^|\s)(?:-bash|bash|sh|zsh):\s*([^\s:]+):\s*command not found/i;

/** Sugerencias rápidas para typos frecuentes en laboratorio Linux. */
function hintForCommandNotFound(line: string): string | undefined {
  const m = line.match(COMMAND_NOT_FOUND);
  const cmd = m?.[1]?.trim();
  if (!cmd) return 'El comando no existe en esta shell. Prueba con `ls`, `ls -a` o escribe `help`.';

  const fixes: Record<string, string> = {
    la: '`ls -a` o `ls -la` (listar archivos; `la` no es un comando)',
    ll: '`ls -l` (listado largo)',
    clr: '`clear` (limpiar pantalla)',
    dir: '`ls` (en Linux no existe `dir` como en Windows)',
    copy: '`cp` (copiar archivos)',
    move: '`mv` (mover o renombrar)',
    del: '`rm` (eliminar; con cuidado)',
    type: '`cat` (mostrar contenido de un archivo)',
  };

  const fix = fixes[cmd.toLowerCase()];
  if (fix) return `Quizá quisiste decir ${fix}.`;
  return `El comando \`${cmd}\` no está instalado o no existe. Usa \`which ${cmd}\` o prueba un comando equivalente (p. ej. \`ls\`).`;
}

function hintForErrorLine(line: string): string | undefined {
  if (COMMAND_NOT_FOUND.test(line)) return hintForCommandNotFound(line);
  if (/permission denied/i.test(line)) {
    return 'Faltan permisos: prueba con `sudo` si corresponde, o revisa dueño y modo (`ls -l`).';
  }
  if (/no such file or directory/i.test(line)) {
    return 'Ruta incorrecta o archivo inexistente. Verifica con `ls` o `pwd` antes de volver a ejecutar.';
  }
  return undefined;
}

/** Extrae la línea que contiene el primer match de un patrón en el texto completo. */
function lineAroundMatch(stripped: string, matchText: string): string {
  const idx = stripped.indexOf(matchText);
  if (idx < 0) return matchText.slice(0, 120);
  const lineStart = stripped.lastIndexOf('\n', idx) + 1;
  const lineEnd = stripped.indexOf('\n', idx + matchText.length);
  const line = stripped.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
  return line || matchText.slice(0, 120);
}

/** Busca errores en el texto bruto (tolerante a cortes entre chunks SSH). */
function analyzeTerminalFullText(stripped: string): TerminalErrorInsight | null {
  for (const pattern of ERROR_PATTERNS) {
    const m = stripped.match(pattern);
    if (!m?.[0]) continue;
    const line = lineAroundMatch(stripped, m[0]);
    return { snippet: line.slice(0, 120), hint: hintForErrorLine(line) };
  }
  return null;
}

function findLastCommandOutput(lines: string[]): string[] {
  const promptIdxs: number[] = [];
  lines.forEach((l, i) => {
    if (isPromptLine(l)) promptIdxs.push(i);
  });
  if (promptIdxs.length >= 2) {
    const start = promptIdxs[promptIdxs.length - 2];
    const end = promptIdxs[promptIdxs.length - 1];
    return lines.slice(start + 1, end);
  }
  return lines.slice(-12);
}

export type TerminalErrorInsight = { snippet: string; hint?: string };

/** Detecta la última línea de error reconocible y una pista de corrección. */
export function analyzeTerminalLines(lines: string[]): TerminalErrorInsight | null {
  if (lines.length === 0) return null;

  const cmdOutput = findLastCommandOutput(lines);
  const scanBlocks = [cmdOutput, lines.slice(-15), lines];

  for (const block of scanBlocks) {
    for (let i = block.length - 1; i >= 0; i--) {
      const line = block[i];
      if (!ERROR_PATTERNS.some(p => p.test(line))) continue;
      return {
        snippet: line.slice(0, 120),
        hint: hintForErrorLine(line),
      };
    }
  }
  return null;
}

export function analyzeTerminalContext(raw: string): TerminalErrorInsight | null {
  if (!raw.trim() || /\x1b\[2J/.test(raw)) return null;

  const stripped = stripTerminalAnsi(raw).replace(/\r/g, '');
  const fromFullText = analyzeTerminalFullText(stripped);
  if (fromFullText) return fromFullText;

  const lines = normalizeTerminalContext(raw);
  return analyzeTerminalLines(lines);
}

/** true si el buffer ya no contiene patrones de error (salida limpia tras un fix). */
export function terminalContextLooksClean(raw: string): boolean {
  if (!raw.trim() || /\x1b\[2J/.test(raw)) return true;
  const stripped = stripTerminalAnsi(raw).replace(/\r/g, '');
  return !ERROR_PATTERNS.some(p => p.test(stripped));
}
