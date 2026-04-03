// Panel de chat: integra modo ASK (explicar) y AGENT (sugerir/confirmar comandos).
// Componente refactorizado — lógica y UI extraída a sub-módulos en ./chatPane/
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import './ChatPane.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useSessionMemory } from '../hooks/useSessionMemory';

// Tipos
import { ChatMode, Message, AgentState, AiResponseRaw, ModeHandlerContext, ModelSelection, AVAILABLE_MODELS } from './chatModes/types';
// Handlers de modo
import { AskModeHandler } from './chatModes/classes/AskModeHandler';
import { AgenteModeHandler } from './chatModes/classes/AgenteModeHandler';
import { PlanModeHandler } from './chatModes/classes/PlanModeHandler';
// Componentes de renderizado de mensajes
import AskRenderer from './chat/AskRenderer';
import AgentStepsRenderer from './chat/AgentStepsRenderer';
import ToolResultRenderer from './chat/ToolResultRenderer';
import DiffView from './analysis/DiffView';
import './analysis/DiffView.css';
import './analysis/FileDisambiguation.css';
// Utilidades
import { cleanText, isNearBottom } from './chat/chatUtils';

// Sub-módulos extraídos
import ChatHeader from './chatPane/ChatHeader';
import ChatSearchBar from './chatPane/ChatSearchBar';
import ChatInput from './chatPane/ChatInput';
import ChatHistoryPanel from './chatPane/ChatHistoryPanel';
import ChatModals from './chatPane/ChatModals';
import TerminalBanners from './chatPane/TerminalBanners';
import {
  CHAT_STORAGE_KEY, TOKEN_STORAGE_KEY, MODEL_CONTEXT_WINDOW,
  MODE_SUGGESTIONS, MODE_DESCRIPTIONS, fmtTime,
  HistoryEntry,
} from './chatPane/chatPane.constants';

type Props = {
  sessionId?: string | null;
  onClose?: () => void;
};

