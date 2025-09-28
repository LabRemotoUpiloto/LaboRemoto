import { invoke } from '@tauri-apps/api/core';

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

export interface AnalyzeFileResponse { analysis: FileAnalysis }

export async function analyzeFile(path: string, sessionId?: string): Promise<AnalyzeFileResponse> {
  // We prefer the unified analyze_any_file backend command when session id is provided
  if (sessionId) {
    return invoke('analyze_any_file', { sessionId, path });
  }
  return invoke('analyze_file', { path });
}
