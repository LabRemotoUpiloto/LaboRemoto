import { invoke } from '@tauri-apps/api/core';

export interface DetectIntentResponse {
  wants_analysis: boolean;
  filename: string | null;
}

/**
 * Detecta si el usuario quiere analizar un archivo usando IA
 * No depende de palabras clave específicas ni heurísticas
 * Funciona con errores de ortografía, tildes, y lenguaje natural
 */
export async function detectAnalysisIntent(message: string): Promise<DetectIntentResponse> {
  return await invoke<DetectIntentResponse>('detect_analysis_intent_cmd', {
    req: { message }
  });
}
