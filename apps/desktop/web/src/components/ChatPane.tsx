// Panel de chat: integra modo ASK (explicar) y AGENT (sugerir/confirmar comandos).
import React, { useEffect, useRef, useState } from 'react';
import './ChatPane.css';
import { invoke } from '@tauri-apps/api/core';
import { useSessionMemory } from '../hooks/useSessionMemory';
import { invokeAgentPlan, AgentPlanResponse, ToolActionResult } from '../api/agent';

type ChatMode = 'ask' | 'agent' | 'super';

type AgentState = {
  cwd: string;
  lastExitCode?: number;
  lastStdoutTail?: string;
  lastFile?: string;
};

type MessageMeta = {
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
  // Solo para modo ASK/CONSULTA: mostrar comandos sugeridos como bloque de referencia (no ejecutable)
  suggestedCommands?: string;
};

type Message = {
  id: string;
  sender: 'user' | 'ai' | 'system';
  text: string; // primary textual summary / response
  meta?: MessageMeta & { toolAction?: ToolActionResult };
};

type AiResponse = {
  user_input: string;
  ai_response: string;
  code_output?: string | null;
  explanation?: string | null;
  summary?: string | null;
  state?: AgentState;
  requires_confirmation?: boolean;
  backup_path?: string;
};

type Props = { sessionId?: string | null };

