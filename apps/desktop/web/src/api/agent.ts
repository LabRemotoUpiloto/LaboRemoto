import { invoke } from '@tauri-apps/api/core';

export type FsSearchMatch = {
  path: string;
  file_name: string;
  is_dir: boolean;
  snippet?: string | null;
};

export type GrepMatch = {
  path: string;
  line: number;
  snippet: string;
};

export type ToolActionResult =
  | { tool: 'fs_search'; query: string; matches: FsSearchMatch[] }
  | { tool: 'fs_read'; path: string; content: string }
  | { tool: 'fs_grep'; query: string; matches: GrepMatch[] };

export interface AgentPlanResponse {
  user_message: string;
  intent: 'search' | 'open' | 'grep' | 'unknown';
  ai_response: string;
  tool_action?: ToolActionResult | null;
  requires_confirmation: boolean;
}

export interface AgentPlanRequest {
  sessionId?: string | null;
  userMessage: string;
  workspaceRoot?: string | null;
  limit?: number;
}

export async function invokeAgentPlan(req: AgentPlanRequest): Promise<AgentPlanResponse> {
  const payload = {
    req: {
      session_id: req.sessionId ?? null,
      user_message: req.userMessage,
      workspace_root: req.workspaceRoot ?? null,
      limit: req.limit ?? 50,
    },
  };
  return await invoke<AgentPlanResponse>('agent_plan', payload);
}
