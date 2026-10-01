import { ERROR_PATTERNS, PROMPT_PATTERNS } from '../components/chatPane/chatPane.constants';

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

/** Extrae la línea que contiene el match en `idx` (índice exacto, no se re-busca el texto). */
function lineAroundMatch(stripped: string, idx: number, matchLen: number): string {
  if (idx < 0) return '';
  const lineStart = stripped.lastIndexOf('\n', idx) + 1;
  const lineEnd = stripped.indexOf('\n', idx + matchLen);
  const line = stripped.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
  return line || stripped.slice(idx, idx + matchLen).slice(0, 120);
}

/**
 * Busca errores en el texto bruto (tolerante a que un mensaje quede partido
 * en dos líneas visuales por el ancho de la terminal). Devuelve el ÚLTIMO
 * match, no el primero -- `stripped` puede traer más de un error si quedan
 * varios dentro de la ventana analizada, y quedarse con el primero es lo que
 * hacía que un error ya resuelto se siguiera mostrando para siempre
 * (bug: "queda guardada la salida con error primera").
 */
function analyzeTerminalFullText(stripped: string): TerminalErrorInsight | null {
  let best: { idx: number; len: number } | null = null;
  for (const pattern of ERROR_PATTERNS) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const globalPattern = new RegExp(pattern.source, flags);
    let m: RegExpExecArray | null;
    while ((m = globalPattern.exec(stripped)) !== null) {
      if (!best || m.index > best.idx) best = { idx: m.index, len: m[0].length };
      if (m[0].length === 0) globalPattern.lastIndex++; // por seguridad, nunca debería pasar con estos patrones
    }
  }
  if (!best) return null;
  const line = lineAroundMatch(stripped, best.idx, best.len);
  return { snippet: line.slice(0, 120), hint: hintForErrorLine(line) };
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

/**
 * Detecta un error reconocible, mirando SOLO la salida del último comando
 * (nunca líneas de comandos anteriores ya resueltos -- ver
 * `findLastCommandOutput`). Escanea de atrás para adelante para quedarse con
 * la línea de error más reciente dentro de esa salida, si hay más de una.
 */
export function analyzeTerminalLines(lines: string[]): TerminalErrorInsight | null {
  if (lines.length === 0) return null;

  const cmdOutput = findLastCommandOutput(lines);
  for (let i = cmdOutput.length - 1; i >= 0; i--) {
    const line = cmdOutput[i];
    if (!ERROR_PATTERNS.some(p => p.test(line))) continue;
    return {
      snippet: line.slice(0, 120),
      hint: hintForErrorLine(line),
    };
  }
  return null;
}

export function analyzeTerminalContext(raw: string): TerminalErrorInsight | null {
  if (!raw.trim() || /\x1b\[2J/.test(raw)) return null;

  // Todo el análisis (texto tolerante a corte de línea + línea por línea)
  // se restringe a la salida del ÚLTIMO comando -- nunca al buffer entero de
  // 80 líneas. Buscar en el buffer completo era el bug: un error de varios
  // comandos atrás seguía "encontrándose" para siempre mientras siguiera
  // dentro de esa ventana, aunque el comando más reciente haya salido bien.
  const lines = normalizeTerminalContext(raw);
  const cmdOutput = findLastCommandOutput(lines);
  const strippedCmdOutput = stripTerminalAnsi(cmdOutput.join('\n')).replace(/\r/g, '');

  const fromFullText = analyzeTerminalFullText(strippedCmdOutput);
  if (fromFullText) return fromFullText;

  return analyzeTerminalLines(lines);
}

/** true si la salida del último comando no contiene patrones de error (limpia tras un fix). */
export function terminalContextLooksClean(raw: string): boolean {
  if (!raw.trim() || /\x1b\[2J/.test(raw)) return true;
  const lines = normalizeTerminalContext(raw);
  const cmdOutput = findLastCommandOutput(lines);
  return !cmdOutput.some((line) => ERROR_PATTERNS.some((p) => p.test(line)));
}

/**
 * Detecta si la terminal quedó bloqueada esperando una respuesta interactiva
 * (Y/n, password, un diálogo whiptail/dialog tipo "<Ok>", etc.). Distinto de
 * `analyzeTerminalContext` (que mira la salida del último comando YA
 * terminado, entre dos prompts): acá no hay prompt final todavía -- un
 * prompt bloqueado es por definición lo ÚLTIMO que se imprimió, porque el
 * comando todavía no devolvió el control.
 */
export function analyzeTerminalPrompt(raw: string): TerminalErrorInsight | null {
  if (!raw.trim() || /\x1b\[2J/.test(raw)) return null;
  const lines = normalizeTerminalContext(raw);
  const tail = lines.slice(-8);
  for (let i = tail.length - 1; i >= 0; i--) {
    const line = tail[i];
    if (PROMPT_PATTERNS.some(p => p.test(line))) {
      return { snippet: line.slice(0, 160) };
    }
  }
  return null;
}
