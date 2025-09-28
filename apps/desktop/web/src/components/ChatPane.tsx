// Panel de chat: integra modo ASK (explicar) y AGENT (sugerir/confirmar comandos).
import React, { useEffect, useRef, useState } from 'react';
import './ChatPane.css';
import { invoke } from '@tauri-apps/api/core';
import { useSessionMemory } from '../hooks/useSessionMemory';
import { invokeAgentPlan, AgentPlanResponse, ToolActionResult } from '../api/agent';
// Modo modularizado
import { ChatMode, Message, AgentState, AiResponseRaw, ModeHandlerContext } from './chatModes/types';
// Handlers ahora como clases (instancias)
import { AskModeHandler } from './chatModes/classes/AskModeHandler';
import { BusquedaModeHandler } from './chatModes/classes/BusquedaModeHandler';
import { PinesModeHandler } from './chatModes/classes/PinesModeHandler';
import { AnalisisModeHandler } from './chatModes/classes/AnalisisModeHandler';
// Componentes extraídos
import AskRenderer from './chat/AskRenderer';
import ToolResultRenderer from './chat/ToolResultRenderer';
import DiffView from './DiffView';
import './DiffView.css';
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

type Props = { sessionId?: string | null };

const ChatPane: React.FC<Props> = ({ sessionId = null }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<ChatMode>('ask');
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [agentState, setAgentState] = useState<AgentState>({
    cwd: '/',
    lastExitCode: undefined,
    lastStdoutTail: undefined,
    lastFile: undefined,
  });
  const [isSending, setIsSending] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  // Nueva memoria sincronizada con Rust (fuente de verdad) + cache UI
  const { mem, setLastCommand, clear } = useSessionMemory(sessionId ?? null);

  // Referencia para el contenedor de mensajes (auto-scroll inteligente)
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // isNearBottom extraído a util (importado)

  // Auto-scroll al último mensaje solo si el usuario está cerca del fondo
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    if (isNearBottom(el)) {
      el.scrollTop = el.scrollHeight;
      setShowScrollToBottom(false);
    } else {
      setShowScrollToBottom(true);
    }
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

  // Auto-resize vertical del textarea hasta 5 líneas (sin crecer a lo ancho)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const style = window.getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight) || 20;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const paddingBottom = parseFloat(style.paddingBottom) || 0;
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
    const mappedMode = mode === 'analisis' ? 'ANALISIS' : mode.toUpperCase();
    const res = await invoke<AiResponseRaw>('ai_chat', { req: { user_input: finalInput, mode: mappedMode, history, state: agentState } });
    const aiText = (() => {
      const expRaw = (res as any).explanation as string | undefined;
      const respRaw = (res as any).ai_response as string | undefined;
      const exp = expRaw ? String(expRaw) : '';
      return exp || String(respRaw || '');
    })();
    const displayText = aiText;
    const displayTextClean = (displayText || '');
    const metaWithFlag: any = { ...(res as any) };
    const cleanedMeta = { ...metaWithFlag } as any;
    cleanedMeta.chat_mode = mode;
    if (cleanedMeta.summary) cleanedMeta.summary = cleanText(cleanedMeta.summary);
    if (cleanedMeta.explanation) cleanedMeta.explanation = cleanText(cleanedMeta.explanation);
    if (cleanedMeta.ai_response) cleanedMeta.ai_response = cleanText(cleanedMeta.ai_response);
    // norm importado de util
    if (norm(cleanedMeta.summary) === norm(displayTextClean)) cleanedMeta.summary = undefined;
    if (norm(cleanedMeta.explanation) === norm(displayTextClean)) cleanedMeta.explanation = undefined;
    if (norm(cleanedMeta.summary) && norm(cleanedMeta.summary) === norm(cleanedMeta.explanation)) cleanedMeta.summary = undefined;
    cleanedMeta.code_output = undefined;
    cleanedMeta.suggestedCommands = undefined;
    const aiMsg: Message = { id: String(Date.now() + 1), sender: 'ai', text: displayTextClean, meta: cleanedMeta };
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

  const handleAnalyzeCandidate = async (base: string, candidate: string) => {
    if (isSending) return;
    setIsSending(true);
    try {
      const userMsg: Message = { id: String(Date.now()), sender: 'user', text: `analizame ${candidate}` };
      setMessages(prev => [...prev, userMsg]);
      const handler = modeHandlers['analisis'];
      await handler.send(`analizame ${candidate}`, userMsg, buildModeContext());
    } catch (e) {
      setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `Error analizando ${candidate}: ${String(e)}` }]);
    } finally { setIsSending(false); }
  };

  return (
    <div className="chat-pane">
      <div className="chat-header">
        <button onClick={handleNewChat} aria-label="Nuevo chat">Nuevo chat</button>
        <select className="mode-select" value={mode} onChange={handleModeChange} aria-label="Seleccionar modo de chat">
          <option value="ask">Consulta</option>
          <option value="busqueda">Búsqueda</option>
          <option value="pines">Pines</option>
          <option value="analisis">Análisis</option>
        </select>
        {/* removed Clear button per user request */}
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
            className={`message ${msg.sender} ${msg.sender === 'user' ? 'message--user' : 'message--assistant'} ${mode}`}
          >
            {/* Ocultar el texto superior para los mensajes de sistema con tarjeta de confirmación */}
            {!(msg.sender === 'system' && msg.meta?.pendingCommand && !msg.meta?.processed) && (
              <div className="message-text message-card">
                <div className="message-content">
                  {msg.sender !== 'system' && (
                    <button
                      type="button"
                      className={`pin-btn ${pinnedIds.has(msg.id) ? 'pinned' : ''}`}
                      aria-pressed={pinnedIds.has(msg.id)}
                      aria-label={pinnedIds.has(msg.id) ? 'Quitar pin' : 'Fijar mensaje'}
                      title={pinnedIds.has(msg.id) ? 'Quitar pin' : 'Fijar mensaje'}
                      onClick={(e) => { e.stopPropagation(); togglePin(msg.id); }}
                    >{pinnedIds.has(msg.id) ? '★' : '☆'}</button>
                  )}
                  {msg.sender === 'ai' ? (
                    <>
                      {/* Remote badge */}
                      <AskRenderer content={msg.text} sessionId={sessionId || undefined} setLastCommand={setLastCommand as any} />
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
                        <div className="file-disambiguation">
                          <h4>Selecciona el archivo a analizar</h4>
                          <ul>
                            {msg.meta.fileAnalysisDisambiguation.candidates.map((c:string) => (
                              <li key={c}>
                                <button
                                  type="button"
                                  onClick={() => handleAnalyzeCandidate(msg.meta.fileAnalysisDisambiguation.base, c)}
                                  disabled={isSending}
                                >{c}</button>
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

            {/* Se elimina la tarjeta de confirmación y otros elementos del modo agente */}
          </div>
        ))}
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

      <div className="chat-input">
  <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={'Escribe tu mensaje…'}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
        />
        <button className="send-btn" onClick={handleSend} disabled={isSending || !modeHandlers[mode].canSend()} aria-label="Enviar mensaje">
          {!modeHandlers[mode].canSend() ? 'Sólo lectura' : (isSending ? 'Enviando…' : 'Enviar')}
        </button>
      </div>
    </div>
  );
};

export default ChatPane;