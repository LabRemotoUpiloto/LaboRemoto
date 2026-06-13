/**
 * ssh.service.ts
 *
 * Capa de servicio centralizada para todas las operaciones SSH.
 * El frontend NUNCA debe llamar `invoke` de Tauri directamente para SSH;
 * siempre debe pasar por estas funciones.
 *
 * Esto facilita:
 * - Testing (se puede mockear el servicio completo)
 * - Logging centralizado
 * - Cambios en la API del backend sin tocar los componentes
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, emit, type UnlistenFn } from '@tauri-apps/api/event';

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface SshConnectParams {
  host: string;
  port: number;
  user: string;
  password: string;
  cols: number;
  rows: number;
}

export interface SshSessionInfo {
  host: string;
  port: number;
  user: string;
  resolved_ip: string;
}

export interface SshConnectResult {
  id: string;
  label: string;
}

// ── Comandos básicos ──────────────────────────────────────────────────────────

/**
 * Inicia una conexión SSH. El backend devuelve el ID inmediatamente
 * y conecta en background. Para saber cuándo conectó, usar `waitForConnection`.
 */
export const sshConnect = (params: SshConnectParams): Promise<string> =>
  invoke<string>('ssh_connect', { ...params });

/** Sesión SSH interactiva a la Raspberry Pi (credenciales PI4_* del .env). */
export const pi4SshConnect = (cols: number, rows: number): Promise<string> =>
  invoke<string>('pi4_ssh_connect', { cols, rows });

/**
 * Escucha los eventos `ssh_connected` y `ssh_connect_error` y resuelve/rechaza
 * cuando llega el resultado de la conexión. Devuelve la función de cleanup.
 */
export const waitForConnection = async (
  sessionId: string,
  abortSignal: AbortSignal,
  onSuccess: (result: SshConnectResult) => void,
  onError: (error: Error) => void,
): Promise<[UnlistenFn, UnlistenFn]> => {
  const unlistenSuccess = await listen<{ id: string }>('ssh_connected', (event) => {
    if (event.payload?.id === sessionId && !abortSignal.aborted) {
      onSuccess({ id: sessionId, label: sessionId });
    }
  });

  const unlistenError = await listen<{ id: string; error: string }>('ssh_connect_error', (event) => {
    if (event.payload?.id === sessionId && !abortSignal.aborted) {
      onError(new Error(event.payload.error || 'Error conectando'));
    }
  });

  return [unlistenSuccess, unlistenError];
};

/** Señala al backend que la UI ya está lista para recibir output de la sesión. */
export const sshUiReady = (id: string): Promise<void> =>
  invoke<void>('ssh_ui_ready', { id });

/** Envía datos (stdin) a una sesión SSH activa. */
export const sshStdin = (id: string, data: string, encoding?: string): Promise<void> =>
  invoke<void>('ssh_stdin', { id, data, encoding: encoding ?? null });

/** Redimensiona el terminal de una sesión SSH. */
export const sshResize = (id: string, cols: number, rows: number): Promise<void> =>
  invoke<void>('ssh_resize', { id, cols, rows });

/** Desconecta y limpia una sesión SSH. */
export const sshDisconnect = (id: string): Promise<void> =>
  invoke<void>('ssh_disconnect', { id });

/** Conecta a un host previamente guardado (por su ID de almacenamiento). */
export const sshConnectStored = (id: string, cols: number, rows: number): Promise<string> =>
  invoke<string>('ssh_connect_stored', { id, cols, rows });

/** Obtiene información de metadata de una sesión activa. */
export const sshSessionInfo = (id: string): Promise<SshSessionInfo> =>
  invoke<SshSessionInfo>('ssh_session_info', { id });

// ── VNC ──────────────────────────────────────────────────────────────────────

export const vncStart = (sessionId: string, params: Record<string, unknown>) =>
  invoke('vnc_start', { sessionId, ...params });

export const vncStop = (sessionId: string): Promise<void> =>
  invoke<void>('vnc_stop', { sessionId });

export const vncStatus = (sessionId: string) =>
  invoke('vnc_status', { sessionId });

// ── Memoria efímera de sesión ─────────────────────────────────────────────────

export type SessionMemPatch = {
  last_file?: string;
  last_file_hash?: string;
  last_file_snippet?: string;
  last_command?: string;
  last_stdout_tail?: string;
  last_stderr_tail?: string;
  last_exit_code?: number;
  last_path?: string;
  last_path_kind?: string;
  env_cwd?: string;
  env_shell?: string;
  env_os?: string;
  practice_context?: string;
  practice_tutorial?: string;
};

export const memPut = (sessionId: string, patch: SessionMemPatch): Promise<void> =>
  invoke<void>('mem_put', { sessionId, patch });

export const memGet = (sessionId: string) =>
  invoke('mem_get', { sessionId });

export const memClear = (sessionId: string): Promise<void> =>
  invoke<void>('mem_clear', { sessionId });

export const memPushTerminalResult = (
  sessionId: string,
  stdoutTail: string,
  stderrTail: string,
  exitCode: number,
): Promise<void> =>
  invoke<void>('mem_push_terminal_result', { sessionId, stdoutTail, stderrTail, exitCode });

// ── Emitters de eventos Tauri hacia el backend ────────────────────────────────

export const emitSaveSessionBeforeClose = (sessionId: string): Promise<void> =>
  emit('app:save-session-before-close', { sessionId });