const ChatPane: React.FC<Props> = ({ sessionId = null }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<ChatMode>('ask');
  const [agentState, setAgentState] = useState<AgentState>({
    cwd: '/',
    lastExitCode: undefined,
    lastStdoutTail: undefined,
    lastFile: undefined,
  });
  const [isSending, setIsSending] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  // Nueva memoria sincronizada con Rust (fuente de verdad) + cache UI
  const { mem, setLastFile, setLastCommand, setLastPath, buildContextAppendix, clear } = useSessionMemory(sessionId ?? null);

  // Referencia para el contenedor de mensajes (auto-scroll inteligente)
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const isNearBottom = (el: HTMLElement, threshold = 4) =>
    el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;

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
    setMode(e.target.value as ChatMode);
    setMessages([]);
    clear();
  };

  const handleNewChat = () => {
    setMessages([]);
    clear();
  };

  // --- Helpers ---
  const extractCodeBlock = (s: string): string | null => {
    if (!s) return null;
    // Acepta cualquier etiqueta opcional tras ``` (bash, sh, json, text, vacío, etc.)
    const m = s.match(/```[a-zA-Z0-9_\-]*\s*([\s\S]*?)```/m);
    return m ? m[1].trim() : null;
  };
  // ...

  // Heurística simple: ¿parece un comando de shell?
  const isLikelyShell = (s: string | null | undefined): boolean => {
    if (!s) return false;
    const t = String(s).trim();
    if (!t) return false;
    const firstLine = t.split(/\r?\n/)[0]?.trim() || '';
    const basic = /^(cd|ls|mkdir|rm|touch|echo|printf|cat|tee|bash|sh|python3?|pip|chmod|curl|wget|grep|sed|awk|tar|zip|unzip|git)\b/;
    if (basic.test(firstLine)) return true;
    if (t.includes('cat >') || t.includes('<<EOF') || t.includes("<<'EOF'")) return true;
    if (t.includes('&&') || t.includes('|') || t.includes('>') || t.includes('chmod +x')) return true;
    return false;
  };

  // Si el modelo devuelve un here-doc en texto sin fences, intenta reconstruirlo
  const extractHeredocLoose = (s: string): string | null => {
    if (!s) return null;
    const HEREDOC = /cat\s*>\s*([^\s]+)\s*<<\s*(['"]?)EOF\2\s*\n([\s\S]*?)\nEOF/m;
    const m = s.match(HEREDOC);
    if (m) {
      const [, fileName, , content] = m;
      return `cat > ${fileName} <<'EOF'\n${content}\nEOF`;
    }
    return null;
  };

  const tryParseJson = (s: string | null | undefined): any | null => {
    if (!s) return null;
    const text = s.trim();
    if (!text) return null;
    try { return JSON.parse(text); } catch { return null; }
  };

  const cleanText = (text: string) => (text || '')
    // Mantener fences por defecto; solo normalizar basura visual conocida
    .replace(/\b(?:bash|sh|shell)\b\s*:?\s*$/gmi, '') // etiqueta suelta al final de línea
    .replace(/:\s*\b(?:bash|sh|shell)\b/gmi, ': ')     // '...:bash' -> '...:'
    .replace(/^Comando sugerido:\s*/gmi, '')     // rótulo
    .replace(/"""/g, '')                       // triple comilla
    .replace(/^\s+|\s+$/g, '')
    .trim();

  // Formatear explicación con título y estructura más legible (lista numerada si hay varias líneas)
  const renderExplanation = (text: string): React.ReactNode => {
    const t = (text || '').trim();
    if (!t) return null;
    // Dividir por líneas no vacías
    const lines = t.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const looksLikeList = lines.length >= 2;
    return (
      <>
        <div className="explanation-title">Explicación de lo que se va a realizar</div>
        {looksLikeList ? (
          <ol className="explanation-list">
            {lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
        ) : (
          // Si es un solo bloque, respetar saltos de línea dobles como párrafos
          t.split(/\n{2,}/).map((p, i) => (
            <p key={i}>{p}</p>
          ))
        )}
      </>
    );
  };

  // Renderizado simple copy-friendly para ASK: respeta headings (###), listas, y fences
  const RenderAsk: React.FC<{ content: string }> = ({ content }) => {
  const blocks: Array<{ type: 'code' | 'para'; lang?: string; body: string }> = [];
    const fenceRe = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;

    // Heurísticas para detectar código no-fenceado (bash/python)
  const guessLang = (txt: string): 'python' | 'bash' | undefined => {
      const t = txt || '';
      const hasPy = /(^|\n)\s*(def\s+|class\s+|import\s+|from\s+|print\(|input\(|if\s+.*:|elif\s+.*:|else:|while\s+|for\s+|try:|except\s+|with\s+)/.test(t);
      const hasBash = /(^|\n)\s*(#!\/usr\/bin\/env\s+bash|#!\/bin\/bash|echo\s+|read\s+-p|case\s+.*\sin|esac|chmod\s+|cat\s+>\s*|mkdir\s+|cd\s+|rm\s+|touch\s+|printf\s+)/.test(t);
      if (hasPy && !hasBash) return 'python';
      if (hasBash && !hasPy) return 'bash';
      if (hasPy && hasBash) {
        // Elegir por proporción de líneas
        const lines = t.split(/\r?\n/);
        let py = 0, sh = 0;
        for (const l of lines) {
          if (/^\s*(def\s+|class\s+|import\s+|from\s+|print\(|input\(|if\s+.*:|elif\s+.*:|else:|while\s+|for\s+|try:|except\s+|with\s+)/.test(l)) py++;
          if (/^\s*(echo\s+|read\s+-p|case\s+.*\sin|esac|chmod\s+|cat\s+>\s*|mkdir\s+|cd\s+|rm\s+|touch\s+|printf\s+)/.test(l)) sh++;
        }
        return py >= sh ? 'python' : 'bash';
      }
      return undefined;
    };
  const stripOuterFencesIfAny = (txt: string): string => {
    const t = (txt || '').trim();
    const fenceStart = t.match(/^```[a-zA-Z0-9_-]*\s*\n/);
    if (fenceStart) {
      let inner = t.replace(/^```[a-zA-Z0-9_-]*\s*\n/, '');
      if (/\n```\s*$/.test(inner)) inner = inner.replace(/\n```\s*$/, '');
      return inner;
    }
    return t;
  };
  const looksLikeCodeParagraph = (txt: string): boolean => {
      const lines = (txt || '').split(/\r?\n/).filter(l => l.trim() !== '');
      if (lines.length < 3) return false;
      let codeish = 0;
      for (const l of lines) {
        const s = l.trim();
        if (/^(#!\/usr\/bin\/env\s+bash|#!\/bin\/bash)/.test(s)) { codeish++; continue; }
        if (/^(echo\s+|read\s+-p|case\s+.*\sin|esac|chmod\s+|cat\s+>\s*|mkdir\s+|cd\s+|rm\s+|touch\s+|printf\s+)/.test(s)) { codeish++; continue; }
        if (/^(def\s+|class\s+|import\s+|from\s+|print\(|input\(|if\s+.*:|elif\s+.*:|else:|while\s+|for\s+|try:|except\s+|with\s+)/.test(s)) { codeish++; continue; }
        if (/^\s*#/.test(s)) { codeish++; continue; } // comentarios
      }
      return codeish >= Math.max(3, Math.floor(lines.length * 0.6));
    };
    let lastIndex = 0; let m: RegExpExecArray | null;
    while ((m = fenceRe.exec(content)) !== null) {
      if (m.index > lastIndex) {
        const slice = content.slice(lastIndex, m.index);
        if (looksLikeCodeParagraph(slice)) {
          const cleaned = stripOuterFencesIfAny(slice);
          blocks.push({ type: 'code', lang: guessLang(cleaned), body: cleaned });
        } else {
          blocks.push({ type: 'para', body: slice });
        }
      }
      blocks.push({ type: 'code', lang: (m[1] || '').trim() || undefined, body: (m[2] || '').replace(/\n$/,'') });
      lastIndex = fenceRe.lastIndex;
    }
    if (lastIndex < content.length) {
      const tail = content.slice(lastIndex);
      if (looksLikeCodeParagraph(tail)) {
        const cleaned = stripOuterFencesIfAny(tail);
        blocks.push({ type: 'code', lang: guessLang(cleaned), body: cleaned });
      } else {
        blocks.push({ type: 'para', body: tail });
      }
    }

    // Simple formatting for headings and lists
    const renderPara = (txt: string) => {
      const lines = txt.split(/\r?\n/);
      const nodes: React.ReactNode[] = [];
      let buf: string[] = [];
      // Estado para numeración jerárquica: Paso N -> sub-pasos N.1, N.2, ...
      let currentPaso: number | null = null;
      let subIndex = 0;
      const flush = () => {
        if (buf.length) {
          nodes.push(<p key={`p-${nodes.length}`}>{buf.join('\n')}</p>);
          buf = [];
        }
      };
      for (const raw of lines) {
        const line = raw.replace(/\s+$/,'');
        if (/^\s*$/.test(line)) { flush(); continue; }
        const h = line.match(/^(#{1,4})\s+(.*)$/);
        if (h) {
          flush();
          const level = h[1].length; const text = h[2];
          const Tag = (`h${Math.min(4, level)}` as any);
          // Detectar encabezados tipo "Paso N" para numeración jerárquica
          const pasoMatch = text.match(/\bPaso\s+(\d+)\b/i);
          if (pasoMatch) { currentPaso = parseInt(pasoMatch[1], 10); subIndex = 0; }
          nodes.push(<Tag key={`h-${nodes.length}`}>{text}</Tag>);
          continue;
        }
        // Bulleted list
        const li = line.match(/^\s*[-*]\s+(.*)$/);
        if (li) {
          // Start or continue a list
          const last = nodes[nodes.length - 1] as any;
          const text = li[1].replace(/^\s*\d+[\.)]\s+/, '');
          const label = (currentPaso != null) ? `${currentPaso}.${(++subIndex)}` : null;
          const liContent = label ? `${label} ${text}` : text;
          const makeUl = () => React.createElement('ul', { key: `ul-${nodes.length}`, style: { listStyleType: (currentPaso!=null?'none':'disc'), paddingLeft: (currentPaso!=null?0:undefined) } }, [React.createElement('li', { key: `li-${nodes.length}-0` }, liContent)]);
          if (!last || (last.type !== 'ul')) {
            nodes.push(makeUl());
          } else {
            (last.props.children as any[]).push(React.createElement('li', { key: `li-${nodes.length}-${(last.props.children as any[]).length}` }, liContent));
            if (currentPaso != null && last.props && last.props.style && last.props.style.listStyleType !== 'none') {
              last.props.style = { ...(last.props.style||{}), listStyleType: 'none', paddingLeft: 0 };
            }
          }
          continue;
        }
        // Ordered list (1., 2., ...)
        const oli = line.match(/^\s*\d+\)\s+(.*)$|^\s*\d+\.\s+(.*)$/);
        if (oli) {
          const textRaw = oli[1] || oli[2] || '';
          const text = String(textRaw).replace(/^\s*\d+[\.)]\s+/, '');
          const last = nodes[nodes.length - 1] as any;
          const label = (currentPaso != null) ? `${currentPaso}.${(++subIndex)}` : null;
          const liContent = label ? `${label} ${text}` : text;
          if (!last || (last.type !== 'ol' && last.type !== 'ul')) {
            // Para evitar doble numeración, usar UL sin contador cuando numeramos jerárquico
            if (currentPaso != null) {
              nodes.push(React.createElement('ul', { key: `ul-${nodes.length}`, style: { listStyleType: 'none', paddingLeft: 0 } }, [React.createElement('li', { key: `li-${nodes.length}-0` }, liContent)]));
            } else {
              nodes.push(React.createElement('ol', { key: `ol-${nodes.length}` }, [React.createElement('li', { key: `oli-${nodes.length}-0` }, liContent)]));
            }
          } else {
            (last.props.children as any[]).push(React.createElement('li', { key: `oli-${nodes.length}-${(last.props.children as any[]).length}` }, liContent));
            if (currentPaso != null && last.type === 'ol') {
              last.type = 'ul';
              last.props = { ...(last.props||{}), style: { ...(last.props?.style||{}), listStyleType: 'none', paddingLeft: 0 } };
            }
          }
          continue;
        }
        // Normalizar líneas numeradas sueltas dentro de un Paso (e.g., "1. Texto", "1.1 Texto")
        const numPara = line.match(/^\s*(\d+(?:\.\d+)*[\.)]?)\s+(.*)$/);
        if (numPara && currentPaso != null) {
          const text = numPara[2];
          const label = `${currentPaso}.${(++subIndex)}`;
          buf.push(`${label} ${text}`);
          continue;
        }
        buf.push(line);
      }
      flush();
      return nodes;
    };

    const sanitizeForTerminal = (txt: string) => {
      // Quitar líneas de fences y etiquetas errantes dentro del bloque
      return (txt || '')
        .split(/\r?\n/)
        .filter(l => !/^```/.test(l.trim()))
        .join('\n')
        .trimEnd();
    };
    const onRun = async (text: string, btn: HTMLButtonElement | null) => {
      const toSendRaw = sanitizeForTerminal(text || '');
      if (!toSendRaw) return;
      if (!sessionId) { try { alert('No hay sesión SSH activa'); } catch {} return; }
      const danger = /\brm\s+-rf\b/i.test(toSendRaw);
      if (danger) {
        const proceed = confirm('Este comando incluye "rm -rf". ¿Seguro que deseas ejecutarlo?');
        if (!proceed) return;
      }
        // Bloquear editores interactivos (nano/vim) que no funcionan bien vía ejecución directa
        const editorCmdRe = /\b(nano|vim|vi|nvim|emacs)\b/;
        if (editorCmdRe.test(toSendRaw)) {
          alert('Este bloque contiene un editor interactivo (nano/vim). Usa here-doc con cat/tee para crear archivos sin interacción.');
          return;
        }
      if (btn) { btn.disabled = true; const prev = btn.textContent; btn.textContent = 'Ejecutando…';
        try {
          await invoke('ssh_stdin', { id: sessionId, data: toSendRaw + '\n' });
          try { await setLastCommand(toSendRaw); } catch {}
          btn.textContent = 'Ejecutado';
        } catch {
          btn.textContent = 'Error';
        } finally {
          setTimeout(() => { if (btn) { btn.textContent = prev || 'Ejecutar'; btn.disabled = false; } }, 300);
        }
        return;
      }
      try {
        await invoke('ssh_stdin', { id: sessionId, data: toSendRaw + '\n' });
        try { await setLastCommand(toSendRaw); } catch {}
      } catch { /* noop */ }
    };

    return (
      <div>
        {blocks.map((b, i) => b.type === 'code' ? (
          <div className="copyable-block" key={`c-${i}`}>
            <button
              className="copy-btn"
              onClick={(e) => onRun(b.body, e.currentTarget)}
              aria-label="Ejecutar código"
              type="button"
            >Ejecutar</button>
            <pre><code>{b.body}</code></pre>
          </div>
        ) : (
          <div key={`p-${i}`}>{renderPara(b.body)}</div>
        ))}
      </div>
    );
  };

  // Se elimina por completo la lógica del modo AGENT.

  // Se remueven paneles de confirmación y estado del agente.

  // Enviar prompt al backend (Tauri -> ai_chat) y procesar respuesta

  const handleSend = async () => {
    if (isSending) return;
    const trimmed = input.trim();
    if (!trimmed) return;

    const effectiveMode: ChatMode = mode; // now respect selected mode

    const finalInput = trimmed;

    const userMsg: Message = { id: String(Date.now()), sender: 'user', text: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    try {
      setIsSending(true);

      if (effectiveMode === 'agent') {
        const res: AgentPlanResponse = await invokeAgentPlan({ userMessage: finalInput, sessionId });
        const aiMsg: Message = {
          id: String(Date.now() + 1),
          sender: 'ai',
            text: res.ai_response || '',
          meta: { toolAction: res.tool_action as any }
        };
        setMessages(prev => [...prev, aiMsg]);
      } else {
        // ASK flow (previous logic)
        const history = [...messages, userMsg]
          .filter(m => m.sender !== 'system')
          .map(m => ({
            role: m.sender === 'ai' ? 'assistant' : 'user',
            content: m.text,
          }));
        const res = await invoke<AiResponse>('ai_chat', { req: { user_input: finalInput, mode: effectiveMode.toUpperCase(), history, state: agentState } });
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
        cleanedMeta.chat_mode = effectiveMode;
        if (cleanedMeta.summary) cleanedMeta.summary = cleanText(cleanedMeta.summary);
        if (cleanedMeta.explanation) cleanedMeta.explanation = cleanText(cleanedMeta.explanation);
        if (cleanedMeta.ai_response) cleanedMeta.ai_response = cleanText(cleanedMeta.ai_response);
        const norm = (s?: string | null) => (s || '')
          .replace(/[`]/g, '')
          .replace(/[.,;:!?¡¿"']+/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
        if (norm(cleanedMeta.summary) === norm(displayTextClean)) cleanedMeta.summary = undefined;
        if (norm(cleanedMeta.explanation) === norm(displayTextClean)) cleanedMeta.explanation = undefined;
        if (norm(cleanedMeta.summary) && norm(cleanedMeta.summary) === norm(cleanedMeta.explanation)) cleanedMeta.summary = undefined;
        cleanedMeta.code_output = undefined;
        cleanedMeta.suggestedCommands = undefined;
        const aiMsg: Message = { id: String(Date.now() + 1), sender: 'ai', text: displayTextClean, meta: cleanedMeta };
        setMessages(prev => [...prev, aiMsg]);
      }

    } catch (e: any) {
      setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `Error: ${String(e)}` }]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="chat-pane">
      <div className="chat-header">
        <button onClick={handleNewChat} aria-label="Nuevo chat">Nuevo chat</button>
        <select className="mode-select" value={mode} onChange={handleModeChange} aria-label="Seleccionar modo de chat">
          <option value="ask">Modo Consulta</option>
          <option value="agent">Modo Agente</option>
        </select>
        {/* removed Clear button per user request */}
      </div>

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
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`message ${msg.sender} ${msg.sender === 'user' ? 'message--user' : 'message--assistant'} ${mode}`}
          >
            {/* Ocultar el texto superior para los mensajes de sistema con tarjeta de confirmación */}
            {!(msg.sender === 'system' && msg.meta?.pendingCommand && !msg.meta?.processed) && (
              <div className="message-text message-card">
                <div className="message-content">
                  {msg.sender === 'ai' ? (
                    <>
                      {/* Remote badge */}
                      {msg.meta?.toolAction && (msg.meta.toolAction as any).remote && (
                        <span className="remote-badge">remoto</span>
                      )}
                      <RenderAsk content={msg.text} />
                      {/* Structured results */}
                      {msg.meta?.toolAction && (
                        <ToolResultRenderer action={msg.meta.toolAction} />
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
        <button className="send-btn" onClick={handleSend} disabled={isSending} aria-label="Enviar mensaje">
          {isSending ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
    </div>
  );
};

export default ChatPane;

// ---- Structured tool result renderer (collapsible) ----
const ToolResultRenderer: React.FC<{ action: ToolActionResult }> = ({ action }) => {
  const [collapsed, setCollapsed] = React.useState(false);
  if (!action) return null;
  const tool = (action as any).tool;
  const remote = (action as any).remote;
  if (tool === 'fs_search') {
    const matches = (action as any).matches as any[];
    if (!matches || matches.length === 0) return null;
    // Simple highlight of query (best-effort: split by spaces, first term)
    const firstQuery = (action as any).query ? String((action as any).query).trim() : '';
    const termForHi = firstQuery.split(/\s+/).filter(Boolean)[0] || '';
    const hiRegex = termForHi ? new RegExp(termForHi.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig') : null;
    const highlight = (text: string) => {
      if (!hiRegex || !text) return text;
      return text.split(hiRegex).reduce<React.ReactNode[]>((acc, part, idx, arr) => {
        acc.push(part);
        if (idx < arr.length - 1) acc.push(<mark className="sr-hi" key={idx}>{termForHi}</mark>);
        return acc;
      }, []);
    };
    return (
      <div className={`tool-result-block search-card ${collapsed ? 'collapsed' : ''}`}>
        <header onClick={() => setCollapsed(c => !c)} className="sr-header">
          <div className="sr-header-left">
            <h4 className="sr-title">Resultados {remote ? 'remotos' : 'locales'}</h4>
            {remote && <span className="remote-chip" title="Obtenido vía SSH">SSH</span>}
          </div>
          <div className="sr-meta">
            <span className="sr-count">{matches.length}</span>
            <button className="sr-collapse-btn" aria-label={collapsed ? 'Expandir resultados' : 'Colapsar resultados'}>
              {collapsed ? '▸' : '▾'}
            </button>
          </div>
        </header>
        <div className="body sr-body">
          <ul className="sr-list">
            {matches.slice(0, 200).map((m,i) => {
              const isDir = m.is_dir;
              const icon = isDir ? '📁' : '📄';
              return (
                <li key={i} className="sr-item" title={m.path}>
                  <div className="sr-row-main">
                    <span className="sr-icon" aria-hidden>{icon}</span>
                    <span className="sr-name" data-dir={isDir || undefined}>{highlight(m.file_name)}{isDir ? '/' : ''}</span>
                    <span className="sr-path">{m.path}</span>
                  </div>
                  {m.snippet && (
                    <div className="sr-snippet" title={m.snippet}>{highlight(m.snippet)}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  } else if (tool === 'fs_read') {
    const path = (action as any).path as string;
    const content = (action as any).content as string;
    return (
      <div className={`tool-result-block ${collapsed ? 'collapsed' : ''}`}>
        <header onClick={() => setCollapsed(c => !c)}>
          <h4>Lectura {remote ? 'remota' : 'local'}: {path.split(/[/\\]/).pop()}</h4>
          <span className="count">{content.length} bytes</span>
        </header>
        <div className="body">
          <pre style={{ margin:0, padding: '8px 10px' }}>{content}</pre>
        </div>
      </div>
    );
  } else if (tool === 'fs_grep') {
    const matches = (action as any).matches as any[];
    if (!matches || matches.length === 0) return null;
    return (
      <div className={`tool-result-block ${collapsed ? 'collapsed' : ''}`}>
        <header onClick={() => setCollapsed(c => !c)}>
          <h4>Grep {remote ? 'remoto' : 'local'}</h4>
          <span className="count">{matches.length} coincidencia(s)</span>
        </header>
        <div className="body">
          <table className="tool-table">
            <thead>
              <tr><th>Archivo</th><th>Línea</th><th>Fragmento</th></tr>
            </thead>
            <tbody>
              {matches.slice(0, 300).map((m,i) => (
                <tr key={i}>
                  <td className="truncate" title={m.path}>{m.path}</td>
                  <td className="grep-line">{m.line}</td>
                  <td className="truncate" title={m.snippet}>{m.snippet}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  return null;
};