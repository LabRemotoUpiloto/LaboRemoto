import type { AgentStep } from '../components/chatModes/types';

function parseToolInput(input?: string | null): Record<string, unknown> {
  if (!input) return {};
  try {
    const parsed = JSON.parse(input);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function str(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

function commandLabel(cmd: string, phase: 'running' | 'done'): string {
  return phase === 'running' ? `Ejecutando: ${cmd}` : `Comando: ${cmd}`;
}

/** Etiqueta principal en la línea de tiempo para una herramienta del agente. */
export function formatAgentToolLabel(
  name: string,
  input: Record<string, unknown>,
  phase: 'running' | 'done',
): string {
  const cmd = str(input.comando ?? input.command);
  if (cmd) {
    return commandLabel(cmd, phase);
  }

  switch (name) {
    case 'estado_raspberry':
      return phase === 'running' ? 'Revisando .env (PI4_USER, PI4_HOST)…' : 'Configuración Pi4 en .env';
    case 'leer_archivo':
      return phase === 'running'
        ? `SFTP lectura: ${str(input.ruta ?? input.path) || 'archivo'}`
        : `SFTP leído: ${str(input.ruta ?? input.path) || 'archivo'}`;
    case 'escribir_archivo':
      return phase === 'running'
        ? `SFTP escritura: ${str(input.ruta ?? input.path) || 'archivo'}`
        : `SFTP escrito: ${str(input.ruta ?? input.path) || 'archivo'}`;
    case 'get_terminal_output':
      return phase === 'running' ? 'Leyendo buffer de la terminal…' : 'Buffer de terminal leído';
    default:
      return phase === 'running' ? `${name}…` : name;
  }
}

function firstOutputLine(output: string, skipPrefixes: string[] = []): string | undefined {
  const line = output
    .trim()
    .split('\n')
    .map(l => l.trim())
    .find(l => l.length > 0 && !skipPrefixes.some(p => l.startsWith(p)));
  if (!line) return undefined;
  const preview = line.replace(/\s+/g, ' ').slice(0, 140);
  return `↳ ${preview}${line.length > 140 ? '…' : ''}`;
}

/** Detalle secundario (mono) bajo la etiqueta. */
export function formatAgentToolDetail(
  name: string,
  input: Record<string, unknown>,
  output?: string | null,
  phase: 'running' | 'done' = 'done',
): string | undefined {
  if (phase === 'running') return undefined;
  if (!output?.trim()) return undefined;

  if (name === 'estado_raspberry') {
    const hostLine = output.split('\n').find(l => l.includes('host:'));
    return hostLine ? `↳ ${hostLine.trim()}` : firstOutputLine(output);
  }

  if (name === 'conectar_raspberry') {
    return firstOutputLine(output, ['Conectado a']);
  }

  const cmd = str(input.comando);
  if (cmd && (name === 'ejecutar_comando' || name === 'listar_directorio' || name === 'info_sistema' || name === 'reiniciar_servicio' || name === 'conectar_raspberry')) {
    return firstOutputLine(output, ['Conectado a']);
  }

  return firstOutputLine(output);
}

export function toolCallInputFromStep(step: AgentStep): Record<string, unknown> {
  return parseToolInput(step.input);
}
