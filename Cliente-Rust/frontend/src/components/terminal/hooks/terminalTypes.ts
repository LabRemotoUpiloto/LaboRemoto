/**
 * terminalTypes.ts — tipos internos compartidos entre los sub-hooks de terminal.
 *
 * No exporta ningún hook: solo shapes usados por useTerminalLifecycle,
 * useTerminalResize, useTerminalSshListener y useTerminalSessionCapture para
 * comunicarse a través de refs propiedad del hook orquestador (useTerminal.ts).
 */

/** Metadata de la sesión SSH actualmente activa, usada para armar el log al guardar. */
export interface TerminalSessionMetadata {
  sessionId: string;
  user: string;
  host: string;
  port: number;
  startTime: string;
}
