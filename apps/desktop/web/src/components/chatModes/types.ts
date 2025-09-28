import type React from 'react';

// Tipos compartidos entre modos de chat
export type ChatMode = 'ask' | 'busqueda' | 'pines' | 'analisis';

export interface AgentState {
  cwd: string;
  lastExitCode?: number;
  lastStdoutTail?: string;
  lastFile?: string;
}

export interface MessageMeta {
  requiresConfirmation?: boolean;
  backupPath?: string;
  state?: AgentState;
  pendingCommand?: string;
  pendingFileCreation?: any;
  summary?: string;
  explanation?: string;
  userPrompt?: string;
  command?: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  suggestedCommands?: string; // para modo ask
  toolAction?: any;
  fileEdit?: {
    path: string;
    diff: string;
    proposedContent: string;
    needsConfirmation: boolean;
  };
}

export interface Message {
  id: string;
  sender: 'user' | 'ai' | 'system';
  text: string;
  meta?: MessageMeta;
}

export interface AiResponseRaw {
  user_input: string;
  ai_response: string;
  code_output?: string | null;
  explanation?: string | null;
  summary?: string | null;
  state?: AgentState;
  requires_confirmation?: boolean;
  backup_path?: string;
  [k: string]: any;
}

export interface ModeHandlerContext {
  sessionId: string | null | undefined;
  agentState: AgentState;
  setAgentState: (s: AgentState) => void;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setIsSending: (v: boolean) => void;
  cleanText: (s: string) => string;
  invokeAsk: (args: { finalInput: string; mode: ChatMode; userMsg: Message }) => Promise<void>;
  invokeBusqueda: (args: { finalInput: string; userMsg: Message }) => Promise<void>;
}

export interface ModeHandler {
  canSend(): boolean; // si false, ChatPane mostrará aviso
  send(finalInput: string, userMsg: Message, ctx: ModeHandlerContext): Promise<void>;
  help: string;
}
