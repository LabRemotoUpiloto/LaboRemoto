// Panel de chat: integra modo ASK (explicar) y AGENT (sugerir/confirmar comandos).
import React, { useEffect, useRef, useState } from 'react';
import './ChatPane.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useSessionMemory } from '../hooks/useSessionMemory';
import { invokeAgentPlan, AgentPlanResponse, ToolActionResult } from '../api/agent';
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
import AnalysisActionButtons from './chat/AnalysisActionButtons';
import DiffView from './analysis/DiffView';
import './analysis/DiffView.css';
import './analysis/FileDisambiguation.css';
// Utilidades
import { cleanText, isNearBottom, norm } from './chat/chatUtils';

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

const ModeSelect: React.FC<{ value: ChatMode; onChange: (m: ChatMode) => void }> = ({ value, onChange }) => {
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
          {MODES.map(m => (
            <button
              key={m.value}
              onClick={() => { onChange(m.value); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 9,
                width: '100%', padding: '7px 12px', border: 'none',
                background: m.value === value ? 'rgba(255,255,255,0.07)' : 'transparent',
                color: m.value === value ? '#fff' : 'rgba(255,255,255,0.7)',
                fontSize: 12.5, cursor: 'pointer', textAlign: 'left',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.09)')}
              onMouseLeave={e => (e.currentTarget.style.background = m.value === value ? 'rgba(255,255,255,0.07)' : 'transparent')}
            >
              <span style={{ color: m.color, display: 'flex', alignItems: 'center' }}>
                {ModeIcons[m.value]}
              </span>
              <span style={{ flex: 1 }}>{m.label}</span>
              {m.value === value && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
              )}
            </button>
          ))}
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
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [agentState, setAgentState] = useState<AgentState>({
    cwd: '/',
    lastExitCode: undefined,
    lastStdoutTail: undefined,
    lastFile: undefined,
  });
  const [isSending, setIsSending] = useState(false);
  const isSendingRef = useRef(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [attachedImage, setAttachedImage] = useState<{ base64: string; mediaType: string; preview: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [terminalActivity, setTerminalActivity] = useState(false);
  const terminalDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Escuchar eventos de actividad de terminal — debounce 1.5s (solo indicador visual)
  useEffect(() => {
    if (!sessionId) return;
    const unlisten = listen<{ session_id: string }>('terminal:activity', (ev) => {
      if (ev.payload.session_id !== sessionId) return;
      if (terminalDebounceRef.current) clearTimeout(terminalDebounceRef.current);
      terminalDebounceRef.current = setTimeout(() => setTerminalActivity(true), 1500);
    });
    return () => { unlisten.then(fn => fn()); };
  }, [sessionId]);

  // Nueva memoria sincronizada con Rust (fuente de verdad) + cache UI
  const { mem, setLastCommand, clear } = useSessionMemory(sessionId ?? null);

  // Referencia para el contenedor de mensajes (auto-scroll inteligente)
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const isComposingRef = useRef<boolean>(false);

  // isNearBottom extraído a util (importado)

  // Auto-scroll al último mensaje siempre que cambian los mensajes
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setShowScrollToBottom(false);
  }, [messages]);

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

  // Restaurar selector de modo en la UI; el backend seguirá usando ASK por ahora
  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as ChatMode;
    setMode(next);
    {
      setMessages([]);
      clear();
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    clear();
  };


  // cleanText ahora importado desde util

  

  // Handler de envío (usa handlers modularizados)
  const handleSend = async () => {
    if (isSending || isSendingRef.current) return;
    const trimmed = input.trim();
    if (!trimmed) return;
    const handler = modeHandlers[mode];
    if (!handler) return;
    if (!handler.canSend()) {
      setMessages(prev => [...prev, { id: String(Date.now()), sender: 'system', text: 'Modo actual no permite enviar mensajes.' }]);
      setInput('');
      return;
    }
    isSendingRef.current = true;
    const finalInput = trimmed;
    const userMsg: Message = { id: String(Date.now()), sender: 'user', text: trimmed, meta: attachedImage ? { imagePreview: attachedImage.preview } as any : undefined };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    try {
      setIsSending(true);
      await handler.send(finalInput, userMsg, buildModeContext());
    } catch (e: any) {
      setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `Error: ${String(e)}` }]);
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
      setToast('✓ Respuesta lista');
      setTimeout(() => setToast(null), 2500);
    }
  };

  const displayedMessages = messages;

  const togglePin = (id: string) => {
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Funciones para manejar acciones de análisis
  const handleEditWithRecommendations = async () => {
    setInput('edita ese archivo con las recomendaciones');
    setTimeout(() => handleSend(), 100);
  };

  const handleImproveFile = async () => {
    const lastAnalyzedFile = getLastAnalyzedFile();
    if (lastAnalyzedFile) {
      setInput(`mejora ${lastAnalyzedFile}`);
      setTimeout(() => handleSend(), 100);
    }
  };

  const handleApplyRecommendations = async () => {
    setInput('aplica las recomendaciones');
    setTimeout(() => handleSend(), 100);
  };

  // Helper para obtener el último archivo analizado
  const getLastAnalyzedFile = (): string | null => {
    const recentMessages = [...messages].reverse().slice(0, 10);
    for (const msg of recentMessages) {
      if (msg.meta?.analyzedFile) {
        return msg.meta.analyzedFile;
      }
    }
    return null;
  };

  // Mode handlers registry
  const modeHandlers: Record<ChatMode, any> = {
    ask: new AskModeHandler(),
    agente: new AgenteModeHandler(),
    plan: new PlanModeHandler(),
  };

  const modeHelp = Object.fromEntries(Object.entries(modeHandlers).map(([k,v]) => [k, v.help])) as Record<ChatMode,string>;

  // ── Funciones invocadas por handlers ──

  const invokeAsk = async ({ finalInput, mode, userMsg }: { finalInput: string; mode: ChatMode; userMsg: Message }) => {
    const history = [...messages, userMsg]
      .filter(m => m.sender !== 'system')
      .map(m => ({ role: m.sender === 'ai' ? 'assistant' : 'user', content: m.text }));
    const mappedMode = mode;
    const imgSnap = attachedImage;
    setAttachedImage(null);
    setTerminalActivity(false);
    const res = await invoke<AiResponseRaw>('ai_chat', { 
      req: { 
        user_input: finalInput, 
        mode: mappedMode, 
        history, 
        state: agentState,
        model_selection: selectedModel,
        image_base64: imgSnap?.base64 ?? null,
        image_media_type: imgSnap?.mediaType ?? null,
        terminal_context: null,
      } 
    });
    
    // Con el nuevo prompt simplificado, la respuesta viene completa en ai_response
    let aiText = String((res as any).ai_response || (res as any).explanation || '');
    
  
    
    const displayText = cleanText(aiText);
    
    // Metadatos mínimos
    const cleanedMeta: any = { 
      chat_mode: mode,
      ...(res as any)
    };
    
    // Limpiar campos innecesarios que ahora están integrados en ai_response
    delete cleanedMeta.code_output;
    delete cleanedMeta.suggestedCommands;
    
    const aiMsg: Message = { 
      id: String(Date.now() + 1), 
      sender: 'ai', 
      text: displayText, 
      meta: cleanedMeta 
    };
    setMessages(prev => [...prev, aiMsg]);
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
        <ModeSelect value={mode} onChange={(m) => { setMode(m); setMessages([]); clear(); }} />
        <ModelSelect value={selectedModel} onChange={setSelectedModel} />
      </div>
    </div>
      <div className="mode-help" aria-live="polite">{modeHelp[mode]}</div>

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
        {displayedMessages.map((msg) => (
          <div
            key={msg.id}
            className={`message message-animate ${msg.sender} ${msg.sender === 'user' ? 'message--user' : 'message--assistant'} ${mode}`}
          >
            {/* Ocultar el texto superior para los mensajes de sistema con tarjeta de confirmación */}
            {!(msg.sender === 'system' && msg.meta?.pendingCommand && !msg.meta?.processed) && (
              <div className="message-text message-card">
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
                        <>
                          <AskRenderer content={msg.text} sessionId={sessionId || undefined} setLastCommand={setLastCommand as any} mode={mode} />
                          {msg.meta?.showAnalysisActions && mode === 'analisis' && (
                            <AnalysisActionButtons
                              onEditWithRecommendations={handleEditWithRecommendations}
                              onImproveFile={handleImproveFile}
                              onApplyRecommendations={handleApplyRecommendations}
                              fileName={msg.meta.analyzedFile}
                              disabled={isSending}
                            />
                          )}
                        </>
                      )}
                      {/* Structured results */}
                      {msg.meta?.toolAction && (
                        <ToolResultRenderer action={msg.meta.toolAction} sessionId={sessionId || undefined} />
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
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        {isSending && (
          <div className="typing-indicator message-animate">
            <div className="typing-dot"></div>
            <div className="typing-dot"></div>
            <div className="typing-dot"></div>
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
        
        {toast && (
          <div className="chat-toast">
            {toast}
          </div>
        )}
      </div>

      {/* Indicador pasivo de actividad en terminal — desaparece al enviar */}
      {terminalActivity && (
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
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, flex: 1 }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe tu mensaje…"
            onKeyDown={(e) => {
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
            className="chat-tb-btn"
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
            className="send-btn send-icon"
            onClick={handleSend}
            disabled={isSending || !modeHandlers[mode].canSend()}
            aria-label="Enviar"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPane;
