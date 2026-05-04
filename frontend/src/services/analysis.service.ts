/**
 * analysis.service.ts
 * 
 * Capa de servicio para análisis de archivos locales y remotos.
 */

import { invoke } from '@tauri-apps/api/core';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface FileAnalysis {
  path: string;
  language?: string | null;
  line_count: number;
  size_bytes: number;
  sha256: string;
  head: string;
  tail: string;
  summary_hint: string;
  semantic_summary?: string | null;
  purpose?: string | null;
  key_points?: string[] | null;
  purpose_from_ai?: boolean | null;
  narrative?: string | null;
  ai_only?: boolean | null;
  candidates?: string[] | null;
  disambiguation_required?: boolean | null;
}

export interface AnalyzeFileResponse { 
  analysis: FileAnalysis 
}

// ── Comandos ──────────────────────────────────────────────────────────────────

/**
 * Analiza un archivo (local o remoto si se provee sessionId).
 */
export async function analyzeFile(path: string, sessionId?: string): Promise<AnalyzeFileResponse> {
  if (sessionId) {
    return invoke<AnalyzeFileResponse>('analyze_any_file', { session_id: sessionId, path });
  }
  return invoke<AnalyzeFileResponse>('analyze_file', { path });
}