// ── Constantes de módulo (evitar recreación por render) ──
const ERROR_PATTERNS = [
  /bash:.*command not found/i,
  /Failed to (start|restart|stop|reload)/i,
  /Job for .* failed/i,
  /Permission denied/i,
  /No such file or directory/i,
  /fatal:/i,
  /Traceback \(most recent call last\)/i,
  /npm ERR!/i,
  /pip.*[Ee]rror/i,
  /syntax error/i,
  /cannot (access|connect|open|find)/i,
  /\[error\]/i,
  /Error:/,
];
const isPromptLine = (l: string) => l.length < 120 && /[\$#%>]([ \t]{0,3}$|[ \t]\S)/.test(l);

const ChatPane: React.FC<Props> = ({ sessionId = null, onClose }) => {
  // ── State ──
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<ChatMode>('ask');
  const [selectedModel, setSelectedModel] = useState<ModelSelection>(() => {
    const saved = localStorage.getItem('chatSelectedModel');
    return (saved as ModelSelection) || 'claude-sonnet-4-5';
  });
  const [agentState, setAgentState] = useState<AgentState>({
    cwd: '/', lastExitCode: undefined, lastStdoutTail: undefined, lastFile: undefined,
  });
  const [isSending, setIsSending] = useState(false);
  const isSendingRef = useRef(false);
  const [errorBanner, setErrorBanner] = useState<{ snippet: string } | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [attachedImage, setAttachedImage] = useState<{ base64: string; mediaType: string; preview: string; label?: string } | null>(null);
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const attachedFileRef = useRef<{ name: string; content: string } | null>(null);
  const currentReqIdRef = useRef<string | null>(null);
  const [terminalActivity, setTerminalActivity] = useState(false);
  const terminalDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showModeConfirm, setShowModeConfirm] = useState<ChatMode | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [streamedText, setStreamedText] = useState('');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [sessionTokens, setSessionTokens] = useState<{ input: number; output: number }>(() => {
    try {
      const saved = localStorage.getItem(TOKEN_STORAGE_KEY(sessionId ?? null));
      if (saved) return JSON.parse(saved);
    } catch {}
    return { input: 0, output: 0 };
  });
  const [showTokenPopover, setShowTokenPopover] = useState(false);
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [hostKey, setHostKey] = useState<string>(sessionId ?? 'default');

  // ── Refs ──
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const isComposingRef = useRef<boolean>(false);
  const handleSendRef = useRef<((overrideText?: string) => void)>(() => {});
  const loadedHistoryIdRef = useRef<string | null>(null);
  const messageCountAtLoadRef = useRef<number>(0);
  const pendingAttachedImageRef = useRef<{ base64: string; mediaType: string; preview: string; label?: string } | null>(null);
  const pendingAttachedFileRef = useRef<{ name: string; content: string } | null>(null);
  const skipRestoreRef = useRef(false);
  // Keep ref in sync with state so handleSend always reads the latest value
  useEffect(() => { attachedFileRef.current = attachedFile; }, [attachedFile]);
  const archiveCurrentChatRef = useRef(archiveCurrentChat);

  // ── Session memory ──
  const { mem, setLastCommand, clear } = useSessionMemory(sessionId ?? null);

  // ── Resolve hostKey ──
  useEffect(() => {
    if (!sessionId) { setHostKey('default'); return; }
    invoke<{ host: string; port: number; user: string }>('ssh_session_info', { id: sessionId })
      .then(info => setHostKey(`${info.user}@${info.host}`))
      .catch(() => setHostKey(sessionId));
  }, [sessionId]);

  // ── Terminal error detection ──
  useEffect(() => {
    if (!sessionId) return;
    const unlisten = listen<string>(`ssh_out_${sessionId}`, (ev) => {
      if (ev.payload && /\x1b\[2J/.test(ev.payload)) {
        setErrorBanner(null);
        setTerminalActivity(false);
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const unlisten = listen<{ session_id: string }>('terminal:activity', (ev) => {
      if (ev.payload.session_id !== sessionId) return;
      if (terminalDebounceRef.current) clearTimeout(terminalDebounceRef.current);
      terminalDebounceRef.current = setTimeout(async () => {
        setTerminalActivity(true);
        try {
          const ctx = await invoke<string>('get_terminal_context', { sessionId, lines: 40 });
          if (/\x1b\[2J/.test(ctx)) { setErrorBanner(null); return; }
          const stripped = ctx.replace(/\x1b\[[0-9;]*[mGKHFJA-Za-z]/g, '').replace(/\r/g, '');
          const lines = stripped.split('\n').map(l => l.trim()).filter(Boolean);
          if (lines.length <= 4 && lines.every(l => isPromptLine(l) || l.length < 6)) {
            setErrorBanner(null); return;
          }
          const promptIdxs = lines.reduce<number[]>((acc, l, i) => {
            if (isPromptLine(l)) acc.push(i); return acc;
          }, []);
          if (promptIdxs.length < 2) return;
          const start = promptIdxs[promptIdxs.length - 2];
          const end   = promptIdxs[promptIdxs.length - 1];
          const cmdOutput = lines.slice(start + 1, end);
          let errorFound = false;
          for (const line of cmdOutput) {
            if (ERROR_PATTERNS.some(p => p.test(line))) {
              setErrorBanner({ snippet: line.slice(0, 100) }); errorFound = true; break;
            }
          }
          if (!errorFound && cmdOutput.length > 0) setErrorBanner(null);
        } catch { /* no active session */ }
      }, 1500);
    });
    return () => { unlisten.then(fn => fn()); };
  }, [sessionId]);

  // ── Token tracking ──
  useEffect(() => {
    const unlisten = listen<{ request_id: string; input_tokens: number; output_tokens: number; model: string }>('ai:usage', (ev) => {
      const { model, input_tokens, output_tokens } = ev.payload;
      console.log('%c[AI tokens]%c modelo=%s  entrada=%d  salida=%d  total=%d',
        'color:#a78bfa;font-weight:bold', 'color:#94a3b8',
        model, input_tokens, output_tokens, input_tokens + output_tokens);
      setSessionTokens(prev => {
        const next = { input: prev.input + input_tokens, output: prev.output + output_tokens };
        try { localStorage.setItem(TOKEN_STORAGE_KEY(sessionId ?? null), JSON.stringify(next)); } catch {}
        return next;
      });
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  // ── Auto-scroll ──
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
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [streamedText]);

  // ── System message feedback ──
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || !detail.text) return;
      setMessages(prev => [...prev, { id: String(Date.now()), sender: 'system', text: detail.text }]);
    };
    document.addEventListener('chat:system-msg', handler as any);
    return () => document.removeEventListener('chat:system-msg', handler as any);
  }, []);

  // ── Persist model selection ──
  useEffect(() => {
    localStorage.setItem('chatSelectedModel', selectedModel);
  }, [selectedModel]);

  // ── Persist messages ──
  useEffect(() => {
    if (messages.length === 0) return;
    try {
      const key = CHAT_STORAGE_KEY(sessionId ?? null, mode);
      const toSave = messages.slice(-100).map(m => {
        // Preserve meta but strip large binary fields to avoid bloating localStorage
        const { attachedFileContent, imagePreview, ...safeMeta } = (m.meta ?? {}) as any;
        void attachedFileContent; void imagePreview;
        const meta = Object.keys(safeMeta).length > 0 ? safeMeta : undefined;
        return { id: m.id, sender: m.sender, text: m.text, timestamp: m.timestamp, ...(meta ? { meta } : {}) };
      });
      localStorage.setItem(key, JSON.stringify(toSave));
    } catch { /* storage full */ }
  }, [messages, sessionId, mode]);

  // ── Restore messages ──
  useEffect(() => {
    if (skipRestoreRef.current) { skipRestoreRef.current = false; return; }
    try {
      const key = CHAT_STORAGE_KEY(sessionId ?? null, mode);
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved) as Message[];
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
      }
    } catch { /* corrupted */ }
  }, [sessionId, mode]);

  // ── Textarea auto-resize ──
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const style = window.getComputedStyle(el);
    const fixedH = (style.getPropertyValue('--chat-input-fixed-height') || '').trim();
    if (fixedH) { el.style.height = fixedH; el.style.overflowY = 'hidden'; return; }
    el.style.height = 'auto';
    const lineHeightVar = style.getPropertyValue('--chat-input-line-height');
    const paddingYVar = style.getPropertyValue('--chat-input-padding-y');
    const lineHeight = parseFloat(lineHeightVar || style.lineHeight) || 20;
    const paddingTop = parseFloat(paddingYVar || style.paddingTop) || 0;
    const paddingBottom = parseFloat(paddingYVar || style.paddingBottom) || 0;
    const maxPx = Math.round(paddingTop + paddingBottom + lineHeight * 5);
    const newH = Math.min(el.scrollHeight, maxPx);
    el.style.height = newH + 'px';
    el.style.overflowY = el.scrollHeight > maxPx ? 'auto' : 'hidden';
  }, [input]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (document.activeElement === inputRef.current) return;
      if (e.key === '?' && e.shiftKey) { e.preventDefault(); setShowShortcuts(s => !s); }
      if (e.key === 'Escape') setShowShortcuts(false);
      if (e.ctrlKey && e.key === 'n') { e.preventDefault(); handleNewChat(); }
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => (document.querySelector('.chat-search-input') as HTMLInputElement | null)?.focus(), 50);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // ── Archive / history ──
  async function archiveCurrentChat(excludeEntryId?: string): Promise<boolean> {
    if (!messages.some(m => m.sender === 'user')) return false;
    const userMsgs = messages.filter(m => m.sender !== 'system');
    if (loadedHistoryIdRef.current && userMsgs.length <= messageCountAtLoadRef.current) return false;
    const excludeIds = new Set<string>([
      ...(excludeEntryId ? [excludeEntryId] : []),
      ...(loadedHistoryIdRef.current ? [loadedHistoryIdRef.current] : []),
    ]);
    try {
      const existing = await invoke<HistoryEntry[]>('chat_history_load', { sessionId: hostKey, mode });
      const entry: HistoryEntry = {
        id: crypto.randomUUID(), date: Date.now(),
        preview: messages.find(m => m.sender === 'user')?.text?.slice(0, 100) ?? '',
        messageCount: userMsgs.length, mode,
        messages: userMsgs.slice(-50).map(m => {
          const { attachedFileContent, imagePreview, ...safeMeta } = (m.meta ?? {}) as any;
          void attachedFileContent; void imagePreview;
          const meta = Object.keys(safeMeta).length > 0 ? safeMeta : undefined;
          return { id: m.id, sender: m.sender, text: m.text, timestamp: m.timestamp, ...(meta ? { meta } : {}) };
        }),
      };
      const merged = [entry, ...existing.filter(e => !excludeIds.has(e.id))];
      const seenIds = new Set<string>();
      const updated = merged.filter(e => { if (seenIds.has(e.id)) return false; seenIds.add(e.id); return true; }).slice(0, 20);
      await invoke('chat_history_save', { sessionId: hostKey, mode, entries: updated });
      return true;
    } catch { return false; }
  }

  useEffect(() => { archiveCurrentChatRef.current = archiveCurrentChat; });

  const handleNewChat = async () => {
    const saved = await archiveCurrentChat();
    loadedHistoryIdRef.current = null;
    messageCountAtLoadRef.current = 0;
    setMessages([]);
    setSessionTokens({ input: 0, output: 0 });
    try {
      localStorage.removeItem(CHAT_STORAGE_KEY(sessionId ?? null, mode));
      localStorage.removeItem(TOKEN_STORAGE_KEY(sessionId ?? null));
    } catch {}
    clear();
    if (saved) { setToast('Chat guardado en historial'); setTimeout(() => setToast(null), 2500); }
  };

  const handleLoadHistory = async (entry: HistoryEntry) => {
    await archiveCurrentChat(entry.id);
    loadedHistoryIdRef.current = entry.id;
    messageCountAtLoadRef.current = (entry.messages as Message[]).filter(m => m.sender !== 'system').length;
    setMessages(entry.messages as Message[]);
    setShowHistory(false);
    if (entry.mode && entry.mode !== mode) { skipRestoreRef.current = true; setMode(entry.mode as ChatMode); }
  };

  const handleDeleteHistoryEntry = (id: string, ev: React.MouseEvent) => {
    ev.stopPropagation(); setPendingDeleteId(id);
  };
  const confirmDeleteHistoryEntry = async (id: string, ev: React.MouseEvent) => {
    ev.stopPropagation();
    try {
      const updated = await invoke<HistoryEntry[]>('chat_history_delete_entry', { sessionId: hostKey, mode, entryId: id });
      setHistoryEntries(updated);
    } catch { } finally { setPendingDeleteId(null); }
  };
  const cancelDeleteHistoryEntry = (ev: React.MouseEvent) => {
    ev.stopPropagation(); setPendingDeleteId(null);
  };

  // ── Load history entries when panel opens ──
  useEffect(() => {
    if (!showHistory) return;
    Promise.all(
      (['ask', 'agente', 'plan'] as ChatMode[]).map(m =>
        invoke<HistoryEntry[]>('chat_history_load', { sessionId: hostKey, mode: m })
          .then(entries => entries.map(e => ({ ...e, mode: e.mode ?? m })))
          .catch(() => [] as HistoryEntry[])
      )
    ).then(results => {
      const seen = new Set<string>();
      const merged = results.flat()
        .sort((a, b) => b.date - a.date)
        .filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });
      setHistoryEntries(merged);
    });
  }, [showHistory, hostKey]);

  // ── Cancel / retry / regen / copy ──
  const handleCancel = useCallback(() => {
    if (currentReqIdRef.current) { invoke('cancel_ai_chat', { requestId: currentReqIdRef.current }).catch(() => {}); currentReqIdRef.current = null; }
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    isSendingRef.current = false; setIsSending(false);
    setMessages(prev => [...prev, { id: String(Date.now()), sender: 'system', text: 'Respuesta cancelada por el usuario.' }]);
  }, []);

  const handleRetry = useCallback((msgId: string) => {
    const idx = messages.findIndex(m => m.id === msgId);
    if (idx < 1) return;
    let userMsg: Message | null = null;
    for (let i = idx - 1; i >= 0; i--) { if (messages[i].sender === 'user') { userMsg = messages[i]; break; } }
    if (!userMsg) return;
    setMessages(prev => prev.filter(m => m.id !== msgId));
    const handler = modeHandlers[mode];
    if (!handler?.canSend()) return;
    setIsSending(true); isSendingRef.current = true;
    handler.send(userMsg.text, userMsg, buildModeContext()).catch((e: any) => {
      setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `Error: ${String(e)}` }]);
    }).finally(() => { isSendingRef.current = false; setIsSending(false); });
  }, [messages, mode]);

  const handleRegenerate = useCallback((msgId: string) => {
    if (isSending) return;
    const idx = messages.findIndex(m => m.id === msgId);
    if (idx < 1) return;
    let userMsg: Message | null = null;
    for (let i = idx - 1; i >= 0; i--) { if (messages[i].sender === 'user') { userMsg = messages[i]; break; } }
    if (!userMsg) return;
    setMessages(prev => prev.filter((_m, i) => i < idx));
    const handler = modeHandlers[mode];
    if (!handler?.canSend()) return;
    setIsSending(true); isSendingRef.current = true;
    handler.send(userMsg.text, userMsg, buildModeContext()).catch((e: any) => {
      setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `Error: ${String(e)}` }]);
    }).finally(() => { isSendingRef.current = false; setIsSending(false); });
  }, [messages, mode]);

  const handleCopyMessage = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast('Copiado al portapapeles');
      setTimeout(() => setToast(null), 2000);
    } catch { /* clipboard not available */ }
  }, []);

  // ── Mode switch ──
  const handleModeSwitch = useCallback((newMode: ChatMode) => {
    if (newMode === mode) return;
    if (!sessionId && (newMode === 'agente' || newMode === 'plan')) {
      setToast('Requiere una sesión SSH activa'); setTimeout(() => setToast(null), 2000); return;
    }
    if (messages.some(m => m.sender === 'user')) {
      pendingAttachedImageRef.current = attachedImage;
      pendingAttachedFileRef.current = attachedFile;
      setShowModeConfirm(newMode);
    } else {
      setAttachedImage(null); setAttachedFile(null); setMode(newMode); clear();
    }
  }, [mode, messages, sessionId, attachedImage]);

  const confirmModeSwitch = useCallback(async () => {
    if (!showModeConfirm) return;
    await archiveCurrentChatRef.current();
    loadedHistoryIdRef.current = null; messageCountAtLoadRef.current = 0;
    setAttachedImage(null); setAttachedFile(null); pendingAttachedImageRef.current = null; pendingAttachedFileRef.current = null;
    skipRestoreRef.current = true;
    setMode(showModeConfirm); setMessages([]); clear(); setShowModeConfirm(null);
  }, [showModeConfirm]);

  const cancelModeSwitch = useCallback(() => {
    if (pendingAttachedImageRef.current !== null) {
      setAttachedImage(pendingAttachedImageRef.current);
      pendingAttachedImageRef.current = null;
    }
    if (pendingAttachedFileRef.current !== null) {
      setAttachedFile(pendingAttachedFileRef.current);
      pendingAttachedFileRef.current = null;
    }
    setShowModeConfirm(null);
  }, []);

  // ── Export ──
  const handleExportMd = useCallback(async () => {
    if (messages.length === 0) return;
    const lines: string[] = [`# Chat SSH — ${new Date().toLocaleString('es')}\n`];
    for (const m of messages) {
      if (m.sender === 'user') lines.push(`**Tú:**\n\n${m.text}`);
      else if (m.sender === 'ai') lines.push(`**Asistente:**\n\n${m.text}`);
    }
    const content = lines.join('\n\n---\n\n');
    const defaultName = `chat-ssh-${new Date().toISOString().slice(0, 10)}.md`;
    try {
      const savedPath = await invoke<string>('save_text_file', { content, defaultName });
      if (savedPath && savedPath !== 'cancelled') {
        setToast(`Guardado: ${savedPath.split(/[\\/]/).pop()}`);
        setTimeout(() => setToast(null), 2500);
      }
    } catch (e) {
      const err = String(e);
      if (err !== 'cancelled') setToast('Error al guardar el archivo');
      setTimeout(() => setToast(null), 2000);
    }
  }, [messages]);

  // ── Export HTML ──
  const handleExportHtml = useCallback(async () => {
    if (messages.length === 0) return;
    const date = new Date().toLocaleString('es');
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const renderBody = (text: string) =>
      esc(text)
        .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
          `<pre class="cb"${lang ? ` data-lang="${lang}"` : ''}><code>${code}</code></pre>`)
        .replace(/\n/g, '<br>');
    const msgsHtml = messages
      .filter(m => m.sender !== 'system')
      .map(m => {
        const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '';
        const lbl = m.sender === 'user' ? 'Tú' : 'Asistente';
        return `<div class="m ${m.sender === 'user' ? 'u' : 'a'}"><div class="ml">${lbl}<span class="mt">${time}</span></div><div class="mb">${renderBody(m.text)}</div></div>`;
      })
      .join('\n');
    const html = `<!DOCTYPE html>\n<html lang="es"><head>\n<meta charset="UTF-8"><title>Chat SSH — ${date}</title>\n<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f1117;color:#e2e8f0;padding:24px;line-height:1.6}.chat{max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:12px}h1{font-size:1.1rem;color:#a78bfa;margin-bottom:2px}.date{font-size:.75rem;color:#475569;margin-bottom:20px}.m{padding:12px 16px;border-radius:10px;font-size:.875rem}.u{background:#1e2130;border:1px solid rgba(255,255,255,.07);align-self:flex-end;max-width:80%}.a{background:#161924;border:1px solid rgba(167,139,250,.12);max-width:92%}.ml{font-size:.7rem;font-weight:600;margin-bottom:6px;display:flex;gap:8px}.u .ml{color:#60a5fa}.a .ml{color:#a78bfa}.mt{font-weight:400;color:#475569}.cb{background:#0c0e16;border:1px solid rgba(255,255,255,.07);border-radius:6px;padding:12px;margin:8px 0;font-family:'Fira Code','Courier New',monospace;font-size:.8rem;overflow-x:auto;white-space:pre}</style>\n</head><body><div class="chat"><h1>Chat SSH</h1><div class="date">${date}</div>\n${msgsHtml}\n</div></body></html>`;
    const defaultName = `chat-ssh-${new Date().toISOString().slice(0, 10)}.html`;
    try {
      const savedPath = await invoke<string>('save_text_file', { content: html, defaultName });
      if (savedPath && savedPath !== 'cancelled') { setToast(`HTML guardado: ${savedPath.split(/[\\/]/).pop()}`); setTimeout(() => setToast(null), 2500); }
    } catch (e) {
      const err = String(e);
      if (err !== 'cancelled') setToast('Error al exportar HTML');
      setTimeout(() => setToast(null), 2000);
    }
  }, [messages]);

  // ── Misc helpers ──
  const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);
  const handleSuggestionClick = useCallback((text: string) => { handleSendRef.current?.(text); }, []);

  // ── Mode handlers ──
  const modeHandlers = useMemo<Record<ChatMode, any>>(() => ({
    ask: new AskModeHandler(),
    agente: new AgenteModeHandler(),
    plan: new PlanModeHandler(),
  }), []);

  // ── invokeAsk ──
  const invokeAsk = async ({ finalInput, mode, userMsg }: { finalInput: string; mode: ChatMode; userMsg: Message }) => {
    const getContent = (m: Message) => {
      let c = m.text;
      if (m.meta?.attachedFileContent) c += `\n\n📄 ${m.meta.attachedFileName}:\n\`\`\`text\n${m.meta.attachedFileContent}\n\`\`\``;
      return c;
    };
    const history = [...messages, userMsg]
      .filter(m => m.sender !== 'system')
      .map(m => ({ role: m.sender === 'ai' ? 'assistant' : 'user', content: getContent(m) }));
    const enrichedInput = getContent(userMsg);
    // Si attachedImage ya fue limpiado (retry/regen), reconstruirlo desde el meta del mensaje
    const imgSnap = attachedImage ?? (userMsg.meta?.imagePreview
      ? (() => {
          const preview = userMsg.meta.imagePreview!;
          const commaIdx = preview.indexOf(',');
          const base64 = preview.substring(commaIdx + 1);
          const mediaType = preview.substring(0, commaIdx).replace('data:', '').replace(';base64', '');
          return { base64, mediaType, preview, label: undefined as string | undefined };
        })()
      : null);
    setAttachedImage(null); setTerminalActivity(false);
    const reqId = crypto.randomUUID();
    currentReqIdRef.current = reqId;
    const streamId = reqId;
    setStreamingMsgId(streamId); setStreamedText('');
    setMessages(prev => [...prev, { id: streamId, sender: 'ai' as const, text: '', timestamp: Date.now(), meta: { chat_mode: mode } }]);
    const unlistenChunk = await listen<{ request_id: string; delta: string }>('ai:chunk', (ev) => {
      if (ev.payload.request_id !== reqId) return;
      setStreamedText(prev => prev + ev.payload.delta);
    });
    let res: AiResponseRaw;
    try {
      res = await invoke<AiResponseRaw>('ai_chat', {
        req: {
          user_input: enrichedInput, mode, history, state: agentState,
          model_selection: selectedModel,
          image_base64: imgSnap?.base64 ?? null, image_media_type: imgSnap?.mediaType ?? null,
          terminal_context: null, request_id: reqId,
        }
      });
    } catch (e) {
      unlistenChunk();
      setStreamedText(''); setStreamingMsgId(null);
      setMessages(prev => prev.filter(m => m.id !== streamId));
      const errStr = String(e);
      if (errStr === 'cancelled' || errStr.toLowerCase().includes('cancelled')) return;
      throw e;
    }
    unlistenChunk(); currentReqIdRef.current = null;
    if (!isSendingRef.current) { setStreamedText(''); setStreamingMsgId(null); return; }
    const aiText = String((res as any).ai_response || (res as any).explanation || '');
    const displayText = cleanText(aiText);
    const cleanedMeta: any = { chat_mode: mode, ...(res as any) };
    delete cleanedMeta.code_output; delete cleanedMeta.suggestedCommands;
    setMessages(prev => prev.map(m => m.id === streamId ? { ...m, text: displayText, meta: cleanedMeta } : m));
    setStreamedText(''); setStreamingMsgId(null);
  };

  const buildModeContext = (): ModeHandlerContext => ({
    sessionId, agentState,
    setAgentState: s => setAgentState({ ...s }),
    messages, setMessages, setIsSending, cleanText, invokeAsk,
  });

  // ── handleSend ──
  const handleSend = async (overrideText?: string) => {
    if (isSending || isSendingRef.current) return;
    const trimmed = (overrideText ?? input).trim();
    if (!trimmed) return;
    const handler = modeHandlers[mode];
    if (!handler) return;
    if (!handler.canSend()) {
      setMessages(prev => [...prev, { id: String(Date.now()), sender: 'system', text: 'Modo actual no permite enviar mensajes.' }]);
      setInput(''); return;
    }
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

  const handleAnalyzeCandidate = async (base: string, candidate: string, action: string = 'analyze', index?: number) => {
    if (isSending) return;
    setIsSending(true);
    try {
      const command = action === 'optimize' && index !== undefined ? `mejora ${index + 1}` :
        action === 'optimize' ? `mejora ${candidate}` : `analizame ${candidate}`;
      const userMsg: Message = { id: String(Date.now()), sender: 'user', text: command };
      setMessages(prev => [...prev, userMsg]);
      await modeHandlers['ask'].send(command, userMsg, buildModeContext());
    } catch (e) {
      const actionText = action === 'optimize' ? 'optimizando' : 'analizando';
      setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `Error ${actionText} ${candidate}: ${String(e)}` }]);
    } finally { setIsSending(false); }
  };

  // ── Search ──
  const searchMatchIds = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return messages.filter(m => m.text.toLowerCase().includes(q)).map(m => m.id);
  }, [messages, searchQuery]);
  useEffect(() => { setSearchMatchIndex(0); }, [searchQuery]);
  useEffect(() => {
    if (searchMatchIds.length === 0) return;
    const id = searchMatchIds[searchMatchIndex];
    const msgEl = document.getElementById(`msg-${id}`);
    const container = messagesRef.current;
    if (!msgEl || !container) return;
    const containerRect = container.getBoundingClientRect();
    const msgRect = msgEl.getBoundingClientRect();
    const offset = container.scrollTop + msgRect.top - containerRect.top - container.clientHeight / 2 + msgEl.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
  }, [searchMatchIndex, searchMatchIds]);

  // ── Context usage ──
  const maxCtxTokens = MODEL_CONTEXT_WINDOW[selectedModel] ?? 200_000;
  const estimatedCtxTokens = Math.round(
    messages.filter(m => m.sender !== 'system').reduce((sum, m) => sum + m.text.length / 4, 0)
  );
  const ctxUsagePct = Math.min(100, (estimatedCtxTokens / maxCtxTokens) * 100);

  // ── Analyze banner handler ──
  const handleAnalyzeFromBanner = async () => {
    if (messages.some(m => m.sender === 'user')) {
      await archiveCurrentChat();
      loadedHistoryIdRef.current = null;
      messageCountAtLoadRef.current = 0;
    }
    setAttachedImage(null); setMode('agente');
    setErrorBanner(null); setTerminalActivity(false);
    setInput('hay un error en la terminal, revísalo y corrígelo');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // ──────────────────────────────────────────────────────────────────────────────
  // JSX
  // ──────────────────────────────────────────────────────────────────────────────
  return (
    <div className="chat-pane">
      {/* ── Header ── */}
      <ChatHeader
        mode={mode}
        onModeSwitch={handleModeSwitch}
        sessionId={sessionId}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        showHistory={showHistory}
        onToggleHistory={() => setShowHistory(o => !o)}
        searchOpen={searchOpen}
        onToggleSearch={() => { setSearchOpen(o => !o); if (searchOpen) setSearchQuery(''); }}
        onExportMd={handleExportMd}
        onExportHtml={handleExportHtml}
        messagesEmpty={messages.length === 0}
        showShortcuts={showShortcuts}
        onToggleShortcuts={() => setShowShortcuts(s => !s)}
        onNewChat={handleNewChat}
        onClose={onClose}
      />

      {/* ── Search bar ── */}
      {searchOpen && (
        <ChatSearchBar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          setSearchOpen={setSearchOpen}
          searchMatchIds={searchMatchIds}
          searchMatchIndex={searchMatchIndex}
          setSearchMatchIndex={setSearchMatchIndex}
        />
      )}

      {/* ── Messages ── */}
      <div
        className={`chat-messages${editingMsgId ? ' chat-messages--editing' : ''}`}
        ref={messagesRef}
        role="log"
        aria-live={isSending ? 'polite' : undefined}
        aria-busy={isSending ? true : undefined}
        onScroll={(e) => { setShowScrollToBottom(!isNearBottom(e.currentTarget as HTMLDivElement)); }}
      >
        {/* Welcome state */}
        {messages.length === 0 && !isSending && (
          <div className="chat-welcome">
            <div className="chat-welcome__icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
              </svg>
            </div>
            <h3 className="chat-welcome__title">Asistente SSH</h3>
            <p className="chat-welcome__subtitle">
              {mode === 'ask' && 'Pregunta, explica o genera código'}
              {mode === 'agente' && 'Ejecuta comandos y diagnostica tu servidor'}
              {mode === 'plan' && 'Genera planes estructurados por fases'}
            </p>
            <div className="chat-welcome__suggestions">
              {MODE_SUGGESTIONS[mode].map((s, i) => (
                <button key={i} className="chat-suggestion-chip" onClick={() => handleSuggestionClick(s.text)}>
                  <span className="chip-icon">{s.icon}</span>
                  <span className="chip-text">{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message list */}
        {messages.map((msg) => {
          const isSearchMatch = searchMatchIds.includes(msg.id);
          const isActiveMatch = searchMatchIds[searchMatchIndex] === msg.id;
          const msgWordCount = msg.sender === 'ai' ? countWords(msg.text) : 0;
          return (
            <div
              key={msg.id}
              id={`msg-${msg.id}`}
              className={`message message-animate ${msg.sender} ${msg.sender === 'user' ? 'message--user' : 'message--assistant'} ${mode}${isActiveMatch ? ' search-active-match' : isSearchMatch ? ' search-match' : ''}${editingMsgId === msg.id ? ' editing-active' : ''}`}
            >
              {!(msg.sender === 'system' && msg.meta?.pendingCommand && !msg.meta?.processed) && (
                msg.sender === 'user' ? (
                  /* ── Burbuja de usuario: card + acciones fuera ── */
                  <div className="user-bubble-group">
                    {editingMsgId === msg.id ? (
                      /* ── Modo edición inline ── */
                      <div className="user-edit-wrap">
                        <textarea
                          className="user-edit-textarea"
                          value={editDraft}
                          autoFocus
                          rows={Math.max(3, editDraft.split('\n').length)}
                          onChange={e => {
                            setEditDraft(e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = e.target.scrollHeight + 'px';
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              const draft = editDraft.trim();
                              if (!draft) return;
                              // Reemplaza este mensaje y elimina todo lo que vino después
                              const idx = messages.findIndex(m => m.id === msg.id);
                              const updatedMsg: Message = { ...msg, text: draft };
                              setMessages(prev => prev.slice(0, idx).concat(updatedMsg));
                              setEditingMsgId(null);
                              // Reenvía
                              const handler = modeHandlers[mode];
                              if (handler?.canSend()) {
                                setIsSending(true); isSendingRef.current = true;
                                handler.send(draft, updatedMsg, buildModeContext()).catch((e: any) => {
                                  setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `Error: ${String(e)}` }]);
                                }).finally(() => { isSendingRef.current = false; setIsSending(false); });
                              }
                            }
                            if (e.key === 'Escape') { setEditingMsgId(null); }
                          }}
                        />
                        <div className="user-edit-actions">
                          <button className="user-edit-btn user-edit-btn--cancel" onClick={() => setEditingMsgId(null)}>Cancelar</button>
                          <button className="user-edit-btn user-edit-btn--save" disabled={!editDraft.trim() || isSending} onClick={() => {
                            const draft = editDraft.trim();
                            if (!draft) return;
                            const idx = messages.findIndex(m => m.id === msg.id);
                            const updatedMsg: Message = { ...msg, text: draft };
                            setMessages(prev => prev.slice(0, idx).concat(updatedMsg));
                            setEditingMsgId(null);
                            const handler = modeHandlers[mode];
                            if (handler?.canSend()) {
                              setIsSending(true); isSendingRef.current = true;
                              handler.send(draft, updatedMsg, buildModeContext()).catch((e: any) => {
                                setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `Error: ${String(e)}` }]);
                              }).finally(() => { isSendingRef.current = false; setIsSending(false); });
                            }
                          }}>Enviar</button>
                        </div>
                        <span className="user-edit-hint">Enter · enviar &nbsp;·&nbsp; Esc · cancelar</span>
                      </div>
                    ) : (
                      <>
                        <div className="message-text message-card">
                          <div className="message-content">
                            {msg.meta?.imagePreview && (
                              <img src={msg.meta.imagePreview} alt="adjunto"
                                style={{ display: 'block', maxHeight: 160, maxWidth: '100%', borderRadius: 6, marginBottom: msg.text ? 6 : 0, objectFit: 'contain' }}
                              />
                            )}
                            {msg.meta?.attachedFileName && (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.30)', fontSize: 11, marginBottom: msg.text ? 6 : 0, maxWidth: '100%' }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                                </svg>
                                <span style={{ opacity: 0.95, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.meta.attachedFileName}</span>
                              </div>
                            )}
                            {msg.text}
                          </div>
                          {msg.timestamp && (
                            <span className="msg-timestamp" title={new Date(msg.timestamp).toLocaleString('es')}>{fmtTime(msg.timestamp)}</span>
                          )}
                        </div>
                        {/* Acciones fuera del fondo morado — visibles al hover */}
                        <div className="msg-actions msg-actions--user">
                          <button
                            className="msg-action-btn"
                            title="Editar"
                            disabled={isSending}
                            onClick={() => { setEditingMsgId(msg.id); setEditDraft(msg.text); }}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                          <button
                            className="msg-action-btn msg-action-btn--delete"
                            title="Borrar mensaje"
                            disabled={isSending}
                            onClick={() => setMessages(prev => prev.filter(m => m.id !== msg.id))}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                              <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                            </svg>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  /* ── Mensaje IA / sistema ── */
                  <div className={`message-text message-card${streamingMsgId === msg.id ? ' is-streaming' : ''}${msg.sender === 'ai' && msg.text.startsWith('Error') ? ' message-card--error' : ''}`}>
                    {msg.timestamp && (
                      <span className="msg-timestamp" title={new Date(msg.timestamp).toLocaleString('es')}>{fmtTime(msg.timestamp)}</span>
                    )}
                    <div className="message-content">
                      {msg.sender === 'ai' ? (
                        <>
                          {msg.meta?.toolSteps && msg.meta.toolSteps.length > 0 && (
                            <AgentStepsRenderer steps={msg.meta.toolSteps} />
                          )}
                          {!msg.meta?.fileAnalysisDisambiguation && (
                            <AskRenderer
                              content={streamingMsgId === msg.id ? streamedText : msg.text}
                              sessionId={sessionId || undefined}
                              setLastCommand={setLastCommand as any}
                              mode={mode}
                            />
                          )}
                          {msg.meta?.toolAction && (
                            <ToolResultRenderer action={msg.meta.toolAction} sessionId={sessionId || undefined} />
                          )}
                          <div className="msg-actions">
                            <button className="msg-action-btn" onClick={() => handleCopyMessage(msg.text)} title="Copiar mensaje">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2"/>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                              </svg>
                            </button>
                            {streamingMsgId !== msg.id && !msg.text.startsWith('Error') && (
                              <button className="msg-action-btn" onClick={() => handleRegenerate(msg.id)} title="Regenerar respuesta" disabled={isSending}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
                                </svg>
                              </button>
                            )}
                            {msg.text.startsWith('Error') && (
                              <button className="msg-action-btn msg-action-btn--retry" onClick={() => handleRetry(msg.id)} title="Reintentar" disabled={isSending}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                                </svg>
                              </button>
                            )}
                          </div>
                          {streamingMsgId !== msg.id && msgWordCount > 10 && (
                            <span className="msg-word-count">~{msgWordCount} pal.</span>
                          )}
                          {msg.meta?.fileEdit && (
                            <div className="file-edit-diff">
                              <h4>Diff propuesto</h4>
                              <DiffView diff={msg.meta.fileEdit.diff} />
                              {msg.meta.fileEdit.needsConfirmation && (
                                <div className="file-edit-actions">
                                  <button onClick={() => setInput(`aplicar ${msg.meta?.fileEdit?.path}`)}>Preparar aplicar</button>
                                  <button onClick={() => setInput('descartar')}>Descartar</button>
                                  <button onClick={() => setInput(`backups ${msg.meta?.fileEdit?.path}`)}>Ver backups</button>
                                </div>
                              )}
                            </div>
                          )}
                          {msg.meta?.fileAnalysisDisambiguation?.candidates && (
                            <div className="file-disambiguation enhanced">
                              <div className="file-disambiguation__header">
                                <h4>
                                  {msg.meta.fileAnalysisDisambiguation.action === 'optimize'
                                    ? 'Selecciona cuál archivo quieres optimizar'
                                    : 'Selecciona cuál archivo quieres analizar'}
                                </h4>
                                <p className="hint">
                                  Se encontraron {msg.meta.fileAnalysisDisambiguation.candidates.length} rutas con el mismo nombre.
                                  Haz clic para {msg.meta.fileAnalysisDisambiguation.action === 'optimize' ? 'optimizar' : 'cargar el contenido'}.
                                </p>
                              </div>
                              <ul className="file-disambiguation__list" role="list">
                                {msg.meta.fileAnalysisDisambiguation.candidates.map((c: string, idx: number) => (
                                  <li key={c} className="file-disambiguation__item">
                                    <button
                                      type="button"
                                      className="file-disambiguation__btn"
                                      onClick={() => handleAnalyzeCandidate(msg.meta.fileAnalysisDisambiguation.base, c, msg.meta.fileAnalysisDisambiguation.action || 'analyze', idx)}
                                      disabled={isSending}
                                      aria-label={`${msg.meta.fileAnalysisDisambiguation.action === 'optimize' ? 'Optimizar' : 'Analizar'} opción ${idx + 1}: ${c}`}
                                    >
                                      <span className="file-disambiguation__index">{idx + 1}</span>
                                      <span className="file-disambiguation__path">{c}</span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      ) : (
                        msg.text
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          );
        })}

        {/* Typing indicator */}
        {isSending && (
          <div className="typing-indicator message-animate">
            <div className="typing-indicator__left">
              {!streamingMsgId ? (
                <><div className="typing-dot"/><div className="typing-dot"/><div className="typing-dot"/></>
              ) : (
                <span className="typing-streaming-dot"/>
              )}
              <span className="typing-label">{streamingMsgId ? 'Generando…' : 'Pensando…'}</span>
            </div>
            <button className="typing-cancel-btn" onClick={handleCancel} title="Cancelar (Esc)">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <rect x="4" y="4" width="16" height="16" rx="2"/>
              </svg>
              Detener
            </button>
          </div>
        )}

        {showScrollToBottom && (
          <button className="scroll-to-bottom" aria-label="Bajar al último mensaje" title="Bajar"
            onClick={() => { const el = messagesRef.current; if (!el) return; el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); setShowScrollToBottom(false); }}>
            ↓
          </button>
        )}
      </div>

      {/* Toast */}
      {toast && <div className="chat-toast">{toast}</div>}

      {/* Terminal banners */}
      <TerminalBanners
        errorBanner={errorBanner}
        onDismissError={() => setErrorBanner(null)}
        onAnalyze={handleAnalyzeFromBanner}
        terminalActivity={terminalActivity}
        onDismissActivity={() => setTerminalActivity(false)}
      />

      {/* Input */}
      <ChatInput
        input={input}
        setInput={setInput}
        mode={mode}
        isSending={isSending}
        onSend={handleSend}
        onCancel={handleCancel}
        canSend={modeHandlers[mode]?.canSend() ?? false}
        attachedImage={attachedImage}
        setAttachedImage={setAttachedImage}
        attachedFile={attachedFile}
        setAttachedFile={setAttachedFile}
        inputRef={inputRef}
        isComposingRef={isComposingRef}
        messages={messages}
        sessionTokens={sessionTokens}
        setSessionTokens={setSessionTokens}
        sessionId={sessionId}
        ctxUsagePct={ctxUsagePct}
        setToast={setToast}
        showTokenPopover={showTokenPopover}
        setShowTokenPopover={setShowTokenPopover}
      />

      {/* History panel */}
      <ChatHistoryPanel
        showHistory={showHistory}
        setShowHistory={setShowHistory}
        historySearch={historySearch}
        setHistorySearch={setHistorySearch}
        historyEntries={historyEntries}
        pendingDeleteId={pendingDeleteId}
        hostKey={hostKey}
        handleLoadHistory={handleLoadHistory}
        handleDeleteHistoryEntry={handleDeleteHistoryEntry}
        confirmDeleteHistoryEntry={confirmDeleteHistoryEntry}
        cancelDeleteHistoryEntry={cancelDeleteHistoryEntry}
      />

      {/* Modals */}
      <ChatModals
        showModeConfirm={showModeConfirm}
        confirmModeSwitch={confirmModeSwitch}
        cancelModeSwitch={cancelModeSwitch}
        showShortcuts={showShortcuts}
        setShowShortcuts={setShowShortcuts}
      />
    </div>
  );
};

export default ChatPane;
