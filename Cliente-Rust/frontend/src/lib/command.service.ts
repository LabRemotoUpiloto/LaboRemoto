/**
 * command.service.ts
 *
 * Cliente centralizado para comandos Tauri que usan el protocolo versionado
 * (envelope `CommandRequest<T>` / `CommandResponse<T>` definido en
 * `backend/src/cmd/protocol.rs`, Fase A del REFACTOR #1).
 *
 * Cualquier comando migrado al nuevo protocolo (SSH, SFTP, AI...) debe
 * invocarse a través de `CommandClient.invoke`, nunca con `invoke()` directo,
 * para heredar automáticamente: id/versión/timestamp, manejo de errores
 * tipado y reintentos con backoff exponencial en errores transitorios.
 */

import { invoke } from '@tauri-apps/api/core';

// ── Tipos del envelope (deben reflejar backend/src/cmd/protocol.rs) ─────────

export interface CommandRequest<T> {
  id: string;
  version: string;
  payload: T;
  timestamp_ms: number;
}

export interface CommandErrorPayload {
  code: string;
  message: string;
  retryable?: boolean;
  retry_after_ms?: number;
}

export interface CommandResponse<T> {
  status: 'success' | 'error';
  id: string;
  version: string;
  data?: T;
  error?: CommandErrorPayload;
  elapsed_ms: number;
}

export interface CommandInvokeOptions {
  /** Versión del protocolo a anunciar en el request. Por defecto "1.0". */
  version?: string;
  /** Número máximo de reintentos ante errores marcados como `retryable`. */
  retries?: number;
}

/** Genera un identificador único para correlacionar request/response. */
function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback (entornos sin crypto.randomUUID, ej. contextos de test antiguos).
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class CommandError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;
  public readonly retryAfter: number;

  constructor(code: string, message: string, retryable = false, retryAfter = 0) {
    super(message);
    this.name = 'CommandError';
    this.code = code;
    this.retryable = retryable;
    this.retryAfter = retryAfter;
  }
}

export class CommandClient {
  /**
   * Invoca un comando Tauri versionado, envolviendo el payload en un
   * `CommandRequest<Payload>` y desenvolviendo el `CommandResponse<Response>`
   * resultante. Reintenta automáticamente errores transitorios (`retryable`)
   * con backoff exponencial (o el `retry_after_ms` sugerido por el backend).
   */
  async invoke<Payload, Response>(
    command: string,
    payload: Payload,
    options?: CommandInvokeOptions,
  ): Promise<Response> {
    const version = options?.version ?? '1.0';
    const maxRetries = options?.retries ?? 3;
    let lastError: CommandError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const request: CommandRequest<Payload> = {
        id: generateRequestId(),
        version,
        payload,
        timestamp_ms: Date.now(),
      };

      try {
        // El parámetro del lado Rust se llama `req` en todos los comandos
        // migrados (ver backend/src/cmd/**): la clave debe coincidir.
        const response = await invoke<CommandResponse<Response>>(command, { req: request });

        if (response.status === 'error') {
          const err = new CommandError(
            response.error?.code ?? 'UNKNOWN',
            response.error?.message ?? 'Unknown error',
            response.error?.retryable ?? false,
            response.error?.retry_after_ms ?? 0,
          );

          if (!err.retryable || attempt >= maxRetries) {
            throw err;
          }

          lastError = err;
          const delay = err.retryAfter || Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        return response.data as Response;
      } catch (error) {
        if (error instanceof CommandError) {
          if (!error.retryable || attempt >= maxRetries) {
            throw error;
          }
          lastError = error;
          const delay = error.retryAfter || Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        // Errores no tipados (ej. fallo de invoke() / IPC) no se reintentan.
        throw error;
      }
    }

    throw lastError ?? new Error('Max retries exceeded');
  }
}

export const commandClient = new CommandClient();
