// Panel de chat: integra modo ASK (explicar) y AGENT (sugerir/confirmar comandos).
import React, { useEffect, useRef, useState } from 'react';
import './ChatPane.css';
import { invoke } from '@tauri-apps/api/core';
import { useSessionMemory } from '../hooks/useSessionMemory';
import { invokeAgentPlan, AgentPlanResponse, ToolActionResult } from '../api/agent';
// Modo modularizado
import { ChatMode, Message, AgentState, AiResponseRaw, ModeHandlerContext, ModelSelection, AVAILABLE_MODELS } from './chatModes/types';
// Handlers ahora como clases (instancias)
import { AskModeHandler } from './chatModes/classes/AskModeHandler';
import { BusquedaModeHandler } from './chatModes/classes/BusquedaModeHandler';
import { PinesModeHandler } from './chatModes/classes/PinesModeHandler';
import { AnalisisModeHandler } from './chatModes/classes/AnalisisModeHandler';
// Componentes extraídos
import AskRenderer from './chat/AskRenderer';
import ToolResultRenderer from './chat/ToolResultRenderer';
import AnalysisActionButtons from './chat/AnalysisActionButtons';
import DiffView from './analysis/DiffView';
import './analysis/DiffView.css';
import './analysis/FileDisambiguation.css';
// Utilidades
import { cleanText, isNearBottom, norm } from './chat/chatUtils';

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
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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
    if (next !== 'pines') {
      // No limpiar los mensajes al entrar en pines; sirve de visor.
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
    if (isSending) return;
    const trimmed = input.trim();
    if (!trimmed) return;
    const handler = modeHandlers[mode];
    if (!handler) return;
    if (!handler.canSend()) {
      setMessages(prev => [...prev, { id: String(Date.now()), sender: 'system', text: 'Modo actual no permite enviar mensajes.' }]);
      setInput('');
      return;
    }
    const finalInput = trimmed;
    const userMsg: Message = { id: String(Date.now()), sender: 'user', text: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    try {
      setIsSending(true);
      await handler.send(finalInput, userMsg, buildModeContext());
    } catch (e: any) {
      setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `Error: ${String(e)}` }]);
    } finally {
      setIsSending(false);
      setToast('✓ Respuesta lista');
      setTimeout(() => setToast(null), 2500);
    }
  };

  // Derivar lista de mensajes a mostrar según modo (pines filtra)
  const displayedMessages = mode === 'pines' ? messages.filter(m => pinnedIds.has(m.id)) : messages;

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
    busqueda: new BusquedaModeHandler(),
    pines: new PinesModeHandler(),
    analisis: new AnalisisModeHandler()
  };

  const modeHelp = Object.fromEntries(Object.entries(modeHandlers).map(([k,v]) => [k, v.help])) as Record<ChatMode,string>;

  // Funciones invocadas por handlers
  const invokeBusqueda = async ({ finalInput, userMsg }: { finalInput: string; userMsg: Message }) => {
    const res: AgentPlanResponse = await invokeAgentPlan({ userMessage: finalInput, sessionId });
    const aiMsg: Message = {
      id: String(Date.now() + 1),
      sender: 'ai',
      text: res.ai_response || '',
      meta: { toolAction: res.tool_action as any }
    };
    setMessages(prev => [...prev, aiMsg]);
  };

  const invokeAsk = async ({ finalInput, mode, userMsg }: { finalInput: string; mode: ChatMode; userMsg: Message }) => {
    const history = [...messages, userMsg]
      .filter(m => m.sender !== 'system')
      .map(m => ({ role: m.sender === 'ai' ? 'assistant' : 'user', content: m.text }));
    // Enviamos siempre 'ask' al backend para mantener sincronización canónica
    const mappedMode = 'ask';
    const res = await invoke<AiResponseRaw>('ai_chat', { 
      req: { 
        user_input: finalInput, 
        mode: mappedMode, 
        history, 
        state: agentState,
        model_selection: selectedModel
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
    invokeBusqueda
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
      const handler = modeHandlers['analisis'];
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
        <select className="mode-select" value={mode} onChange={handleModeChange}>
          <option value="ask">Consulta</option>
        </select>
        <select className="model-select" value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value as ModelSelection)}>
          {AVAILABLE_MODELS.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
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
                  ) : msg.text}
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

      <div className="chat-input">
        <div className="chat-input-wrap">
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
          />
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
  );
};

export default ChatPane;
