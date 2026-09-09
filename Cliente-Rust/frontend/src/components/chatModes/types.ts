import type React from 'react';

// Tipos compartidos entre modos de chat
export type ChatMode = 'ask' | 'agente' | 'plan';

// Modelos disponibles para el chat
export type ModelSelection = string;

export const AVAILABLE_MODELS: Array<{ value: string; label: string; provider: string }> = [
  // nvidia/nemotron-3-nano-30b-a3b:free fue retirado del tier gratis por
  // OpenRouter (404 "This model is unavailable for free") -- no se lista más.
  { value: 'deepseek/deepseek-v3.2:free', label: 'DeepSeek V3.2 (Gratis)', provider: 'OpenRouter' },
  { value: 'z-ai/glm-4.6:free', label: 'GLM 4.6 (Gratis)', provider: 'OpenRouter' },
  { value: 'qwen/qwen3-235b-a22b:free', label: 'Qwen3 235B (Gratis)', provider: 'OpenRouter' },
  { value: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (Gratis)', provider: 'OpenRouter' },
  { value: 'qwen/qwen-2.5-coder-32b-instruct:free', label: 'Qwen 2.5 Coder 32B (Gratis)', provider: 'OpenRouter' },
  { value: 'qwen/qwen3.6-plus', label: 'Qwen 3.6 Plus', provider: 'OpenRouter' },
  { value: 'gpt-3.5-turbo', label: 'ChatGPT 3.5 Turbo', provider: 'OpenAI' },
];

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
  // Propiedades para modo análisis
  showAnalysisActions?: boolean;
  analyzedFile?: string;
  fileAnalysisDisambiguation?: {
    base: string;
    candidates: string[];
    action?: 'analyze' | 'optimize';
  };
  // Archivo adjunto (Word, PDF, texto)
  attachedFileName?: string;
  attachedFileContent?: string;
  imagePreview?: string;
  chat_mode?: string;
  toolSteps?: AgentStep[];
  processed?: boolean;
  /** Terminal Pi4 embebida justo debajo de este mensaje del asistente */
  embeddedPi4Terminal?: boolean;
  embeddedPi4Cameras?: boolean;
  embeddedPi4Desktop?: boolean;
}

export interface Message {
  id: string;
  sender: 'user' | 'ai' | 'system';
  text: string;
  timestamp?: number;
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
  /** Sesión SSH interactiva abierta en el chat (Pi4 desde .env). */
  pi4TerminalSessionId?: string | null;
  openPi4TerminalInChat?: () => Promise<string | null>;
  openPi4CamerasInChat?: () => Promise<string | null>;
  openPi4DesktopInChat?: () => Promise<string | null>;
  agentState: AgentState;
  setAgentState: (s: AgentState) => void;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setIsSending: (v: boolean) => void;
  cleanText: (s: string) => string;
  invokeAsk: (args: { finalInput: string; mode: ChatMode; userMsg: Message }) => Promise<void>;
  setStreamingMsgId: React.Dispatch<React.SetStateAction<string | null>>;
  setStreamedText: React.Dispatch<React.SetStateAction<string>>;
}

export interface AgentStep {
  kind: 'tool_call' | 'tool_result' | 'thinking';
  name?: string;
  input?: string;
  output?: string;
}

export interface AgentChatResponse {
  answer: string;
  steps: AgentStep[];
}

export interface ModeHandler {
  canSend(): boolean; // si false, ChatPane mostrará aviso
  send(finalInput: string, userMsg: Message, ctx: ModeHandlerContext): Promise<void>;
  help: string;
}
