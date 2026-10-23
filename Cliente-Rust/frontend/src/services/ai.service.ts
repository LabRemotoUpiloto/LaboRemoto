/**
 * ai.service.ts
 *
 * Capa de servicio centralizada para todas las operaciones de IA.
 * Centraliza ai_chat, cancel_ai_chat, agent_chat, plan_chat, etc.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { CommandResponse } from '@/lib/command.service';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatHistoryItem {
  role: ChatRole;
  content: string;
}

export interface AiChatPayload {
  user_input: string;
  mode: string;
  history: ChatHistoryItem[];
  state: object;
  model_selection: string;
  image_base64: string | null;
  image_media_type: string | null;
  terminal_context: string | null;
  request_id: string;
}

/** Envelope CommandRequest<AiChatPayload> que espera el backend */
export interface AiChatRequest {
  id: string;
  version: string;
  timestamp_ms: number;
  payload: AiChatPayload;
}

export interface AiChatResponse {
  ai_response?: string;
  explanation?: string;
  [key: string]: unknown;
}

export interface AiChunkEvent {
  request_id: string;
  delta: string;
}

/** Refleja `AgentChatRequest` en backend/src/cmd/tools/tools.rs. */
export interface AgentChatRequest {
  session_id: string;
  message: string;
  include_terminal_context?: boolean;
  terminal_lines?: number;
  request_id?: string;
}

/** Refleja `PlanChatRequest` en backend/src/cmd/tools/tools.rs. */
export interface PlanChatRequest {
  session_id: string;
  message: string;
  request_id?: string;
}

// ── Comandos ──────────────────────────────────────────────────────────────────

/**
 * Inicia un chat con la IA. Los chunks de respuesta llegan vía el evento `ai:chunk`.
 * Usa el envelope CommandRequest<AiChatPayload> que espera el backend.
 */
export const aiChat = <T = AiChatResponse>(req: AiChatRequest): Promise<CommandResponse<T>> =>
  invoke<CommandResponse<T>>('ai_chat', { req });

/**
 * Cancela un request de IA en curso por su ID. El comando Rust espera el sobre
 * CommandRequest<CancelAiChatPayload> completo, no un objeto suelto.
 */
export const cancelAiChat = (requestId: string): Promise<CommandResponse<{ ok: boolean }>> =>
  invoke<CommandResponse<{ ok: boolean }>>('cancel_ai_chat', {
    req: {
      id: crypto.randomUUID(),
      version: '1.0',
      timestamp_ms: Date.now(),
      payload: { request_id: requestId },
    },
  });

/** Chat con el agente AI (herramientas + contexto de terminal). `T` es la forma de la respuesta ({ answer, steps }). */
export const agentChat = <T = unknown>(req: AgentChatRequest): Promise<T> =>
  invoke<T>('agent_chat', { req });

/** Chat en modo planificación. `T` es la forma de la respuesta ({ answer, steps }). */
export const planChat = <T = unknown>(req: PlanChatRequest): Promise<T> =>
  invoke<T>('plan_chat', { req });

/** Devuelve las últimas `lines` líneas del buffer de la terminal (el backend usa 100 si se omite y topa en 300). */
export const getTerminalContext = (sessionId: string, lines?: number): Promise<string> =>
  invoke<string>('get_terminal_context', { sessionId, lines });

/** True si PI4_USER y PI4_PASSWORD están en .env (agente sin SSH manual). */
export const pi4AgentReady = (): Promise<boolean> =>
  invoke<boolean>('pi4_agent_ready');

// ── Eventos de streaming ──────────────────────────────────────────────────────

/**
 * Se subscribe a los chunks de streaming de la IA.
 * Devuelve la función de unlisten para limpiar al desmontar.
 *
 * @example
 * const unlisten = await listenAiChunks(requestId, (delta) => {
 *   setStreamedText(prev => prev + delta);
 * });
 * // Al desmontar:
 * unlisten();
 */
export const listenAiChunks = async (
  requestId: string,
  onChunk: (delta: string) => void,
): Promise<UnlistenFn> => {
  return listen<AiChunkEvent>('ai:chunk', (event) => {
    if (event.payload.request_id === requestId) {
      onChunk(event.payload.delta);
    }
  });
};
