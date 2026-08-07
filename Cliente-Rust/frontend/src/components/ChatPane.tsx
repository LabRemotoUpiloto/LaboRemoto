import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useSessionMemory } from '../hooks/useSessionMemory';

import { ChatMode, Message, AgentState, AiResponseRaw, ModeHandlerContext, ModelSelection } from './chatModes/types';
import type { CommandResponse } from '../services/command.service';
import { AskModeHandler } from './chatModes/classes/AskModeHandler';
import { AgenteModeHandler } from './chatModes/classes/AgenteModeHandler';
import { PlanModeHandler } from './chatModes/classes/PlanModeHandler';
import { cleanText, isNearBottom } from './chat/chatUtils';
import ChatMessageList from './chat/ChatMessageList';

import ChatSearchBar from './chatPane/ChatSearchBar';
import ChatInput from './chatPane/ChatInput';
import ChatHistoryPanel from './chatPane/ChatHistoryPanel';
import ChatModals from './chatPane/ChatModals';
import TerminalBanners from './chatPane/TerminalBanners';
import { MODEL_CONTEXT_WINDOW } from './chatPane/chatPane.constants';

// Hooks extraídos
import { useTerminalMonitor } from './chatPane/hooks/useTerminalMonitor';
import { usePi4ChatSession } from './chatPane/hooks/usePi4ChatSession';
import { useChatExport } from './chatPane/hooks/useChatExport';
import { useChatStorage } from './chatPane/hooks/useChatStorage';
import { useChatHistoryManager } from './chatPane/hooks/useChatHistoryManager';
import { useChatModeSwitch } from './chatPane/hooks/useChatModeSwitch';

import AgentHomeHero from '../pages/home/AgentHomeHero';
import ChatToast from './chat/ChatToast';
import { useDisplayName } from '../pages/home/useDisplayName';
import ChatFloatingActions from './chatPane/ChatFloatingActions';
import { pi4AgentReady as fetchPi4AgentReady } from '../services/ai.service';
import { vncStop, sshSessionInfo } from '../services/ssh.service';
import { useTour } from '../tour/useTour';
import { useQueryData } from '../hooks/useQueryData';
import { useAuth } from '../hooks/useAuth';

type Props = {
  sessionId?: string | null;
  onClose?: () => void;
  layout?: 'default' | 'home';
  onOpenPanel?: (panelId: string) => void;
  onStartTutorial?: () => void;
};

