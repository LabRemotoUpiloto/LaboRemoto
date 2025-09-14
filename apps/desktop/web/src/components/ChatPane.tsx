// Panel de chat: integra modo ASK (explicar) y AGENT (sugerir/confirmar comandos).
import React, { useEffect, useRef, useState } from 'react';
import './ChatPane.css';
import { invoke } from '@tauri-apps/api/core';
import { useSessionMemory } from '../hooks/useSessionMemory';

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
  text: string;
  meta?: MessageMeta;
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

  // Auto-resize the input textarea like ChatGPT: grow with content up to a max of 5 lines
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const style = window.getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight) || 20;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const paddingBottom = parseFloat(style.paddingBottom) || 0;
    const maxLines = 5; // cap growth to 5 lines max
    const maxPx = Math.round(paddingTop + paddingBottom + lineHeight * maxLines);
    const newH = Math.min(el.scrollHeight, maxPx);
    el.style.height = newH + 'px';
    el.style.overflowY = el.scrollHeight > maxPx ? 'auto' : 'hidden';
  }, [input]);

  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setMode(e.target.value as ChatMode);
    setMessages([]);
    // limpiar memoria en backend también
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
    .replace(/```(?:bash|sh)?\s*|\s*```/g, '')  // fences
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

  // Componente para mostrar el panel de confirmación
  const ConfirmationPanel: React.FC<{
    title: string;
    description: string;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    onConfirm: () => void;
    onCancel: () => void;
  }> = ({ title, description, riskLevel, onConfirm, onCancel }) => (
    <div className="confirmation-panel">
      <div className="title">{title}</div>
      <div className={`risk ${riskLevel}`}>{riskLevel.toUpperCase()}</div>
      <div className="description">{description}</div>
      <div className="actions">
        <button className="confirm" onClick={onConfirm}>Confirmar</button>
        <button className="cancel" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );

  // Mostrar información del estado del agente
  const StateInfo: React.FC<{ state: AgentState }> = ({ state }) => (
    <div className="state-info">
      <div className="path">Directorio: {state.cwd}</div>
      {state.lastExitCode !== undefined && (
        <div className={`exit-code ${state.lastExitCode === 0 ? 'success' : 'error'}`}>
          Último código de salida: {state.lastExitCode}
        </div>
      )}
      {state.lastFile && <div>Último archivo: {state.lastFile}</div>}
    </div>
  );

  // Enviar prompt al backend (Tauri -> ai_chat) y procesar respuesta
  const computeRiskLevel = (cmd: string): 'low' | 'medium' | 'high' | 'critical' => {
    const t = (cmd || '').toLowerCase();
    if (/\brm\s+-rf\b/.test(t) || /\bmkfs\b/.test(t) || /\bdd\b/.test(t)) return 'critical';
    if (/\brm\s+-r\b/.test(t) || /\bsudo\b/.test(t) || /\bmv\b/.test(t) || />\>?\s*\S+/.test(t) || /\bchmod\s+7/.test(t)) return 'high';
    if (/\bmkdir\b/.test(t) || /\bcd\b/.test(t) || /\bls\b/.test(t)) return 'low';
    return 'medium';
  };

  const handleSend = async () => {
    if (isSending) return;
    const trimmed = input.trim();
    if (!trimmed) return;

    // Mantener el modo seleccionado por el usuario sin auto-cambio
    let effectiveMode: ChatMode = mode;

    // No adjuntar historial/contexto al prompt visible; el estado se envía como campo separado
    const finalInput = trimmed;

  const userMsg: Message = { id: String(Date.now()), sender: 'user', text: trimmed };
  setMessages(prev => [...prev, userMsg]);
    setInput('');

    try {
      setIsSending(true);
  const modeValue = effectiveMode.toUpperCase();
      // API sin estado: enviar todo el historial user/assistant de la sesión actual
      const history = [...messages, userMsg]
        .filter(m => m.sender !== 'system')
        .map(m => ({
          role: m.sender === 'ai' ? 'assistant' : 'user',
          content: m.text,
        }));
  const res = await invoke<AiResponse>('ai_chat', { req: { user_input: finalInput, mode: modeValue, history, state: agentState } });

      // Visualización: en AGENT priorizar summary; en ASK combinar summary + explanation
      const aiText = (() => {
        if (effectiveMode === 'agent') {
          return (res as any).summary ?? (res as any).explanation ?? (res as any).ai_response ?? '';
        } else {
          // En ASK: priorizar SOLO la explicación para evitar encabezados tipo "Ejecuta:" en el resumen
          const expRaw = (res as any).explanation as string | undefined;
          const respRaw = (res as any).ai_response as string | undefined;
          const exp = expRaw ? String(expRaw) : '';
          return exp || String(respRaw || '');
        }
      })();

  // 1) Intentar extraer JSON de acciones (create_file / command)
      let agentJson: any | null = null;
      {
        const candidates = [(res as any).ai_response, (res as any).explanation, (res as any).summary, aiText];
        for (const candidate of candidates) {
          if (!candidate) continue;
          const block = extractCodeBlock(candidate as string);
          agentJson = tryParseJson(block ?? (candidate as string));
          if (agentJson && agentJson.actions) break;
          agentJson = null;
        }
      }

      // 2) Detectar comando u here-doc
      const runPrefix = 'RUN_CMD:';
      let cmd: string | null = null;
      // Priorizar code_output explícito del backend: si existe, úsalo completo y NO re-detectes
      const codeFromBackend = (res as any).code_output && String((res as any).code_output).trim() ? String((res as any).code_output).trim() : null;
      if (codeFromBackend) {
        cmd = codeFromBackend;
      } else {
        const candidates = [(res as any).ai_response, (res as any).explanation, (res as any).summary, aiText];
        for (const candidate of candidates) {
          if (!candidate) continue;
          // 1) Bloque con fences
          const block = extractCodeBlock(candidate as string);
          if (block && isLikelyShell(block)) { cmd = block; break; }
          // 2) Here-doc suelto (sin fences)
          const loose = extractHeredocLoose(candidate as string);
          if (loose && isLikelyShell(loose)) { cmd = loose; break; }
          // 3) RUN_CMD: explícito
          const out = cleanText(candidate as string);
          if (out.includes(runPrefix)) {
            const maybe = out.split(runPrefix)[1].trim();
            if (isLikelyShell(maybe)) { cmd = maybe; break; }
          }
          // 4) Último recurso (solo si parece shell): toma la primera línea
          const first = out.split(/\r?\n/)[0]?.trim();
          if (first && isLikelyShell(first)) { cmd = first; break; }
        }
      }

  // Generar tarjeta de confirmación en modo AGENT
  let createdConfirmation = false;
  if (effectiveMode === 'agent' && cmd && isLikelyShell(cmd)) {
        // Detectar here-doc para registrar memoria, pero siempre mostrar UNA tarjeta con el bloque completo
        const HEREDOC = /cat\s*>\s*([^\s]+)\s*<<\s*['"]?EOF['"]?\s*\n([\s\S]*?)\nEOF/gm;
        const docs = [...cmd.matchAll(HEREDOC)];
        let pendingFileCreation: any = null;
        if (docs.length > 0) {
          const [, fileName, fileContent] = docs[0];
          pendingFileCreation = { fileName, fileContent, command: cmd };
          try { await setLastFile(fileName, fileContent); } catch {}
        } else if (agentJson && Array.isArray(agentJson.actions)) {
          const create = agentJson.actions.find((a: any) => a.type === 'create_file')
            || (agentJson.actions.find((a: any) => a.type === 'file_bundle')?.files?.[0]);
          if (create && (create.path || create.fileName)) {
            const fileName = (create.path || create.fileName) as string;
            const fileContent = (create.content || create.fileContent || '') as string;
            pendingFileCreation = { fileName, fileContent, command: cmd };
            try { await setLastFile(fileName, fileContent); } catch {}
          }
        }

        const sysId = String(Date.now() + 5);
        const sysText = 'El agente sugiere ejecutar este comando';
        const sysSummaryRaw = ((res as any).summary ?? agentJson?.summary ?? '') as string;
        const sysExplRaw = ((res as any).explanation ?? agentJson?.explanation ?? '') as string;
        const risk = computeRiskLevel(cmd);
        const sysMeta = {
          pendingCommand: cmd,
          pendingFileCreation,
          // Ocultar el resumen para la tarjeta de confirmación per user request
          summary: undefined,
          explanation: cleanText(sysExplRaw),
          userPrompt: trimmed,
          riskLevel: risk,
        };
        const sysMsg: Message = { id: sysId, sender: 'system', text: sysText, meta: sysMeta };
        setMessages(prev => [...prev, sysMsg]);
        createdConfirmation = true;
      }

      // Construir texto visible: mantener el contenido tal cual (incluido el bloque de código) en modo ASK
      const displayText = aiText;
  // En ASK mantener fences y etiqueta de lenguaje para copiar/pegar; en otros modos, limpiar
  const displayTextClean = (effectiveMode === 'ask') ? (displayText || '') : cleanText(displayText);

      // Limpiar meta
      const metaWithFlag: any = { ...(res as any) };
      const cleanedMeta = { ...metaWithFlag } as any;
      cleanedMeta.chat_mode = effectiveMode; // tag to control rendering later
      if (cleanedMeta.summary) cleanedMeta.summary = cleanText(cleanedMeta.summary);
      if (cleanedMeta.explanation) cleanedMeta.explanation = cleanText(cleanedMeta.explanation);
      if (cleanedMeta.ai_response) cleanedMeta.ai_response = cleanText(cleanedMeta.ai_response);

      // Deduplicar: si summary/explanation coinciden con el texto mostrado o entre sí, ocultarlos
      const norm = (s?: string | null) => (s || '')
        .replace(/[`]/g, '')
        .replace(/[.,;:!?¡¿\"']+/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      if (norm(cleanedMeta.summary) === norm(displayTextClean)) cleanedMeta.summary = undefined;
      if (norm(cleanedMeta.explanation) === norm(displayTextClean)) cleanedMeta.explanation = undefined;
      if (norm(cleanedMeta.summary) && norm(cleanedMeta.summary) === norm(cleanedMeta.explanation)) cleanedMeta.summary = undefined;
      // En ASK, como ya combinamos summary + explanation en el texto principal, ocultar ambos metadatos para evitar duplicados visuales
      if (effectiveMode === 'ask') { cleanedMeta.summary = undefined; cleanedMeta.explanation = undefined; }

      // En modo ASK/CONSULTA no exponer code_output; solo en modos con ejecución
      if (effectiveMode !== 'ask') {
        if (cmd && !cleanedMeta.code_output) {
          cleanedMeta.code_output = cmd;
        }
      } else {
        cleanedMeta.code_output = undefined;
        // En modo ASK no mostrar bloques accesorios; el contenido (incluido el código) va en el mensaje principal
        cleanedMeta.suggestedCommands = undefined;
      }

      // Manejar respuestas según el modo
      if (effectiveMode === 'super') {
        // En modo SUPER, mostrar plan de ejecución y estado
        if (cleanedMeta.state) {
          const stateMsg: Message = {
            id: String(Date.now()),
            sender: 'system',
            text: '',
            meta: {
              state: cleanedMeta.state,
              requiresConfirmation: cleanedMeta.requires_confirmation,
              backupPath: cleanedMeta.backup_path,
            }
          };
          setMessages(prev => [...prev, stateMsg]);
        }
      }

      // En modos AGENT y SUPER, mostrar un banner de confirmación mientras esté pendiente
      if ((effectiveMode === 'agent' || effectiveMode === 'super') && createdConfirmation) {
        const risk2 = computeRiskLevel(String(cmd || ''));
        const confirmationMsg: Message = {
          id: String(Date.now() + 2),
          sender: 'system',
          text: 'Se requiere confirmación para ejecutar:',
          meta: {
            requiresConfirmation: true,
            backupPath: cleanedMeta.backup_path,
            command: cmd || '',
            riskLevel: risk2
          }
        };
        setMessages(prev => [...prev, confirmationMsg]);
      } else {
        // Si no hay confirmación pendiente, mostrar mensaje de IA normalmente
        const aiMsg: Message = {
          id: String(Date.now() + 1),
          sender: 'ai',
          text: displayTextClean,
          meta: cleanedMeta
        };
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
        <select value={mode} onChange={handleModeChange} aria-label="Seleccionar modo de chat">
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
          <div key={msg.id} className={`message ${msg.sender}`}>
            {/* Ocultar el texto superior para los mensajes de sistema con tarjeta de confirmación */}
            {!(msg.sender === 'system' && msg.meta?.pendingCommand && !msg.meta?.processed) && (
              <div className="message-text">{msg.text}</div>
            )}

            {/* No mostrar el resumen en la tarjeta de confirmación ni en ASK */}
            {!(msg.sender === 'system' && msg.meta?.pendingCommand) && msg.meta?.summary && msg.meta?.chat_mode === 'agent' && (
               <div className="summary">{msg.meta.summary}</div>
             )}

            {msg.meta?.explanation && msg.meta.explanation !== msg.text && (
              (msg.sender === 'system' && msg.meta?.pendingCommand) ? null : (
                <div className="explanation">{renderExplanation(msg.meta.explanation)}</div>
              )
            )}

            {!msg.meta?.sentToTerminal && msg.meta?.code_output && (
              <pre className="code-output">{msg.meta.code_output}</pre>
            )}
            {/* En modo ASK ya no mostramos bloques separados; el código queda inline en el texto principal */}
            {/* Card: comando pendiente (mantener visible tras confirmar/cancelar; solo ocultar botones) */}
            {msg.sender === 'system' && msg.meta?.pendingCommand && (
              <div className="confirm-card">
                {msg.meta?.explanation && (
                  <div className="explanation">{renderExplanation(msg.meta.explanation)}</div>
                )}
                 <div className="confirm-title">Código generado</div>
                 <pre className="confirm-code"><code>{String(msg.meta.pendingCommand || '').trim()}</code></pre>
                 {!msg.meta?.processed && (
                   <div className="confirm-actions">
                     <button
                       className="btn confirm"
                       onClick={async () => {
                       try {
                         const toSend = String(msg.meta?.pendingCommand || '').trim();
                         await invoke('ssh_stdin', { id: sessionId, data: toSend + '\n' });
                         // Marcar tarjeta como procesada y eliminar el banner correspondiente
                         setMessages(prev => prev
                           .map(m => m.id === msg.id ? { ...m, meta: { ...m.meta, processed: true } } : m)
                           .filter(m => !(m.sender === 'system' && m.meta?.requiresConfirmation && m.meta?.command && String(m.meta.command).trim() === toSend))
                         );
                         await setLastCommand(toSend);
                         // Si es un 'cd <dir>', registra ese directorio como lastPath
                         try {
                           const mCd = toSend.match(/^\s*cd\s+(.+)$/);
                           if (mCd && mCd[1]) {
                             const raw = mCd[1].trim();
                             const dir = raw.replace(/^"|"$/g, '');
                             await setLastPath(dir, 'dir');
                           }
                         } catch {}
                         // Si es un mkdir, guarda el directorio creado como lastPath
                         const mk = toSend.match(/^\s*mkdir\s+([^\s]+)/);
                         if (mk && mk[1]) {
                           try { await setLastPath(mk[1].trim(), 'dir'); } catch {}
                         }
                         // Si creamos archivo con touch/echo/printf/tee/cat >, también registra lastFile y lastPath(file)
                         try {
                           let created: string | null = null;
                           const mTouch = toSend.match(/^\s*touch\s+(\S+)/);
                           if (mTouch) created = mTouch[1];
                           const mRedir = toSend.match(/>\>?\s*([^\s]+)/);
                           if (!created && mRedir) created = mRedir[1];
                           const mHeredoc = toSend.match(/^(?:cat\s+>\s*|tee\s+)(\S+)\s*<</);
                           if (!created && mHeredoc) created = mHeredoc[1];
                           if (created) {
                             await setLastFile(created, "");
                             await setLastPath(created, 'file');
                           }
                         } catch {}
                         // Si ya tenemos metadata de creación, úsala para memoria
                         try {
                           if (msg.meta?.pendingFileCreation?.fileName) {
                             const name = String(msg.meta.pendingFileCreation.fileName);
                             const content = String(msg.meta.pendingFileCreation.fileContent || '');
                             await setLastFile(name, content);
                             await setLastPath(name, 'file');
                           }
                         } catch {}
                       } catch (e) {}
                       }}
                     >Ejecutar ahora</button>
                     <button
                       className="btn cancel"
                       onClick={() => {
                       const toSend = String(msg.meta?.pendingCommand || '').trim();
                       setMessages(prev => {
                         const next = prev
                           .map(m => m.id === msg.id ? { ...m, meta: { ...m.meta, processed: true } } : m)
                           .filter(m => !(m.sender === 'system' && m.meta?.requiresConfirmation && m.meta?.command && String(m.meta.command).trim() === toSend));
                         // Mantener el flujo conversacional: añadir un mensaje AI breve y seguir sin perder memoria
                         const ack: Message = {
                           id: String(Date.now() + 7),
                           sender: 'ai',
                           text: 'Entendido, no ejecuto el comando. ¿Deseas que proponga otra alternativa o continúo con la explicación?',
                           meta: {}
                         };
                         return [...next, ack];
                       });
                       }}
                     >Cancelar</button>
                   </div>
                 )}
               </div>
             )}
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
          placeholder={mode === 'agent' ? 'Escribe tu mensaje… (Se pedirá confirmación para comandos)' : 'Escribe tu mensaje…'}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
        />
        <button onClick={handleSend} disabled={isSending} aria-label="Enviar mensaje">
          {isSending ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
    </div>
  );
};

export default ChatPane;