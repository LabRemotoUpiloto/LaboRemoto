/**
 * ai.service.ts
 *
 * Capa de servicio centralizada para todas las operaciones de IA.
 * Centraliza ai_chat, cancel_ai_chat, agent_chat, plan_chat, etc.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

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
  state: Record<string, unknown>;
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

// ── Comandos ──────────────────────────────────────────────────────────────────

/**
 * Inicia un chat con la IA. Los chunks de respuesta llegan vía el evento `ai:chunk`.
 * Usa el envelope CommandRequest<AiChatPayload> que espera el backend.
 */
export const aiChat = (req: AiChatRequest): Promise<AiChatResponse> =>
  invoke<AiChatResponse>('ai_chat', { req });

/** Cancela un request de IA en curso por su ID. */
export const cancelAiChat = (requestId: string): Promise<void> =>
  invoke<void>('cancel_ai_chat', { requestId });

/** Chat con el agente AI (herramientas + contexto de terminal). */
export const agentChat = (params: Record<string, unknown>) =>
  invoke('agent_chat', params);

/** Chat en modo planificación. */
export const planChat = (params: Record<string, unknown>) =>
  invoke('plan_chat', params);

/** Devuelve el contexto actual del terminal para el agente. */
export const getTerminalContext = (sessionId: string) =>
  invoke('get_terminal_context', { sessionId });

/** Verifica el estado de configuración de las API keys de IA. */
export const aiEnvStatus = () =>
  invoke('ai_env_status');

/** True si PI4_USER y PI4_PASSWORD están en .env (agente sin SSH manual). */
export const pi4AgentReady = (): Promise<boolean> =>
  invoke<boolean>('pi4_agent_ready');

/** Prueba una API key específica. */
export const aiTestKey = (provider: string, key: string) =>
  invoke('ai_test_key', { provider, key });

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
