import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import './ChatPane.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useSessionMemory } from '../hooks/useSessionMemory';

import { ChatMode, Message, AgentState, AiResponseRaw, ModeHandlerContext, ModelSelection } from './chatModes/types';
import { AskModeHandler } from './chatModes/classes/AskModeHandler';
import { AgenteModeHandler } from './chatModes/classes/AgenteModeHandler';
import { PlanModeHandler } from './chatModes/classes/PlanModeHandler';
import { cleanText, isNearBottom } from './chat/chatUtils';
import ChatMessageList from './chat/ChatMessageList';

import ChatHeader from './chatPane/ChatHeader';
import ChatSearchBar from './chatPane/ChatSearchBar';
import ChatInput from './chatPane/ChatInput';
import ChatHistoryPanel from './chatPane/ChatHistoryPanel';
import ChatModals from './chatPane/ChatModals';
import TerminalBanners from './chatPane/TerminalBanners';
import { MODEL_CONTEXT_WINDOW } from './chatPane/chatPane.constants';

// Hooks extraídos
import { useTerminalMonitor } from './chatPane/hooks/useTerminalMonitor';
import { useChatExport } from './chatPane/hooks/useChatExport';
import { useChatStorage } from './chatPane/hooks/useChatStorage';
import { useChatHistoryManager } from './chatPane/hooks/useChatHistoryManager';
import { useChatModeSwitch } from './chatPane/hooks/useChatModeSwitch';

type Props = {
  sessionId?: string | null;
  onClose?: () => void;
};

const ChatPane: React.FC<Props> = ({ sessionId = null, onClose }) => {
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
  const [hostKey, setHostKey] = useState<string>(sessionId ?? 'default');

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
  useEffect(() => {
    if (!sessionId) { setHostKey('default'); return; }
    invoke<{ host: string; port: number; user: string }>('ssh_session_info', { id: sessionId })
      .then(info => setHostKey(`${info.user}@${info.host}`))
      .catch(() => setHostKey(sessionId));
  }, [sessionId]);

  useEffect(() => { localStorage.setItem('chatSelectedModel', selectedModel); }, [selectedModel]);

  // ── Modos ──
  const modeHandlers = useMemo<Record<ChatMode, any>>(() => ({
    ask: new AskModeHandler(),
    agente: new AgenteModeHandler(),
    plan: new PlanModeHandler(),
  }), []);

  // ── Custom Hooks ──
  const { errorBanner, setErrorBanner, terminalActivity, setTerminalActivity } = useTerminalMonitor(sessionId);
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
    mode, setMode, messages, setMessages, sessionId, attachedImage, setAttachedImage, attachedFile, setAttachedFile,
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
      const res = await invoke<AiResponseRaw>('ai_chat', {
        req: {
          user_input: getContent(userMsg), mode, history, state: agentState, model_selection: selectedModel,
          image_base64: imgSnap?.base64 ?? null, image_media_type: imgSnap?.mediaType ?? null,
          terminal_context: null, request_id: reqId,
        }
      });
      unlistenChunk(); currentReqIdRef.current = null;
      if (!isSendingRef.current) { setStreamedText(''); setStreamingMsgId(null); return; }
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
    sessionId, agentState, setAgentState: s => setAgentState({ ...s }), messages, setMessages, setIsSending, cleanText, invokeAsk, setStreamingMsgId, setStreamedText,
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

  // ── Render ──
  return (
    <div className="chat-pane">
      <ChatHeader
        mode={mode} onModeSwitch={handleModeSwitch} sessionId={sessionId}
        selectedModel={selectedModel} onModelChange={setSelectedModel}
        showHistory={showHistory} onToggleHistory={() => setShowHistory(o => !o)}
        searchOpen={searchOpen} onToggleSearch={() => { setSearchOpen(o => !o); if (searchOpen) setSearchQuery(''); }}
        onExportMd={handleExportMd} onExportHtml={handleExportHtml}
        messagesEmpty={messages.length === 0}
        showShortcuts={showShortcuts} onToggleShortcuts={() => setShowShortcuts(s => !s)}
        onNewChat={handleNewChat} onClose={onClose}
      />
      {searchOpen && (
        <ChatSearchBar
          searchQuery={searchQuery} setSearchQuery={setSearchQuery} setSearchOpen={setSearchOpen}
          searchMatchIds={searchMatchIds} searchMatchIndex={searchMatchIndex} setSearchMatchIndex={setSearchMatchIndex}
        />
      )}
      <ChatMessageList
        messages={messages} mode={mode} isSending={isSending}
        searchMatchIds={searchMatchIds} searchMatchIndex={searchMatchIndex}
        streamingMsgId={streamingMsgId} streamedText={streamedText}
        sessionId={sessionId} showScrollToBottom={showScrollToBottom}
        messagesRef={messagesRef} setShowScrollToBottom={setShowScrollToBottom}
        onScrollToBottom={() => { const el = messagesRef.current; if (el) { el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); setShowScrollToBottom(false); } }}
        handleSuggestionClick={text => handleSendRef.current?.(text)}
        onDeleteMsg={handleDeleteMsg} onSaveEditMsg={handleSaveEditMsg}
        onCopyMsg={async text => { try { await navigator.clipboard.writeText(text); setToast('Copiado al portapapeles'); setTimeout(() => setToast(null), 2000); } catch {} }}
        onRegenerateMsg={handleRegenerate} onRetryMsg={handleRetry} onAnalyzeCandidate={handleAnalyzeCandidate}
        onSetInput={setInput} onCancel={handleCancel} setLastCommand={setLastCommand}
      />
      {toast && <div className="chat-toast">{toast}</div>}
      <TerminalBanners
        errorBanner={errorBanner} onDismissError={() => setErrorBanner(null)}
        onAnalyze={() => { archiveCurrentChatRef.current?.(); loadedHistoryIdRef.current = null; messageCountAtLoadRef.current = 0; setAttachedImage(null); setMode('agente'); setErrorBanner(null); setTerminalActivity(false); setInput('hay un error en la terminal, revísalo y corrígelo'); setTimeout(() => inputRef.current?.focus(), 50); }}
        terminalActivity={terminalActivity} onDismissActivity={() => setTerminalActivity(false)}
      />
      <ChatInput
        input={input} setInput={setInput} mode={mode} isSending={isSending}
        onSend={handleSend} onCancel={handleCancel} canSend={modeHandlers[mode]?.canSend() ?? false}
        attachedImage={attachedImage} setAttachedImage={setAttachedImage}
        attachedFile={attachedFile} setAttachedFile={setAttachedFile}
        inputRef={inputRef} isComposingRef={isComposingRef} messages={messages}
        sessionTokens={sessionTokens} setSessionTokens={setSessionTokens} sessionId={sessionId}
        ctxUsagePct={Math.min(100, (sessionTokens.input / (MODEL_CONTEXT_WINDOW[selectedModel] || 200000)) * 100)}
        setToast={setToast} showTokenPopover={showTokenPopover} setShowTokenPopover={setShowTokenPopover}
      />
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