const ChatPane: React.FC<Props> = ({
  sessionId = null,
  onClose,
  layout = 'default',
  onOpenPanel,
}) => {
  const isHome = layout === 'home';
  const displayName = useDisplayName();
  const { startTour } = useTour();
  const { isAuthenticated } = useAuth();
  // ── Core State ──
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<ChatMode>('ask');
  const [selectedModel, setSelectedModel] = useState<ModelSelection>(() => {
    const saved = localStorage.getItem('chatSelectedModel');
    const deprecated: Record<string, string> = {
      'google/gemini-2.5-pro-exp-03-25:free': 'qwen/qwen3.6-plus',
      'google/gemini-2.5-pro:free': 'qwen/qwen3.6-plus',
      'nvidia/nemotron-super-49b-v1:free': 'nvidia/nemotron-3-nano-30b-a3b:free',
      'nvidia/nemotron-3-super-120b-a12b:free': 'nvidia/nemotron-3-nano-30b-a3b:free',
      'deepseek/deepseek-v3-0324:free': 'qwen/qwen3.6-plus',
      'qwen/qwen3.6-plus:free': 'qwen/qwen3.6-plus',
      'claude-sonnet-4-5': 'claude-sonnet-4-6',
    };
    return ((deprecated[saved ?? ''] ?? saved) as ModelSelection) || 'claude-sonnet-4-6';
  });
  
  const [agentState, setAgentState] = useState<AgentState>({ cwd: '/', lastExitCode: undefined, lastStdoutTail: undefined, lastFile: undefined });
  const [isSending, setIsSending] = useState(false);
  const isSendingRef = useRef(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [attachedImage, setAttachedImage] = useState<any | null>(null);
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const attachedFileRef = useRef<{ name: string; content: string } | null>(null);
  useEffect(() => { attachedFileRef.current = attachedFile; }, [attachedFile]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [streamedText, setStreamedText] = useState('');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showTokenPopover, setShowTokenPopover] = useState(false);
  // Estado de disponibilidad del agente Pi4 (PI4_USER/PI4_PASSWORD en .env):
  // dato de solo lectura, cacheado (Batch 3, REFACTOR #4) para no
  // re-consultar al backend en cada remontaje de ChatPane dentro del TTL.
  const { data: pi4ReadyData } = useQueryData('ai:pi4-agent-ready', fetchPi4AgentReady);
  const pi4Ready = pi4ReadyData ?? false;

  // Metadata de la sesión SSH activa (host/user), también de solo lectura
  // y cacheada por sessionId.
  //
  // Fix REFACTOR #4 (hallazgo final de @pr-reviewer sobre el commit
  // 0462128): `enabled` también depende de `isAuthenticated`. `logout()`
  // invalida todo el `queryCache` (incluida esta key), y el mecanismo de
  // auto-refetch de `useQueryData` (ver comentario en ese hook) reacciona a
  // cualquier entrada que desaparezca mientras el componente sigue montado
  // — sin distinguir "invalidación por logout" de "eviction LRU". Como los
  // tabs de sesión no se desmontan automáticamente al perder autenticación
  // (solo se ocultan por navegación), sin este guard el ChatPane dispararía
  // una llamada de red (`sshSessionInfo`) justo cuando el backend está
  // cerrando la sesión. Atar `enabled` a `isAuthenticated` evita ese
  // refetch innecesario; al volver a autenticarse, `enabled` vuelve a
  // `true` y el efecto de `useQueryData` dispara el fetch normalmente.
  const { data: sshInfo } = useQueryData(
    `ssh:session-info:${sessionId ?? 'none'}`,
    () => sshSessionInfo(sessionId as string),
    { enabled: !!sessionId && isAuthenticated },
  );
  const hostKey = sessionId ? (sshInfo ? `${sshInfo.user}@${sshInfo.host}` : sessionId) : 'default';

  // Refs
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const isComposingRef = useRef<boolean>(false);
  const handleSendRef = useRef<((t?: string) => void)>(() => {});
  const currentReqIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const skipRestoreRef = useRef(false);

  // ── Session & API Resolve ──
  const { mem, setLastCommand, clear: clearMemory } = useSessionMemory(sessionId ?? null);

  useEffect(() => { localStorage.setItem('chatSelectedModel', selectedModel); }, [selectedModel]);

  // ── Modos ──
  const modeHandlers = useMemo<Record<ChatMode, any>>(() => ({
    ask: new AskModeHandler(),
    agente: new AgenteModeHandler(),
    plan: new PlanModeHandler(),
  }), []);

  const {
    pi4ChatSessionId,
    pi4SshCommandLine,
    pi4ChatConnecting,
    pi4ChatError,
    pi4ChatLabel,
    ensurePi4Session,
    disconnectPi4Session,
  } = usePi4ChatSession();

  const [showPi4TerminalInChat, setShowPi4TerminalInChat] = useState(false);
  const [showPi4CamerasInChat, setShowPi4CamerasInChat] = useState(false);
  const [showPi4DesktopInChat, setShowPi4DesktopInChat] = useState(false);

  const pi4TerminalEmbedActive = useMemo(
    () => showPi4TerminalInChat || messages.some(m => m.meta?.embeddedPi4Terminal),
    [showPi4TerminalInChat, messages],
  );
  const pi4CamerasEmbedActive = useMemo(
    () => showPi4CamerasInChat || messages.some(m => m.meta?.embeddedPi4Cameras),
    [showPi4CamerasInChat, messages],
  );
  const pi4DesktopEmbedActive = useMemo(
    () => showPi4DesktopInChat || messages.some(m => m.meta?.embeddedPi4Desktop),
    [showPi4DesktopInChat, messages],
  );

  const terminalMonitorSessionId =
    sessionId ??
    ((pi4TerminalEmbedActive || pi4CamerasEmbedActive || pi4DesktopEmbedActive) ? pi4ChatSessionId : null);

  const scrollChatToBottom = useCallback(() => {
    const el = messagesRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      setShowScrollToBottom(false);
    });
  }, []);

  const openPi4TerminalInChat = useCallback(async (): Promise<string | null> => {
    setShowPi4TerminalInChat(true);
    scrollChatToBottom();
    const id = await ensurePi4Session();
    if (!id) setShowPi4TerminalInChat(false);
    else scrollChatToBottom();
    return id;
  }, [ensurePi4Session, scrollChatToBottom]);

  const openPi4CamerasInChat = useCallback(async (): Promise<string | null> => {
    setShowPi4CamerasInChat(true);
    scrollChatToBottom();
    const id = await ensurePi4Session();
    if (!id) setShowPi4CamerasInChat(false);
    else scrollChatToBottom();
    return id;
  }, [ensurePi4Session, scrollChatToBottom]);

  const openPi4DesktopInChat = useCallback(async (): Promise<string | null> => {
    setShowPi4DesktopInChat(true);
    scrollChatToBottom();
    if (sessionId) {
      scrollChatToBottom();
      return sessionId;
    }
    const id = await ensurePi4Session();
    if (!id) setShowPi4DesktopInChat(false);
    else scrollChatToBottom();
    return id;
  }, [sessionId, ensurePi4Session, scrollChatToBottom]);

  const pi4EmbedStillNeeded = useCallback(
    (opts?: { exceptTerminal?: boolean; exceptCameras?: boolean; exceptDesktop?: boolean }) => {
      const term =
        (opts?.exceptTerminal ? false : showPi4TerminalInChat) ||
        messages.some(m => m.meta?.embeddedPi4Terminal);
      const cam =
        (opts?.exceptCameras ? false : showPi4CamerasInChat) ||
        messages.some(m => m.meta?.embeddedPi4Cameras);
      const desk =
        (opts?.exceptDesktop ? false : showPi4DesktopInChat) ||
        messages.some(m => m.meta?.embeddedPi4Desktop);
      return term || cam || desk;
    },
    [showPi4TerminalInChat, showPi4CamerasInChat, showPi4DesktopInChat, messages],
  );

  const closePi4TerminalInChat = useCallback(() => {
    setShowPi4TerminalInChat(false);
    setMessages(prev => prev.map(m =>
      m.meta?.embeddedPi4Terminal
        ? { ...m, meta: { ...m.meta, embeddedPi4Terminal: false } }
        : m,
    ));
    if (!pi4EmbedStillNeeded({ exceptTerminal: true })) void disconnectPi4Session();
  }, [pi4EmbedStillNeeded, disconnectPi4Session, setMessages]);

  const closePi4CamerasInChat = useCallback(() => {
    setShowPi4CamerasInChat(false);
    setMessages(prev => prev.map(m =>
      m.meta?.embeddedPi4Cameras
        ? { ...m, meta: { ...m.meta, embeddedPi4Cameras: false } }
        : m,
    ));
    if (!pi4EmbedStillNeeded({ exceptCameras: true })) void disconnectPi4Session();
  }, [pi4EmbedStillNeeded, disconnectPi4Session, setMessages]);

  const closePi4DesktopInChat = useCallback(() => {
    setShowPi4DesktopInChat(false);
    setMessages(prev => prev.map(m =>
      m.meta?.embeddedPi4Desktop
        ? { ...m, meta: { ...m.meta, embeddedPi4Desktop: false } }
        : m,
    ));
    const vncSession = sessionId ?? pi4ChatSessionId;
    if (vncSession) {
      void vncStop(vncSession).catch(() => {});
    }
    if (!sessionId && !pi4EmbedStillNeeded({ exceptDesktop: true })) void disconnectPi4Session();
  }, [sessionId, pi4ChatSessionId, pi4EmbedStillNeeded, disconnectPi4Session, setMessages]);

  // ── Custom Hooks ──
  const { errorBanner, setErrorBanner, terminalActivity, setTerminalActivity } = useTerminalMonitor(terminalMonitorSessionId);
  const { handleExportMd, handleExportHtml } = useChatExport(messages, setToast);
  const { sessionTokens, setSessionTokens } = useChatStorage(sessionId, mode, messages, setMessages, mem.practiceTutorial, skipRestoreRef);
  
  const {
    showHistory, setShowHistory, historyEntries, historySearch, setHistorySearch,
    pendingDeleteId, archiveCurrentChatRef, handleNewChat, handleLoadHistory,
    handleDeleteHistoryEntry, confirmDeleteHistoryEntry, cancelDeleteHistoryEntry,
    loadedHistoryIdRef, messageCountAtLoadRef
  } = useChatHistoryManager(
    sessionId, hostKey, mode, messages, setMessages, setSessionTokens, 
    setMode, setToast, skipRestoreRef, clearMemory, mem.practiceTutorial
  );

  const { showModeConfirm, handleModeSwitch, confirmModeSwitch, cancelModeSwitch } = useChatModeSwitch(
    mode, setMode, messages, setMessages, sessionId, pi4Ready, attachedImage, setAttachedImage, attachedFile, setAttachedFile,
    archiveCurrentChatRef, clearMemory, loadedHistoryIdRef, messageCountAtLoadRef, skipRestoreRef, setToast
  );

  // ── Auto-scroll & Resize ──
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    const last = messages[messages.length - 1];
    if (last?.sender === 'user' || isNearBottom(el)) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      setShowScrollToBottom(false);
    }
  }, [messages]);

  useEffect(() => {
    if (!pi4TerminalEmbedActive && !pi4CamerasEmbedActive && !pi4DesktopEmbedActive) return;
    scrollChatToBottom();
  }, [pi4TerminalEmbedActive, pi4CamerasEmbedActive, pi4DesktopEmbedActive, pi4ChatSessionId, pi4ChatConnecting, scrollChatToBottom]);

  useEffect(() => {
    if (!streamedText || !streamingMsgId) return;
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [streamedText, streamingMsgId]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const style = window.getComputedStyle(el);
    const fixedH = (style.getPropertyValue('--chat-input-fixed-height') || '').trim();
    if (fixedH) { el.style.height = fixedH; el.style.overflowY = 'hidden'; return; }
    el.style.height = 'auto';
    const lh = parseFloat(style.getPropertyValue('--chat-input-line-height') || style.lineHeight) || 20;
    const py = parseFloat(style.getPropertyValue('--chat-input-padding-y') || style.paddingTop) || 0;
    const maxPx = Math.round((py * 2) + lh * 5);
    const newH = Math.min(el.scrollHeight, maxPx);
    el.style.height = newH + 'px';
    el.style.overflowY = el.scrollHeight > maxPx ? 'auto' : 'hidden';
  }, [input]);

  // ── System Events & Shortcuts ──
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.text) setMessages(prev => [...prev, { id: String(Date.now()), sender: 'system', text: detail.text }]);
    };
    document.addEventListener('chat:system-msg', handler as any);
    return () => document.removeEventListener('chat:system-msg', handler as any);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (document.activeElement === inputRef.current) return;
      if (e.key === '?' && e.shiftKey) { e.preventDefault(); setShowShortcuts(s => !s); }
      if (e.key === 'Escape') setShowShortcuts(false);
      if (e.ctrlKey && e.key === 'n') { e.preventDefault(); handleNewChat(); }
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault(); setSearchOpen(true);
        setTimeout(() => (document.querySelector('.chat-search-input') as HTMLInputElement | null)?.focus(), 50);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleNewChat]);

  // ── Search logic ──
  const searchMatchIds = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return messages.filter(m => m.text.toLowerCase().includes(q)).map(m => m.id);
  }, [messages, searchQuery]);
  useEffect(() => { setSearchMatchIndex(0); }, [searchQuery]);
  useEffect(() => {
    if (searchMatchIds.length === 0) return;
    const msgEl = document.getElementById(`msg-${searchMatchIds[searchMatchIndex]}`);
    const container = messagesRef.current;
    if (!msgEl || !container) return;
    const cRect = container.getBoundingClientRect();
    const mRect = msgEl.getBoundingClientRect();
    const offset = container.scrollTop + mRect.top - cRect.top - container.clientHeight / 2 + msgEl.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
  }, [searchMatchIndex, searchMatchIds]);

  // ── Envío IA ──
  const invokeAsk = async ({ finalInput, mode, userMsg }: { finalInput: string; mode: ChatMode; userMsg: Message }) => {
    const getContent = (m: Message) => {
      let c = m.text;
      if (m.meta?.attachedFileContent) c += `\n\n📄 ${m.meta.attachedFileName}:\n\`\`\`text\n${m.meta.attachedFileContent}\n\`\`\``;
      return c;
    };
    const history = messages
      .filter(m => m.sender !== 'system')
      .map(m => ({ role: m.sender === 'ai' ? 'assistant' : 'user', content: getContent(m) }));
    
    if (mem.practiceContext) { history.unshift({ role: 'system', content: mem.practiceContext }); }
    
    const imgSnap = attachedImage ?? (userMsg.meta?.imagePreview ? (() => {
      const p = userMsg.meta.imagePreview!; const cIdx = p.indexOf(',');
      return { base64: p.substring(cIdx + 1), mediaType: p.substring(0, cIdx).replace('data:', '').replace(';base64', ''), preview: p };
    })() : null);
    
    setAttachedImage(null); setTerminalActivity(false);
    const reqId = crypto.randomUUID(); currentReqIdRef.current = reqId;
    setStreamingMsgId(reqId); setStreamedText('');
    setMessages(prev => [...prev, { id: reqId, sender: 'ai', text: '', timestamp: Date.now(), meta: { chat_mode: mode } }]);
    
    const unlistenChunk = await listen<{ request_id: string; delta: string }>('ai:chunk', (ev) => {
      if (ev.payload.request_id !== reqId) return;
      setStreamedText(prev => prev + ev.payload.delta);
    });

    try {
      const envelope = await invoke<CommandResponse<AiResponseRaw>>('ai_chat', {
        req: {
          id: reqId,
          version: '1.0',
          timestamp_ms: Date.now(),
          payload: {
            user_input: getContent(userMsg), mode, history, state: agentState, model_selection: selectedModel,
            image_base64: imgSnap?.base64 ?? null, image_media_type: imgSnap?.mediaType ?? null,
            terminal_context: null, request_id: reqId,
          },
        }
      });
      unlistenChunk(); currentReqIdRef.current = null;
      if (!isSendingRef.current) { setStreamedText(''); setStreamingMsgId(null); return; }
      if (envelope.status === 'error') {
        throw new Error(envelope.error?.message || 'Error del asistente');
      }
      const res = envelope.data as AiResponseRaw;
      const displayText = cleanText(String((res as any).ai_response || (res as any).explanation || ''));
      const cleanedMeta: any = { chat_mode: mode, ...(res as any) };
      delete cleanedMeta.code_output; delete cleanedMeta.suggestedCommands;
      setMessages(prev => prev.map(m => m.id === reqId ? { ...m, text: displayText, meta: cleanedMeta } : m));
    } catch (e) {
      unlistenChunk(); setStreamedText(''); setStreamingMsgId(null);
      setMessages(prev => prev.filter(m => m.id !== reqId));
      if (!String(e).toLowerCase().includes('cancelled')) throw e;
    }
    setStreamedText(''); setStreamingMsgId(null);
  };

  const buildModeContext = (): ModeHandlerContext => ({
    sessionId,
    pi4TerminalSessionId: pi4ChatSessionId,
    openPi4TerminalInChat,
    openPi4CamerasInChat,
    openPi4DesktopInChat,
    agentState,
    setAgentState: s => setAgentState({ ...s }),
    messages,
    setMessages,
    setIsSending,
    cleanText,
    invokeAsk,
    setStreamingMsgId,
    setStreamedText,
  });

  const handleSend = async (overrideText?: string) => {
    if (isSending || isSendingRef.current) return;
    const trimmed = (overrideText ?? input).trim();
    if (!trimmed) return;

    if (trimmed === '/compact') {
      if (!overrideText) setInput('');
      const uMsgs = messages.filter(m => m.sender === 'user').length;
      if (uMsgs === 0) { setMessages(prev => [...prev, { id: String(Date.now()), sender: 'system', text: '⚡ No hay historial que compactar.' }]); return; }
      const lines = messages.map(m => `${m.sender === 'user' ? 'U' : 'A'}: ${m.text.slice(0, 120)}${m.text.length > 120 ? '…' : ''}`);
      setMessages([{ id: String(Date.now()), sender: 'system', text: `🗜 Historial compactado (${uMsgs} turnos). Resumen:\n${lines.join('\n')}`, timestamp: Date.now() }]);
      setSessionTokens({ input: 0, output: 0 }); return;
    }

    const handler = modeHandlers[mode];
    if (!handler?.canSend()) { setInput(''); return; }
    
    isSendingRef.current = true; setErrorBanner(null);
    const filesnap = attachedFileRef.current ?? attachedFile;
    setAttachedFile(null); attachedFileRef.current = null;
    const userMsg: Message = { id: String(Date.now()), sender: 'user', text: trimmed, timestamp: Date.now(), meta: {
      ...(attachedImage ? { imagePreview: attachedImage.preview } : {}),
      ...(filesnap ? { attachedFileName: filesnap.name, attachedFileContent: filesnap.content } : {}),
    } as any };
    
    setMessages(prev => [...prev, userMsg]);
    if (!overrideText) setInput('');

    try {
      setIsSending(true);
      await handler.send(trimmed, userMsg, buildModeContext());
    } catch (e: any) {
      setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `Error: ${String(e)}` }]);
    } finally { isSendingRef.current = false; setIsSending(false); }
  };
  handleSendRef.current = handleSend;

  const handleCancel = useCallback(() => {
    if (currentReqIdRef.current) invoke('cancel_ai_chat', { requestId: currentReqIdRef.current }).catch(() => {});
    currentReqIdRef.current = null;
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    isSendingRef.current = false; setIsSending(false);
    setMessages(prev => [...prev, { id: String(Date.now()), sender: 'system', text: 'Respuesta cancelada por el usuario.' }]);
  }, []);

  const re_send_wrapper = async (msgId: string, regen: boolean) => {
    if (isSending) return;
    const idx = messages.findIndex(m => m.id === msgId);
    let userMsg: Message | null = null;
    for (let i = idx - 1; i >= 0; i--) if (messages[i].sender === 'user') { userMsg = messages[i]; break; }
    if (!userMsg || !modeHandlers[mode]?.canSend()) return;
    setMessages(prev => prev.filter((_m, i) => regen ? i < idx : _m.id !== msgId));
    try {
      setIsSending(true); isSendingRef.current = true;
      await modeHandlers[mode].send(userMsg.text, userMsg, buildModeContext());
    } catch (e) {
      setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `Error: ${String(e)}` }]);
    } finally { isSendingRef.current = false; setIsSending(false); }
  };
  const handleRetry = useCallback((id: string) => re_send_wrapper(id, false), [messages, mode, isSending]); /* eslint-disable-line */
  const handleRegenerate = useCallback((id: string) => re_send_wrapper(id, true), [messages, mode, isSending]); /* eslint-disable-line */

  const handleAnalyzeCandidate = async (base: string, candidate: string, action: string = 'analyze', index?: number) => {
    if (isSending) return;
    setIsSending(true);
    try {
      const command = action === 'optimize' && index !== undefined ? `mejora ${index + 1}` : action === 'optimize' ? `mejora ${candidate}` : `analizame ${candidate}`;
      const userMsg: Message = { id: String(Date.now()), sender: 'user', text: command };
      setMessages(prev => [...prev, userMsg]);
      await modeHandlers['ask'].send(command, userMsg, buildModeContext());
    } catch (e) {
      setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `Error ${action === 'optimize' ? 'optimizando' : 'analizando'} ${candidate}: ${String(e)}` }]);
    } finally { setIsSending(false); }
  };

  const handleDeleteMsg = (id: string) => setMessages(prev => prev.filter(m => m.id !== id));
  const handleSaveEditMsg = (msgId: string, draft: string) => {
    const idx = messages.findIndex(m => m.id === msgId);
    if (idx < 0) return;
    const updatedMsg: Message = { ...messages[idx], text: draft };
    setMessages(prev => prev.slice(0, idx).concat(updatedMsg));
    if (modeHandlers[mode]?.canSend()) {
      setIsSending(true); isSendingRef.current = true;
      modeHandlers[mode].send(draft, updatedMsg, buildModeContext()).catch((e: any) => {
        setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `Error: ${String(e)}` }]);
      }).finally(() => { isSendingRef.current = false; setIsSending(false); });
    }
  };

  const isHomeEmpty = isHome && messages.length === 0 && !isSending;

  const chatInputEl = (
    <ChatInput
      input={input} setInput={setInput} mode={mode} isSending={isSending}
      onSend={handleSend} onCancel={handleCancel} canSend={modeHandlers[mode]?.canSend() ?? false}
      attachedImage={attachedImage} setAttachedImage={setAttachedImage}
      attachedFile={attachedFile} setAttachedFile={setAttachedFile}
      inputRef={inputRef} isComposingRef={isComposingRef} messages={messages}
      sessionTokens={sessionTokens} setSessionTokens={setSessionTokens} sessionId={sessionId}
      ctxUsagePct={Math.min(100, (sessionTokens.input / (MODEL_CONTEXT_WINDOW[selectedModel] || 200000)) * 100)}
      setToast={setToast} showTokenPopover={showTokenPopover} setShowTokenPopover={setShowTokenPopover}
      variant={isHomeEmpty ? 'pill' : 'default'}
      selectedModel={selectedModel}
      onModelChange={setSelectedModel}
      footerMinimal={isHome}
      onModeSwitch={handleModeSwitch}
      pi4AgentReady={pi4Ready}
      showHistory={showHistory}
      onToggleHistory={() => setShowHistory(o => !o)}
      onClose={onClose}
      onNewChat={handleNewChat}
    />
  );

  // ── Render ──
  return (
    <div
      className={[
        isHome
          ? 'relative flex flex-col w-full h-full min-h-0 text-[13.5px] leading-[1.65] text-[var(--text-primary)]'
          : 'chat-pane-root flex flex-col w-full h-full bg-[var(--background-secondary)] font-sans text-[13.5px] leading-[1.65] overflow-hidden relative',
        isHomeEmpty
          ? 'justify-center items-center p-[40px_32px] max-[760px]:p-[20px_16px_24px] max-[760px]:justify-start max-[760px]:overflow-y-auto'
          : '',
      ].filter(Boolean).join(' ')}
    >
      {isHome && (
        <ChatFloatingActions
          hasMessages={messages.length > 0}
          showHistory={showHistory}
          searchOpen={searchOpen}
          onNewChat={handleNewChat}
          onToggleHistory={() => setShowHistory(o => !o)}
          onToggleSearch={() => {
            setSearchOpen(o => !o);
            if (searchOpen) setSearchQuery('');
          }}
        />
      )}
      {searchOpen && (
        <ChatSearchBar
          searchQuery={searchQuery} setSearchQuery={setSearchQuery} setSearchOpen={setSearchOpen}
          searchMatchIds={searchMatchIds} searchMatchIndex={searchMatchIndex} setSearchMatchIndex={setSearchMatchIndex}
        />
      )}
      {isHomeEmpty ? (
        <div className="flex flex-col items-stretch justify-center w-full max-w-[1060px] flex-1 min-h-0 gap-0">
          <AgentHomeHero
            displayName={displayName}
            onOpenPanel={onOpenPanel}
            onStartTutorial={startTour}
          />
        </div>
      ) : (
        <ChatMessageList
          className={isHome ? 'flex-1 min-h-0 pt-[68px] px-5 pb-7 scroll-pt-[68px] !gap-3.5' : 'flex-1 min-h-0 chat-messages-area--inset-top'}
          messages={messages} mode={mode} isSending={isSending}
          hideWelcome={isHome}
          appearance={isHome ? 'landing' : 'session'}
          searchMatchIds={searchMatchIds} searchMatchIndex={searchMatchIndex}
          streamingMsgId={streamingMsgId} streamedText={streamedText}
          sessionId={sessionId} showScrollToBottom={showScrollToBottom}
          messagesRef={messagesRef} setShowScrollToBottom={setShowScrollToBottom}
          onScrollToBottom={() => { const el = messagesRef.current; if (el) { el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); setShowScrollToBottom(false); } }}
          handleSuggestionClick={text => handleSendRef.current?.(text)}
          onDeleteMsg={handleDeleteMsg} onSaveEditMsg={handleSaveEditMsg}
          onCopyMsg={async text => { try { await navigator.clipboard.writeText(text); setToast('Copiado al portapapeles'); setTimeout(() => setToast(null), 2000); } catch {} }}
          onRegenerateMsg={handleRegenerate} onRetryMsg={handleRetry} onAnalyzeCandidate={handleAnalyzeCandidate}
          onSetInput={setInput} setLastCommand={setLastCommand}
          embeddedTerminal={pi4TerminalEmbedActive ? {
            sessionId: pi4ChatSessionId,
            sshCommandLine: pi4SshCommandLine,
            connecting: pi4ChatConnecting,
            error: pi4ChatError,
            label: pi4ChatLabel,
            onClose: closePi4TerminalInChat,
          } : null}
          embeddedCameras={pi4CamerasEmbedActive ? {
            sessionId: pi4ChatSessionId,
            connecting: pi4ChatConnecting,
            error: pi4ChatError,
            label: `Cámaras · ${pi4ChatLabel}`,
            onClose: closePi4CamerasInChat,
          } : null}
          embeddedDesktop={pi4DesktopEmbedActive ? {
            sessionId: sessionId ?? pi4ChatSessionId,
            connecting: sessionId ? false : pi4ChatConnecting,
            error: sessionId ? null : pi4ChatError,
            label: sessionId ? 'Escritorio remoto' : `Escritorio · ${pi4ChatLabel}`,
            onClose: closePi4DesktopInChat,
          } : null}
        />
      )}
      {toast && <ChatToast message={toast} />}
      {isHome && !isHomeEmpty ? (
        <div className="shrink-0 flex flex-col items-center w-full px-5 pb-5 gap-2 box-border">
          <TerminalBanners
            appearance="landing"
            errorBanner={errorBanner}
            onDismissError={() => setErrorBanner(null)}
            onAnalyze={() => {
              archiveCurrentChatRef.current?.();
              loadedHistoryIdRef.current = null;
              messageCountAtLoadRef.current = 0;
              setAttachedImage(null);
              setMode('agente');
              setErrorBanner(null);
              setTerminalActivity(false);
              setInput('hay un error en la terminal, revísalo y corrígelo');
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
            terminalActivity={terminalActivity}
            onDismissActivity={() => setTerminalActivity(false)}
          />
          {chatInputEl}
        </div>
      ) : (
        <>
          <TerminalBanners
            appearance={isHome ? 'landing' : 'session'}
            errorBanner={errorBanner}
            onDismissError={() => setErrorBanner(null)}
            onAnalyze={() => {
              archiveCurrentChatRef.current?.();
              loadedHistoryIdRef.current = null;
              messageCountAtLoadRef.current = 0;
              setAttachedImage(null);
              setMode('agente');
              setErrorBanner(null);
              setTerminalActivity(false);
              setInput('hay un error en la terminal, revísalo y corrígelo');
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
            terminalActivity={terminalActivity}
            onDismissActivity={() => setTerminalActivity(false)}
          />
          {!isHomeEmpty && chatInputEl}
        </>
      )}
      <ChatHistoryPanel
        showHistory={showHistory} setShowHistory={setShowHistory} historySearch={historySearch} setHistorySearch={setHistorySearch}
        historyEntries={historyEntries} pendingDeleteId={pendingDeleteId} hostKey={hostKey}
        handleLoadHistory={handleLoadHistory} handleDeleteHistoryEntry={handleDeleteHistoryEntry}
        confirmDeleteHistoryEntry={confirmDeleteHistoryEntry} cancelDeleteHistoryEntry={cancelDeleteHistoryEntry}
      />
      <ChatModals
        showModeConfirm={showModeConfirm} confirmModeSwitch={confirmModeSwitch} cancelModeSwitch={cancelModeSwitch}
        showShortcuts={showShortcuts} setShowShortcuts={setShowShortcuts}
      />
    </div>
  );
};

export default ChatPane;
