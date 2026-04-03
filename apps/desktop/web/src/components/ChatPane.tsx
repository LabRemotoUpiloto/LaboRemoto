// Panel de chat: integra modo ASK (explicar) y AGENT (sugerir/confirmar comandos).
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import './ChatPane.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useSessionMemory } from '../hooks/useSessionMemory';

// Modo modularizado
import { ChatMode, Message, AgentState, AiResponseRaw, ModeHandlerContext, ModelSelection, AVAILABLE_MODELS } from './chatModes/types';
// Handlers ahora como clases (instancias)
import { AskModeHandler } from './chatModes/classes/AskModeHandler';
import { AgenteModeHandler } from './chatModes/classes/AgenteModeHandler';
import { PlanModeHandler } from './chatModes/classes/PlanModeHandler';
// Componentes extraídos
import AskRenderer from './chat/AskRenderer';
import AgentStepsRenderer from './chat/AgentStepsRenderer';
import ToolResultRenderer from './chat/ToolResultRenderer';
import DiffView from './analysis/DiffView';
import './analysis/DiffView.css';
import './analysis/FileDisambiguation.css';
// Utilidades
import { cleanText, isNearBottom } from './chat/chatUtils';

// ── Helpers ──
const CHAT_STORAGE_KEY = (sid: string | null, mode: ChatMode) => `chat-history:${sid ?? 'default'}:${mode}`;
const TOKEN_STORAGE_KEY = (sid: string | null) => `chat-tokens:${sid ?? 'default'}`;
interface HistoryEntry {
  id: string;
  date: number;
  preview: string;
  messageCount: number;
  messages: { id: string; sender: string; text: string; timestamp?: number }[];
}
const MAX_CHAR_WARN = 4000;

const fmtTime = (ts?: number) => {
  if (!ts) return '';
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return 'ahora';
  if (diff < 3600_000) return `hace ${Math.floor(diff / 60_000)}m`;
  if (diff < 86400_000) return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

// ── SVG icons por modo ──
const ModeIcons: Record<string, React.ReactNode> = {
  ask: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  agente: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5"/>
      <line x1="12" y1="19" x2="20" y2="19"/>
    </svg>
  ),
  plan: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  ),
};

// ── Model dropdown custom ──
const ModelSelect: React.FC<{ value: ModelSelection; onChange: (m: ModelSelection) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = AVAILABLE_MODELS.find(m => m.value === value) ?? AVAILABLE_MODELS[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          height: 26, padding: '0 22px 0 10px', borderRadius: 5,
          border: '1px solid rgba(255,255,255,0.10)',
          background: 'rgba(255,255,255,0.05)',
          color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          backgroundImage: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 20 20" fill="none"><path d="M5 8l5 5 5-5" stroke="%23ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>')`,
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 5px center',
          width: '100%', whiteSpace: 'nowrap', overflow: 'hidden',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{current.label}</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 3, zIndex: 999,
          background: '#1e2130', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 7, overflow: 'hidden', minWidth: '100%',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          {AVAILABLE_MODELS.map(m => (
            <button
              key={m.value}
              onClick={() => { onChange(m.value); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '7px 12px', border: 'none',
                background: m.value === value ? 'rgba(255,255,255,0.07)' : 'transparent',
                color: m.value === value ? '#fff' : 'rgba(255,255,255,0.7)',
                fontSize: 12.5, cursor: 'pointer', textAlign: 'left',
                transition: 'background 0.1s', whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.09)')}
              onMouseLeave={e => (e.currentTarget.style.background = m.value === value ? 'rgba(255,255,255,0.07)' : 'transparent')}
            >
              <span style={{ flex: 1 }}>{m.label}</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{m.provider}</span>
              {m.value === value && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#60a5fa', flexShrink: 0, marginLeft: 4 }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Dropdown custom (evita el fondo blanco del OS nativo en Windows) ──
const MODES: { value: ChatMode; label: string; color: string }[] = [
  { value: 'ask',    label: 'Consulta', color: '#4ade80' },
  { value: 'agente', label: 'Agente',   color: '#60a5fa' },
  { value: 'plan',   label: 'Plan',     color: '#f59e0b' },
];

// ── Placeholders contextuales por modo ──
const MODE_PLACEHOLDERS: Record<ChatMode, string> = {
  ask: 'Pregunta lo que quieras sobre tu servidor…',
  agente: 'Describe qué quieres que ejecute o investigue…',
  plan: 'Describe el objetivo para generar un plan…',
};

// ── Sugerencias rápidas por modo (welcome state) ──
const MODE_SUGGESTIONS: Record<ChatMode, { text: string; icon: React.ReactNode }[]> = {
  ask: [
    { text: '¿Cómo reinicio un servicio?', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
    { text: '¿Qué es SSH y cómo funciona?', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> },
    { text: 'Explica el comando top', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg> },
    { text: '¿Diferencia entre apt y snap?', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg> },
  ],
  agente: [
    { text: 'Ver cuánto espacio queda en disco', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg> },
    { text: 'Listar servicios activos', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg> },
    { text: 'Ver los últimos errores del sistema', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
    { text: 'Probar la conexión a internet', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg> },
  ],
  plan: [
    { text: 'Instalar y configurar Nginx', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg> },
    { text: 'Mejorar la seguridad del servidor', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
    { text: 'Instalar Docker paso a paso', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg> },
    { text: 'Monitorear el rendimiento del servidor', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
  ],
};

const MODE_DESCRIPTIONS: Record<ChatMode, string> = {
  ask:    'Explica, responde preguntas y genera código sin ejecutar nada',
  agente: 'Ejecuta comandos reales en el servidor y analiza el output',
  plan:   'Genera un plan estructurado por fases antes de ejecutar',
};

const MODEL_CONTEXT_WINDOW: Record<string, number> = {
  'claude-sonnet-4-6': 200_000,
  'gpt-3.5-turbo': 16_384,
};

const ModeSelect: React.FC<{ value: ChatMode; onChange: (m: ChatMode) => void; sessionId?: string | null }> = ({ value, onChange, sessionId }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = MODES.find(m => m.value === value) ?? MODES[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          height: 26, padding: '0 22px 0 8px', borderRadius: 5,
          border: '1px solid rgba(255,255,255,0.10)',
          background: 'rgba(255,255,255,0.05)',
          color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          backgroundImage: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 20 20" fill="none"><path d="M5 8l5 5 5-5" stroke="%23ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>')`,
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 5px center',
          minWidth: 110, whiteSpace: 'nowrap',
        }}
      >
        <span style={{ color: current.color, display: 'flex', alignItems: 'center' }}>
          {ModeIcons[current.value]}
        </span>
        <span>{current.label}</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 3, zIndex: 999,
          background: '#1e2130', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 7, overflow: 'hidden', minWidth: 148,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          {MODES.map(m => {
            const locked = !sessionId && (m.value === 'agente' || m.value === 'plan');
            return (
              <button
                key={m.value}
                onClick={() => { onChange(m.value); setOpen(false); }}
                title={locked ? 'Requiere sesión SSH activa' : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  width: '100%', padding: '7px 12px', border: 'none',
                  background: m.value === value ? 'rgba(255,255,255,0.07)' : 'transparent',
                  color: m.value === value ? '#fff' : 'rgba(255,255,255,0.7)',
                  fontSize: 12.5, cursor: 'pointer', textAlign: 'left',
                  transition: 'background 0.1s',
                  opacity: locked ? 0.45 : 1,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.09)')}
                onMouseLeave={e => (e.currentTarget.style.background = m.value === value ? 'rgba(255,255,255,0.07)' : 'transparent')}
              >
                <span style={{ color: m.color, display: 'flex', alignItems: 'center' }}>
                  {ModeIcons[m.value]}
                </span>
                <span style={{ flex: 1 }}>{m.label}</span>
                {locked && (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, flexShrink: 0 }}>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                )}
                {m.value === value && !locked && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Modos del chat:
// ask       -> consulta general explicativa
// busqueda  -> (antes 'agent') invoca plan de acciones (search, open, grep)
// pines     -> vista sólo de mensajes fijados (no envía prompts)
// analisis  -> análisis / edición de archivos (placeholder de momento; usa backend ai_chat con modo ANALISIS)
// Ajustar tipo meta para incluir toolAction conservando compatibilidad
// (extensión ligera sobre Message definido en types.ts)
// Re-aplicar ToolActionResult en runtime sin redefinir estructura base.

type Props = {
  sessionId?: string | null;
  onClose?: () => void;
};

const ChatPane: React.FC<Props> = ({ sessionId = null, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<ChatMode>('ask');
  const [selectedModel, setSelectedModel] = useState<ModelSelection>(() => {
    const saved = localStorage.getItem('chatSelectedModel');
    return (saved as ModelSelection) || 'claude-sonnet-4-5';
  });
  const [agentState, setAgentState] = useState<AgentState>({
    cwd: '/',
    lastExitCode: undefined,
    lastStdoutTail: undefined,
    lastFile: undefined,
  });
  const [isSending, setIsSending] = useState(false);
  const isSendingRef = useRef(false);
  const [errorBanner, setErrorBanner] = useState<{ snippet: string } | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [attachedImage, setAttachedImage] = useState<{ base64: string; mediaType: string; preview: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  // Clave estable para historial: "user@host" (reconectar al mismo host reutiliza el historial)
  const [hostKey, setHostKey] = useState<string>(sessionId ?? 'default');

  // Resolver user@host tan pronto tengamos sessionId
  useEffect(() => {
    if (!sessionId) { setHostKey('default'); return; }
    invoke<{ host: string; port: number; user: string }>('ssh_session_info', { id: sessionId })
      .then(info => setHostKey(`${info.user}@${info.host}`))
      .catch(() => setHostKey(sessionId));
  }, [sessionId]);

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

  // Escuchar eventos de actividad de terminal — debounce 1.5s + detección de errores
  useEffect(() => {
    if (!sessionId) return;
    const unlisten = listen<{ session_id: string }>('terminal:activity', (ev) => {
      if (ev.payload.session_id !== sessionId) return;
      if (terminalDebounceRef.current) clearTimeout(terminalDebounceRef.current);
      terminalDebounceRef.current = setTimeout(async () => {
        setTerminalActivity(true);
        try {
          const ctx = await invoke<string>('get_terminal_context', { sessionId, lines: 20 });
          const lines = ctx.split('\n');
          for (const line of lines.slice(-20)) {
            const clean = line.replace(/\x1b\[[\d;]*[mGKHF]/g, '').trim();
            if (ERROR_PATTERNS.some(p => p.test(clean))) {
              setErrorBanner({ snippet: clean.slice(0, 100) });
              break;
            }
          }
        } catch { /* sin sesión activa */ }
      }, 1500);
    });
    return () => { unlisten.then(fn => fn()); };
  }, [sessionId]);

  // Log silencioso de tokens en DevTools (no afecta UI)
  useEffect(() => {
    const unlisten = listen<{ request_id: string; input_tokens: number; output_tokens: number; model: string }>('ai:usage', (ev) => {
      const { model, input_tokens, output_tokens } = ev.payload;
      const total = input_tokens + output_tokens;
      console.log(
        '%c[AI tokens]%c modelo=%s  entrada=%d  salida=%d  total=%d',
        'color:#a78bfa;font-weight:bold',
        'color:#94a3b8',
        model, input_tokens, output_tokens, total
      );
      setSessionTokens(prev => {
        const next = {
          input: prev.input + input_tokens,
          output: prev.output + output_tokens,
        };
        try { localStorage.setItem(TOKEN_STORAGE_KEY(sessionId ?? null), JSON.stringify(next)); } catch {}
        return next;
      });
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  // Nueva memoria sincronizada con Rust (fuente de verdad) + cache UI
  const { mem, setLastCommand, clear } = useSessionMemory(sessionId ?? null);

  // Referencia para el contenedor de mensajes (auto-scroll inteligente)
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const isComposingRef = useRef<boolean>(false);
  // Ref estable para handleSend — permite llamarlo desde callbacks sin deps stale
  const handleSendRef = useRef<((overrideText?: string) => void)>(() => {});
  const loadedHistoryIdRef = useRef<string | null>(null);
  const messageCountAtLoadRef = useRef<number>(0);

  // isNearBottom extraído a util (importado)

  // Auto-scroll inteligente: solo si el usuario ya está cerca del final o acaba de enviar
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    const last = messages[messages.length - 1];
    if (last?.sender === 'user' || isNearBottom(el)) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      setShowScrollToBottom(false);
    }
  }, [messages]);

  // Seguir el streaming: scroll a medida que llegan chunks
  // Si hay streaming activo, siempre seguimos (el usuario puede hacer scroll arriba para parar)
  useEffect(() => {
    if (!streamedText || !streamingMsgId) return;
    const el = messagesRef.current;
    if (!el) return;
    // Siempre seguir durante streaming — el scroll manual del usuario activará el botón ↓
    el.scrollTop = el.scrollHeight;
  }, [streamedText]);

  // Escuchar eventos de feedback del renderer de resultados (doble click)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || !detail.text) return;
      setMessages(prev => [...prev, { id: String(Date.now()), sender: 'system', text: detail.text }]);
    };
    document.addEventListener('chat:system-msg', handler as any);
    return () => document.removeEventListener('chat:system-msg', handler as any);
  }, []);

  // Persistir selección de modelo en localStorage
  useEffect(() => {
    localStorage.setItem('chatSelectedModel', selectedModel);
  }, [selectedModel]);

  // ── Persistencia de historial en localStorage ──
  useEffect(() => {
    if (messages.length === 0) return;
    try {
      const key = CHAT_STORAGE_KEY(sessionId ?? null, mode);
      // Solo persiste campos esenciales — meta puede contener objetos enormes
      const toSave = messages.slice(-100).map(m => ({
        id: m.id,
        sender: m.sender,
        text: m.text,
        timestamp: m.timestamp,
      }));
      localStorage.setItem(key, JSON.stringify(toSave));
    } catch { /* storage full */ }
  }, [messages, sessionId, mode]);

  // Restaurar historial al montar o al cambiar modo/sesión
  useEffect(() => {
    try {
      const key = CHAT_STORAGE_KEY(sessionId ?? null, mode);
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved) as Message[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch { /* corrupted */ }
  }, [sessionId]);

  // Auto-resize vertical del textarea hasta 5 líneas (sin crecer a lo ancho)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const style = window.getComputedStyle(el);
    // Si se define una altura fija vía CSS var, respétala y omite el auto-resize
    const fixedH = (style.getPropertyValue('--chat-input-fixed-height') || '').trim();
    if (fixedH) {
      el.style.height = fixedH;
      el.style.overflowY = 'hidden';
      return;
    }
    el.style.height = 'auto';
    // Soporta override por variables CSS definidas en .chat-pane
    const lineHeightVar = style.getPropertyValue('--chat-input-line-height');
    const paddingYVar = style.getPropertyValue('--chat-input-padding-y');
    const lineHeight = parseFloat(lineHeightVar || style.lineHeight) || 20;
    const paddingTop = parseFloat(paddingYVar || style.paddingTop) || 0;
    const paddingBottom = parseFloat(paddingYVar || style.paddingBottom) || 0;
    const maxLines = 5;
    const maxPx = Math.round(paddingTop + paddingBottom + lineHeight * maxLines);
    const newH = Math.min(el.scrollHeight, maxPx);
    el.style.height = newH + 'px';
    el.style.overflowY = el.scrollHeight > maxPx ? 'auto' : 'hidden';
  }, [input]);

  const archiveCurrentChat = async (excludeEntryId?: string): Promise<boolean> => {
    if (!messages.some(m => m.sender === 'user')) return false;
    const userMsgs = messages.filter(m => m.sender !== 'system');
    // If loaded from history and no new messages were added, skip — it's already saved
    if (loadedHistoryIdRef.current && userMsgs.length <= messageCountAtLoadRef.current) {
      return false;
    }
    // Exclude both the passed ID and the previously-loaded entry to avoid duplicates
    const excludeIds = new Set<string>([
      ...(excludeEntryId ? [excludeEntryId] : []),
      ...(loadedHistoryIdRef.current ? [loadedHistoryIdRef.current] : []),
    ]);
    try {
      const existing = await invoke<HistoryEntry[]>('chat_history_load', { sessionId: hostKey, mode });
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        date: Date.now(),
        preview: messages.find(m => m.sender === 'user')?.text?.slice(0, 100) ?? '',
        messageCount: userMsgs.length,
        messages: userMsgs.slice(-50).map(m => ({ id: m.id, sender: m.sender, text: m.text, timestamp: m.timestamp })),
      };
      const merged = [entry, ...existing.filter(e => !excludeIds.has(e.id))];
      const seenIds = new Set<string>();
      const updated = merged.filter(e => { if (seenIds.has(e.id)) return false; seenIds.add(e.id); return true; }).slice(0, 20);
      await invoke('chat_history_save', { sessionId: hostKey, mode, entries: updated });
      return true;
    } catch { return false; }
  };

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
    if (saved) {
      setToast('Chat guardado en historial');
      setTimeout(() => setToast(null), 2500);
    }
  };

  const handleLoadHistory = async (entry: HistoryEntry) => {
    await archiveCurrentChat(entry.id);
    loadedHistoryIdRef.current = entry.id;
    messageCountAtLoadRef.current = (entry.messages as Message[]).filter(m => m.sender !== 'system').length;
    setMessages(entry.messages as Message[]);
    setShowHistory(false);
  };

  const handleDeleteHistoryEntry = (id: string, ev: React.MouseEvent) => {
    ev.stopPropagation();
    setPendingDeleteId(id);
  };

  const confirmDeleteHistoryEntry = async (id: string, ev: React.MouseEvent) => {
    ev.stopPropagation();
    try {
      const updated = await invoke<HistoryEntry[]>('chat_history_delete_entry', {
        sessionId: hostKey, mode, entryId: id,
      });
      setHistoryEntries(updated);
    } catch { /* silencioso */ } finally {
      setPendingDeleteId(null);
    }
  };

  const cancelDeleteHistoryEntry = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    setPendingDeleteId(null);
  };

  // ── Cancelar respuesta en curso ──
  const handleCancel = useCallback(() => {
    // Cancelar la petición HTTP en el backend Rust
    if (currentReqIdRef.current) {
      invoke('cancel_ai_chat', { requestId: currentReqIdRef.current }).catch(() => {});
      currentReqIdRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    isSendingRef.current = false;
    setIsSending(false);
    setMessages(prev => [...prev, { id: String(Date.now()), sender: 'system', text: 'Respuesta cancelada por el usuario.' }]);
  }, []);

  // ── Reintentar último mensaje ──
  const handleRetry = useCallback((msgId: string) => {
    const idx = messages.findIndex(m => m.id === msgId);
    if (idx < 1) return;
    // Find the user message right before this error
    let userMsg: Message | null = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].sender === 'user') { userMsg = messages[i]; break; }
    }
    if (!userMsg) return;
    // Remove the error message
    setMessages(prev => prev.filter(m => m.id !== msgId));
    // Re-send
    const handler = modeHandlers[mode];
    if (!handler?.canSend()) return;
    setIsSending(true);
    isSendingRef.current = true;
    handler.send(userMsg.text, userMsg, buildModeContext()).catch((e: any) => {
      setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `Error: ${String(e)}` }]);
    }).finally(() => {
      isSendingRef.current = false;
      setIsSending(false);
    });
  }, [messages, mode]);

  // ── Regenerar respuesta AI ──
  const handleRegenerate = useCallback((msgId: string) => {
    if (isSending) return;
    const idx = messages.findIndex(m => m.id === msgId);
    if (idx < 1) return;
    let userMsg: Message | null = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].sender === 'user') { userMsg = messages[i]; break; }
    }
    if (!userMsg) return;
    setMessages(prev => prev.filter((_m, i) => i < idx));
    const handler = modeHandlers[mode];
    if (!handler?.canSend()) return;
    setIsSending(true);
    isSendingRef.current = true;
    handler.send(userMsg.text, userMsg, buildModeContext()).catch((e: any) => {
      setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `Error: ${String(e)}` }]);
    }).finally(() => {
      isSendingRef.current = false;
      setIsSending(false);
    });
  }, [messages, mode]);

  // ── Copiar mensaje completo ──
  const handleCopyMessage = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast('Copiado al portapapeles');
      setTimeout(() => setToast(null), 2000);
    } catch { /* clipboard not available */ }
  }, []);

  // ── Cambio de modo con confirmación ──
  const handleModeSwitch = useCallback((newMode: ChatMode) => {
    if (newMode === mode) return;
    if (!sessionId && (newMode === 'agente' || newMode === 'plan')) {
      setToast('Requiere una sesión SSH activa');
      setTimeout(() => setToast(null), 2000);
      return;
    }
    if (messages.some(m => m.sender === 'user')) {
      setShowModeConfirm(newMode);
    } else {
      setMode(newMode);
      clear();
    }
  }, [mode, messages, sessionId]);

  const confirmModeSwitch = useCallback(() => {
    if (!showModeConfirm) return;
    setMode(showModeConfirm);
    setMessages([]);
    clear();
    setShowModeConfirm(null);
  }, [showModeConfirm]);

  // ── Sugerencia rápida click ──
  const handleSuggestionClick = useCallback((text: string) => {
    handleSendRef.current?.(text);
  }, []);

  // ── Contador de palabras ──
  const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

  // ── Exportar chat como Markdown ──
  const handleExportMd = useCallback(async () => {
    if (messages.length === 0) return;
    const lines: string[] = [`# Chat SSH — ${new Date().toLocaleString('es')}\n`];
    for (const m of messages) {
      if (m.sender === 'user') lines.push(`**Tú:**\n\n${m.text}`);
      else if (m.sender === 'ai') lines.push(`**Asistente:**\n\n${m.text}`);
    }
    const content = lines.join('\n\n---\n\n');
    const defaultName = `chat-ssh-${new Date().toISOString().slice(0,10)}.md`;
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

  // ── Atajos de teclado globales: ? → shortcuts, Ctrl+F → buscar ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (document.activeElement === inputRef.current) return;
      if (e.key === '?' && e.shiftKey) { e.preventDefault(); setShowShortcuts(s => !s); }
      if (e.key === 'Escape') setShowShortcuts(false);
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => (document.querySelector('.chat-search-input') as HTMLInputElement | null)?.focus(), 50);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);


  // cleanText ahora importado desde util

  

  // Handler de envío (usa handlers modularizados)
  const handleSend = async (overrideText?: string) => {
    if (isSending || isSendingRef.current) return;
    const trimmed = (overrideText ?? input).trim();
    if (!trimmed) return;
    const handler = modeHandlers[mode];
    if (!handler) return;
    if (!handler.canSend()) {
      setMessages(prev => [...prev, { id: String(Date.now()), sender: 'system', text: 'Modo actual no permite enviar mensajes.' }]);
      setInput('');
      return;
    }
    isSendingRef.current = true;
    setErrorBanner(null);
    const finalInput = trimmed;
    const userMsg: Message = { id: String(Date.now()), sender: 'user', text: trimmed, timestamp: Date.now(), meta: attachedImage ? { imagePreview: attachedImage.preview } as any : undefined };
    setMessages(prev => [...prev, userMsg]);
    if (!overrideText) setInput('');
    try {
      setIsSending(true);
      await handler.send(finalInput, userMsg, buildModeContext());
    } catch (e: any) {
      setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `Error: ${String(e)}` }]);
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
    }
  };
  handleSendRef.current = handleSend;

  // Search: show all messages, highlight + navigate matches
  const displayedMessages = messages;
  const searchMatchIds = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return messages
      .filter(m => m.text.toLowerCase().includes(q))
      .map(m => m.id);
  }, [messages, searchQuery]);

  // Reset match index when query changes
  useEffect(() => { setSearchMatchIndex(0); }, [searchQuery]);

  // Scroll to current match
  useEffect(() => {
    if (searchMatchIds.length === 0) return;
    const id = searchMatchIds[searchMatchIndex];
    const el = document.getElementById(`msg-${id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [searchMatchIndex, searchMatchIds]);

  // Cargar entradas del historial desde disco cuando el panel se abre
  useEffect(() => {
    if (!showHistory) return;
    invoke<HistoryEntry[]>('chat_history_load', { sessionId: hostKey, mode })
      .then(entries => {
        // Deduplicate by id, keeping the most recent entry per id
        const seen = new Set<string>();
        const unique = entries.filter(e => {
          if (seen.has(e.id)) return false;
          seen.add(e.id);
          return true;
        });
        setHistoryEntries(unique);
      })
      .catch(() => setHistoryEntries([]));
  }, [showHistory, hostKey, mode]);

  // ── Estimación de uso de context window ──
  const maxCtxTokens = MODEL_CONTEXT_WINDOW[selectedModel] ?? 200_000;
  const estimatedCtxTokens = Math.round(
    messages.filter(m => m.sender !== 'system').reduce((sum, m) => sum + m.text.length / 4, 0)
  );
  const ctxUsagePct = Math.min(100, (estimatedCtxTokens / maxCtxTokens) * 100);

  // Mode handlers — memoizados: una sola instancia por montaje del componente
  const modeHandlers = useMemo<Record<ChatMode, any>>(() => ({
    ask: new AskModeHandler(),
    agente: new AgenteModeHandler(),
    plan: new PlanModeHandler(),
  }), []);

  // ── Funciones invocadas por handlers ──

  const invokeAsk = async ({ finalInput, mode, userMsg }: { finalInput: string; mode: ChatMode; userMsg: Message }) => {
    const history = [...messages, userMsg]
      .filter(m => m.sender !== 'system')
      .map(m => ({ role: m.sender === 'ai' ? 'assistant' : 'user', content: m.text }));
    const mappedMode = mode;
    const imgSnap = attachedImage;
    setAttachedImage(null);
    setTerminalActivity(false);
    const reqId = crypto.randomUUID();
    currentReqIdRef.current = reqId;

    // Añadir mensaje placeholder y activar streaming real
    const streamId = reqId;
    setStreamingMsgId(streamId);
    setStreamedText('');
    setMessages(prev => [...prev, {
      id: streamId,
      sender: 'ai' as const,
      text: '',
      timestamp: Date.now(),
      meta: { chat_mode: mode },
    }]);

    // Escuchar chunks SSE emitidos por el backend Rust
    const unlistenChunk = await listen<{ request_id: string; delta: string }>('ai:chunk', (ev) => {
      if (ev.payload.request_id !== reqId) return;
      setStreamedText(prev => prev + ev.payload.delta);
    });

    let res: AiResponseRaw;
    try {
      res = await invoke<AiResponseRaw>('ai_chat', {
        req: {
          user_input: finalInput,
          mode: mappedMode,
          history,
          state: agentState,
          model_selection: selectedModel,
          image_base64: imgSnap?.base64 ?? null,
          image_media_type: imgSnap?.mediaType ?? null,
          terminal_context: null,
          request_id: reqId,
        }
      });
    } catch (e) {
      unlistenChunk();
      setStreamedText('');
      setStreamingMsgId(null);
      setMessages(prev => prev.filter(m => m.id !== streamId));
      const errStr = String(e);
      if (errStr === 'cancelled' || errStr.toLowerCase().includes('cancelled')) return;
      throw e;
    }

    unlistenChunk();
    currentReqIdRef.current = null;

    // Si el usuario canceló mientras esperábamos la respuesta, descartar
    if (!isSendingRef.current) {
      setStreamedText('');
      setStreamingMsgId(null);
      return;
    }

    // Aplicar post-procesamiento y actualizar mensaje placeholder con texto final
    const aiText = String((res as any).ai_response || (res as any).explanation || '');
    const displayText = cleanText(aiText);
    const cleanedMeta: any = { chat_mode: mode, ...(res as any) };
    delete cleanedMeta.code_output;
    delete cleanedMeta.suggestedCommands;

    setMessages(prev => prev.map(m => m.id === streamId
      ? { ...m, text: displayText, meta: cleanedMeta }
      : m
    ));
    setStreamedText('');
    setStreamingMsgId(null);
  };

  const buildModeContext = (): ModeHandlerContext => ({
    sessionId,
    agentState,
    setAgentState: s => setAgentState({ ...s }),
    messages,
    setMessages,
    setIsSending,
    cleanText,
    invokeAsk,
  });

  const handleAnalyzeCandidate = async (base: string, candidate: string, action: string = 'analyze', index?: number) => {
    if (isSending) return;
    setIsSending(true);
    try {
      // Para optimización, usar el índice en lugar de la ruta completa para evitar os error 3
      const command = action === 'optimize' && index !== undefined ? `mejora ${index + 1}` : 
                      action === 'optimize' ? `mejora ${candidate}` : `analizame ${candidate}`;
      const userMsg: Message = { id: String(Date.now()), sender: 'user', text: command };
      setMessages(prev => [...prev, userMsg]);
      const handler = modeHandlers['ask'];
      await handler.send(command, userMsg, buildModeContext());
    } catch (e) {
      const actionText = action === 'optimize' ? 'optimizando' : 'analizando';
      setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `Error ${actionText} ${candidate}: ${String(e)}` }]);
    } finally { setIsSending(false); }
  };

  return (
    <div className="chat-pane">
    <div className="chat-header">
      <div className="chat-titlebar">
        <div className="chat-tb-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="var(--accent-primary)" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 17 10 11 4 5"/>
            <line x1="12" y1="19" x2="20" y2="19"/>
          </svg>
        </div>
        <span className="chat-tb-title">Asistente SSH</span>
        <div className="chat-tb-status" title="Activo"/>
        <div className="chat-tb-actions">
          <button className="chat-tb-btn"
            onClick={() => setShowHistory(o => !o)}
            title="Historial de chats"
            style={{ opacity: showHistory ? 1 : undefined, color: showHistory ? 'var(--accent-primary)' : undefined }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </button>
          <button className="chat-tb-btn"
            onClick={() => { setSearchOpen(o => !o); if (searchOpen) setSearchQuery(''); }}
            title="Buscar en este chat (Ctrl+F)"
            style={{ opacity: searchOpen ? 1 : undefined, color: searchOpen ? 'var(--accent-primary)' : undefined }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
          <button className="chat-tb-btn"
            onClick={handleExportMd}
            title="Exportar chat (.md)"
            disabled={messages.length === 0}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
          <button className="chat-tb-btn is-new"
            onClick={handleNewChat} title="Nuevo chat">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
          <button className="chat-tb-btn is-close"
            onClick={onClose}
            title="Cerrar panel">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="chat-toolbar">
        <ModeSelect value={mode} onChange={handleModeSwitch} sessionId={sessionId} />
        <ModelSelect value={selectedModel} onChange={setSelectedModel} />
      </div>
      <div className="chat-mode-desc">
        <span className="chat-mode-desc__dot" data-mode={mode}/>
        {MODE_DESCRIPTIONS[mode]}
      </div>
    </div>
      {/* ── Barra de búsqueda flotante (estilo Ctrl+F) ── */}
      {searchOpen && (
        <div className="chat-search-bar">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.5 }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            className="chat-search-input"
            placeholder="Buscar en mensajes…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); }
              if (e.key === 'Enter') {
                if (searchMatchIds.length === 0) return;
                setSearchMatchIndex(i => (i + 1) % searchMatchIds.length);
              }
            }}
          />
          {searchQuery && (
            <span className="chat-search-count">
              {searchMatchIds.length === 0
                ? 'Sin resultados'
                : `${searchMatchIndex + 1} / ${searchMatchIds.length}`}
            </span>
          )}
          {searchMatchIds.length > 1 && (
            <>
              <button className="search-nav-btn" title="Anterior (Shift+Enter)" onClick={() => setSearchMatchIndex(i => (i - 1 + searchMatchIds.length) % searchMatchIds.length)}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
              </button>
              <button className="search-nav-btn" title="Siguiente (Enter)" onClick={() => setSearchMatchIndex(i => (i + 1) % searchMatchIds.length)}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
            </>
          )}
          <button className="search-nav-btn search-close-btn" title="Cerrar (Esc)" onClick={() => { setSearchOpen(false); setSearchQuery(''); }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      )}

      <div
        className="chat-messages"
        ref={messagesRef}
        role="log"
        aria-live={isSending ? 'polite' : undefined}
        aria-busy={isSending ? true : undefined}
        onScroll={(e) => {
          const el = e.currentTarget as HTMLDivElement;
          setShowScrollToBottom(!isNearBottom(el));
        }}
      >
        {/* ── Welcome state cuando no hay mensajes ── */}
        {displayedMessages.length === 0 && !isSending && (
          <div className="chat-welcome">
            <div className="chat-welcome__icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 17 10 11 4 5"/>
                <line x1="12" y1="19" x2="20" y2="19"/>
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
                <button
                  key={i}
                  className="chat-suggestion-chip"
                  onClick={() => handleSuggestionClick(s.text)}
                >
                  <span className="chip-icon">{s.icon}</span>
                  <span className="chip-text">{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {displayedMessages.map((msg, _i) => {
          const isSearchMatch = searchMatchIds.includes(msg.id);
          const isActiveMatch = searchMatchIds[searchMatchIndex] === msg.id;
          return (
          <div
            key={msg.id}
            id={`msg-${msg.id}`}
            className={`message message-animate ${msg.sender} ${msg.sender === 'user' ? 'message--user' : 'message--assistant'} ${mode}${isActiveMatch ? ' search-active-match' : isSearchMatch ? ' search-match' : ''}`}
          >
            {/* Ocultar el texto superior para los mensajes de sistema con tarjeta de confirmación */}
            {!(msg.sender === 'system' && msg.meta?.pendingCommand && !msg.meta?.processed) && (
              <div className={`message-text message-card${streamingMsgId === msg.id ? ' is-streaming' : ''}`}>
                {/* Timestamp */}
                {msg.timestamp && (
                  <span className="msg-timestamp" title={new Date(msg.timestamp).toLocaleString('es')}>{fmtTime(msg.timestamp)}</span>
                )}
                <div className="message-content">

                  {msg.sender === 'ai' ? (
                    <>
                      {/* Remote badge */}
                      {/* Pasos de tools del agente (tool_use loop) */}
                      {msg.meta?.toolSteps && msg.meta.toolSteps.length > 0 && (
                        <AgentStepsRenderer steps={msg.meta.toolSteps} />
                      )}
                      {/* Si es un mensaje de desambiguación, ocultamos el texto base para no duplicar la UI */}
                      {!msg.meta?.fileAnalysisDisambiguation && (
                        <AskRenderer
                          content={streamingMsgId === msg.id ? streamedText : msg.text}
                          sessionId={sessionId || undefined}
                          setLastCommand={setLastCommand as any}
                          mode={mode}
                        />
                      )}
                      {/* Structured results */}
                      {msg.meta?.toolAction && (
                        <ToolResultRenderer action={msg.meta.toolAction} sessionId={sessionId || undefined} />
                      )}
                      {/* Botones de acción para mensajes AI: copiar + reintentar en error */}
                      <div className="msg-actions">
                        <button
                          className="msg-action-btn"
                          onClick={() => handleCopyMessage(msg.text)}
                          title="Copiar mensaje"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                          </svg>
                        </button>
                        {streamingMsgId !== msg.id && !msg.text.startsWith('Error') && (
                          <button
                            className="msg-action-btn"
                            onClick={() => handleRegenerate(msg.id)}
                            title="Regenerar respuesta"
                            disabled={isSending}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="1 4 1 10 7 10"/>
                              <path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
                            </svg>
                          </button>
                        )}
                        {msg.text.startsWith('Error') && (
                          <button
                            className="msg-action-btn msg-action-btn--retry"
                            onClick={() => handleRetry(msg.id)}
                            title="Reintentar"
                            disabled={isSending}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="23 4 23 10 17 10"/>
                              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                            </svg>
                          </button>
                        )}
                      </div>
                      {/* Word count badge */}
                      {streamingMsgId !== msg.id && countWords(msg.text) > 10 && (
                        <span className="msg-word-count">~{countWords(msg.text)} pal.</span>
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
                      {msg.meta?.fileAnalysisDisambiguation && msg.meta.fileAnalysisDisambiguation.candidates && (
                        <div className="file-disambiguation enhanced">
                          <div className="file-disambiguation__header">
                            <h4>
                              {msg.meta.fileAnalysisDisambiguation.action === 'optimize' 
                                ? 'Selecciona cuál archivo quieres optimizar' 
                                : 'Selecciona cuál archivo quieres analizar'
                              }
                            </h4>
                            <p className="hint">
                              Se encontraron {msg.meta.fileAnalysisDisambiguation.candidates.length} rutas con el mismo nombre. 
                              Haz clic para {msg.meta.fileAnalysisDisambiguation.action === 'optimize' ? 'optimizar' : 'cargar el contenido'}.
                            </p>
                          </div>
                          <ul className="file-disambiguation__list" role="list">
                            {msg.meta.fileAnalysisDisambiguation.candidates.map((c:string, idx:number) => (
                              <li key={c} className="file-disambiguation__item">
                                <button
                                  type="button"
                                  className="file-disambiguation__btn"
                                  onClick={() => handleAnalyzeCandidate(
                                    msg.meta.fileAnalysisDisambiguation.base, 
                                    c, 
                                    msg.meta.fileAnalysisDisambiguation.action || 'analyze',
                                    idx
                                  )}
                                  disabled={isSending}
                                  aria-label={`${msg.meta.fileAnalysisDisambiguation.action === 'optimize' ? 'Optimizar' : 'Analizar'} opción ${idx+1}: ${c}`}
                                >
                                  <span className="file-disambiguation__index">{idx+1}</span>
                                  <span className="file-disambiguation__path">{c}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {msg.meta?.imagePreview && (
                        <img
                          src={msg.meta.imagePreview}
                          alt="adjunto"
                          style={{ display: 'block', maxHeight: 160, maxWidth: '100%', borderRadius: 6, marginBottom: msg.text ? 6 : 0, objectFit: 'contain' }}
                        />
                      )}
                      {msg.text}
                      <div className="msg-actions">
                        <button
                          className="msg-action-btn msg-action-btn--delete"
                          onClick={() => setMessages(prev => prev.filter(m => m.id !== msg.id))}
                          title="Borrar mensaje"
                          disabled={isSending}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ); })}
        {isSending && (
          <div className="typing-indicator message-animate">
            <div className="typing-indicator__left">
              {!streamingMsgId ? (
                <>
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                </>
              ) : (
                <span className="typing-streaming-dot"/>
              )}
              <span className="typing-label">
                {streamingMsgId ? 'Generando…' : 'Pensando…'}
              </span>
            </div>
            <button
              className="typing-cancel-btn"
              onClick={handleCancel}
              title="Cancelar (Esc)"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <rect x="4" y="4" width="16" height="16" rx="2"/>
              </svg>
              Detener
            </button>
          </div>
        )}
        
        {showScrollToBottom && (
          <button
            className="scroll-to-bottom"
            aria-label="Bajar al último mensaje"
            title="Bajar"
            onClick={() => {
              const el = messagesRef.current; if (!el) return;
              el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
              setShowScrollToBottom(false);
            }}
          >
            ↓
          </button>
        )}
        
      </div>

      {/* Toast de notificación — absolute sobre el área de mensajes */}
      {toast && <div className="chat-toast">{toast}</div>}

      {/* Banner de error detectado en terminal */}
      {errorBanner && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 12px',
          background: 'rgba(248,113,113,0.07)',
          borderTop: '1px solid rgba(248,113,113,0.2)',
          fontSize: 11,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span style={{ color: '#f87171', fontWeight: 500, flexShrink: 0 }}>Error detectado</span>
          <span style={{ color: 'rgba(255,255,255,0.35)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 10.5 }}>
            {errorBanner.snippet}
          </span>
          <button
            onClick={() => {
              setMode('agente');
              setErrorBanner(null);
              setTerminalActivity(false);
              setInput('hay un error en la terminal, revísalo y corrígelo');
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
            style={{
              background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)',
              color: '#f87171', borderRadius: 4, padding: '2px 10px', fontSize: 11,
              cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
            }}
          >→ Analizar</button>
          <button onClick={() => setErrorBanner(null)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: 14, padding: 0, flexShrink: 0 }}
          >×</button>
        </div>
      )}

      {/* Indicador pasivo de actividad en terminal — oculto si hay banner de error */}
      {terminalActivity && !errorBanner && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '3px 12px',
          borderTop: '1px solid rgba(96,165,250,0.10)',
          fontSize: 10.5,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#60a5fa', flexShrink: 0, animation: 'pulse 2s infinite' }} />
          <span style={{ color: 'rgba(255,255,255,0.3)', flex: 1 }}>Terminal activa · el Agente puede leer el output si lo necesita</span>
          <button onClick={() => setTerminalActivity(false)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: 12, padding: 0 }}
          >×</button>
        </div>
      )}
      <div className="chat-input">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const mediaType = file.type || 'image/jpeg';
            const reader = new FileReader();
            reader.onload = (ev) => {
              const dataUrl = ev.target?.result as string;
              const base64 = dataUrl.split(',')[1];
              setAttachedImage({ base64, mediaType, preview: dataUrl });
            };
            reader.readAsDataURL(file);
            e.target.value = '';
          }}
        />
        <div className="chat-input-wrap" style={attachedImage ? { flexDirection: 'column', alignItems: 'stretch', gap: 0 } : undefined}>
          {/* Chip de imagen adjunta — integrado dentro del input box */}
          {attachedImage && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px 4px',
            }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <img
                  src={attachedImage.preview}
                  alt="adjunto"
                  style={{
                    width: 48, height: 48, borderRadius: 6,
                    objectFit: 'cover',
                    border: '1px solid rgba(255,255,255,0.10)',
                    display: 'block',
                  }}
                />
                <button
                  onClick={() => setAttachedImage(null)}
                  style={{
                    position: 'absolute', top: -5, right: -5,
                    width: 16, height: 16, borderRadius: '50%',
                    background: 'rgba(30,33,48,0.95)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: 9, lineHeight: 1, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 0,
                  }}
                >✕</button>
              </div>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>
                imagen lista para enviar
              </span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={MODE_PLACEHOLDERS[mode]}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && isSending) {
                e.preventDefault();
                handleCancel();
                return;
              }
              if (e.key === 'ArrowUp' && input === '') {
                e.preventDefault();
                const lastUser = [...messages].reverse().find(m => m.sender === 'user');
                if (lastUser) { setInput(lastUser.text); return; }
              }
              if (e.key === 'Enter' && !e.shiftKey && !isComposingRef.current) {
                e.preventDefault();
                if (!isSending && modeHandlers[mode]?.canSend?.()) handleSend();
              }
            }}
            onCompositionStart={() => { isComposingRef.current = true; }}
            onCompositionEnd={() => { isComposingRef.current = false; }}
            onPaste={(e) => {
              const items = Array.from(e.clipboardData?.items ?? [] as any) as DataTransferItem[];
              const imgItem = items.find(it => it.type.startsWith('image/'));
              if (!imgItem) return;
              e.preventDefault();
              const file = imgItem.getAsFile();
              if (!file) return;
              const mediaType = file.type || 'image/png';
              const reader = new FileReader();
              reader.onload = (ev) => {
                const dataUrl = ev.target?.result as string;
                const base64 = dataUrl.split(',')[1];
                setAttachedImage({ base64, mediaType, preview: dataUrl });
              };
              reader.readAsDataURL(file);
            }}
          />
          <button
            className="chat-input-attach-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Adjuntar imagen"
            style={{ opacity: attachedImage ? 1 : 0.5, color: attachedImage ? 'var(--accent-primary)' : undefined }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </button>
          <button
            className={`send-btn send-icon ${isSending ? 'is-cancel' : ''}`}
            onClick={isSending ? handleCancel : handleSend}
            disabled={!isSending && !modeHandlers[mode].canSend()}
            aria-label={isSending ? 'Cancelar' : 'Enviar'}
          >
            {isSending ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
              </svg>
            ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"/>
              <polyline points="5 12 12 5 19 12"/>
            </svg>
            )}
          </button>
          </div>
        </div>
        {/* ── Contador de caracteres ── */}
        {input.length > 0 && (
          <div className="chat-char-counter" data-warn={input.length > MAX_CHAR_WARN ? true : undefined}>
            {input.length > MAX_CHAR_WARN
              ? `${input.length} / ${MAX_CHAR_WARN} car.`
              : `${input.length} car.`}
          </div>
        )}
        {/* ── Tokens de sesión ── */}
        <div className="session-token-wrap">
          <button
            className={`session-token-badge${sessionTokens.input === 0 ? ' is-empty' : ''}`}
            onClick={() => setShowTokenPopover(v => !v)}
            title="Ver desglose de tokens de la sesión"
          >
            <span className="token-badge-icon">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            </span>
            <span className="token-badge-in">{sessionTokens.input.toLocaleString()}</span>
            <span className="token-badge-sep">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
              </svg>
            </span>
            <span className="token-badge-out">{sessionTokens.output.toLocaleString()}</span>
            <span className="token-badge-sep">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
              </svg>
            </span>
          </button>
          {showTokenPopover && (
            <div className="token-popover">
              <div className="token-popover-row">
                <span className="token-pop-label">Entrada</span>
                <span className="token-pop-val token-badge-in">{sessionTokens.input.toLocaleString()}</span>
                <span className="token-pop-unit">tok</span>
              </div>
              <div className="token-popover-row">
                <span className="token-pop-label">Salida</span>
                <span className="token-pop-val token-badge-out">{sessionTokens.output.toLocaleString()}</span>
                <span className="token-pop-unit">tok</span>
              </div>
              <div className="token-popover-divider"/>
              <div className="token-popover-row">
                <span className="token-pop-label">Total</span>
                <span className="token-pop-val" style={{color:'#e2e8f0'}}>{(sessionTokens.input + sessionTokens.output).toLocaleString()}</span>
                <span className="token-pop-unit">tok</span>
              </div>
              <div className="token-popover-divider"/>
              <div className="token-ctx-wrap">
                <div className="token-popover-row">
                  <span className="token-pop-label">Contexto ~</span>
                  <span className="token-pop-val" style={{fontSize:10.5, color: ctxUsagePct > 90 ? '#f87171' : ctxUsagePct > 70 ? '#f59e0b' : 'rgba(167,139,250,0.6)'}}>{ctxUsagePct.toFixed(0)}%</span>
                </div>
                <div className="token-context-bar">
                  <div className="token-context-bar__fill" style={{width:`${ctxUsagePct}%`}} data-warn={ctxUsagePct > 90 ? 'critical' : ctxUsagePct > 70 ? 'high' : undefined}/>
                </div>
              </div>
              <button className="token-pop-reset" onClick={() => {
                  const zeroed = { input: 0, output: 0 };
                  setSessionTokens(zeroed);
                  try { localStorage.setItem(TOKEN_STORAGE_KEY(sessionId ?? null), JSON.stringify(zeroed)); } catch {}
                  setShowTokenPopover(false);
                }}>
                Reiniciar contador
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Panel de historial de chats ── */}
      {showHistory && (
        <div className="chat-history-overlay" onClick={() => setShowHistory(false)}>
          <div className="chat-history-panel" onClick={e => e.stopPropagation()}>
            <div className="chat-history-header">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span>Historial de chats</span>
                {hostKey !== 'default' && <span className="chat-history-device">{hostKey}</span>}
              </div>
              <button className="shortcuts-close" onClick={() => setShowHistory(false)}>×</button>
            </div>
            {historyEntries.length === 0 ? (
              <div className="chat-history-empty">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                <p>Sin conversaciones guardadas</p>
                <span>Se guardan al hacer “Nuevo chat”</span>
              </div>
            ) : (
              <ul className="chat-history-list">
                {historyEntries.map(entry => (
                  <li key={entry.id} className="chat-history-item" onClick={() => handleLoadHistory(entry)}>
                    <div className="chat-history-item-meta">
                      <span className="chat-history-date">{fmtTime(entry.date)}</span>
                      <span className="chat-history-count">{entry.messageCount} msgs</span>
                    </div>
                    <p className="chat-history-preview">{entry.preview || 'Sin mensajes'}</p>
                    {pendingDeleteId === entry.id ? (
                      <div className="chat-history-confirm" onClick={ev => ev.stopPropagation()}>
                        <span>¿Eliminar?</span>
                        <button className="chat-history-confirm-yes" onClick={ev => confirmDeleteHistoryEntry(entry.id, ev)}>Sí</button>
                        <button className="chat-history-confirm-no" onClick={cancelDeleteHistoryEntry}>No</button>
                      </div>
                    ) : (
                      <button
                        className="chat-history-delete"
                        onClick={(ev) => handleDeleteHistoryEntry(entry.id, ev)}
                        title="Eliminar"
                      >×</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ── Modal de confirmación al cambiar de modo ── */}
      {showModeConfirm && (
        <div className="mode-confirm-overlay" onClick={() => setShowModeConfirm(null)}>
          <div className="mode-confirm-dialog" onClick={e => e.stopPropagation()}>
            <p className="mode-confirm-text">Cambiar a <strong>{MODES.find(m => m.value === showModeConfirm)?.label}</strong> borrará los mensajes actuales.</p>
            <div className="mode-confirm-actions">
              <button className="mode-confirm-btn mode-confirm-btn--cancel" onClick={() => setShowModeConfirm(null)}>Cancelar</button>
              <button className="mode-confirm-btn mode-confirm-btn--confirm" onClick={confirmModeSwitch}>Cambiar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Overlay de atajos de teclado ── */}
      {showShortcuts && (
        <div className="shortcuts-overlay" onClick={() => setShowShortcuts(false)}>
          <div className="shortcuts-dialog" onClick={e => e.stopPropagation()}>
            <div className="shortcuts-header">
              <span>Atajos de teclado</span>
              <button className="shortcuts-close" onClick={() => setShowShortcuts(false)}>×</button>
            </div>
            <ul className="shortcuts-list">
              <li><kbd>Enter</kbd><span>Enviar mensaje</span></li>
              <li><kbd>Shift+Enter</kbd><span>Nueva línea</span></li>
              <li><kbd>Esc</kbd><span>Cancelar respuesta en curso</span></li>
              <li><kbd>↑</kbd><span>Recuperar último mensaje enviado</span></li>
              <li><kbd>Ctrl+F</kbd><span>Buscar en mensajes</span></li>
              <li><kbd>Shift+?</kbd><span>Mostrar / ocultar esta ayuda</span></li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPane;
