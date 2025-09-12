// Panel de chat: integra modo ASK (explicar) y AGENT (sugerir/confirmar comandos).
import React, { useEffect, useRef, useState } from 'react';
import './ChatPane.css';
import { invoke } from '@tauri-apps/api/core';
import { useSessionMemory } from '../hooks/useSessionMemory';

type ChatMode = 'ask' | 'agent';

type Message = {
  id: string;
  sender: 'user' | 'ai' | 'system';
  text: string;
  meta?: any;
};

type AiResponse = {
  user_input: string;
  ai_response: string;
  code_output?: string | null;
  explanation?: string | null;
  summary?: string | null;
};

type Props = { sessionId?: string | null };

const ChatPane: React.FC<Props> = ({ sessionId = null }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<ChatMode>('ask');
  const [isSending, setIsSending] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  // Nueva memoria sincronizada con Rust (fuente de verdad) + cache UI
  const { mem, setLastFile, setLastCommand, setLastPath, buildContextAppendix, clear } = useSessionMemory(sessionId ?? null);

  // Referencia para el contenedor de mensajes (auto-scroll inteligente)
  const messagesRef = useRef<HTMLDivElement | null>(null);

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
    const m = s.match(/```(?:bash|sh)?\s*([\s\S]*?)```/m);
    return m ? m[1].trim() : null;
  };

  const tryParseJson = (s: string | null | undefined): any | null => {
    if (!s) return null;
    const text = s.trim();
    if (!text) return null;
    try { return JSON.parse(text); } catch { return null; }
  };

  const cleanText = (text: string) => (text || '')
    .replace(/```(?:bash|sh)?\s*|\s*```/g, '')  // fences
    .replace(/^Comando sugerido:\s*/gmi, '')     // rótulo
    .replace(/"""/g, '')                       // triple comilla
    .replace(/^\s+|\s+$/g, '')
    .trim();

  // Enviar prompt al backend (Tauri -> ai_chat) y procesar respuesta
  const handleSend = async () => {
    if (isSending) return;
    const trimmed = input.trim();
    if (!trimmed) return;

    // Siempre anexar el contexto de memoria como un "cache" para el modelo (sin heurísticas en UI)
    const finalInput = trimmed + buildContextAppendix();

    const userMsg: Message = { id: String(Date.now()), sender: 'user', text: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    try {
      setIsSending(true);
      const modeValue = mode === 'agent' ? 'AGENT' : 'ASK';
      const history = messages.map(m => ({
        role: m.sender === 'ai' ? 'assistant' : (m.sender === 'system' ? 'system' : 'user'),
        content: m.text,
      }));
      const res = await invoke<AiResponse>('ai_chat', { req: { user_input: finalInput, mode: modeValue, history } });

      // Visualización: en AGENT priorizar summary; en ASK usar explicación
      const aiText = mode === 'agent'
        ? ((res as any).summary ?? (res as any).explanation ?? (res as any).ai_response ?? '')
        : ((res as any).explanation ?? (res as any).ai_response ?? '');

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
      const cmdCandidates = [(res as any).ai_response, (res as any).explanation, (res as any).summary, aiText];
      for (const candidate of cmdCandidates) {
        if (!candidate) continue;
        const block = extractCodeBlock(candidate as string);
        if (block) { cmd = block; break; }
        const out = cleanText(candidate as string);
        if (out.includes(runPrefix)) { cmd = out.split(runPrefix)[1].trim(); break; }
        const m = out.match(/(?:^|\n)\$?\s*([^\n]+)\n?/m);
        if (m && m[1]) { cmd = m[1].trim(); break; }
      }

      // Generar tarjeta de confirmación en modo AGENT
      let confirmationMsgId: string | null = null;
      if (mode === 'agent' && cmd) {
        // a) JSON action format
        if (agentJson && Array.isArray(agentJson.actions)) {
          const create = agentJson.actions.find((a: any) => a.type === 'create_file')
            || (agentJson.actions.find((a: any) => a.type === 'file_bundle')?.files?.[0]);
          const run = agentJson.actions.find((a: any) => a.type === 'command');
          if (create && (create.path || create.fileName)) {
            const fileName = (create.path || create.fileName) as string;
            const fileContent = (create.content || create.fileContent || '') as string;
            await setLastFile(fileName, fileContent);
            const sysId = String(Date.now() + 5);
            const sysText = `El agente quiere crear el archivo '${fileName}'. ¿Deseas continuar?`;
            const sysMeta = {
              pendingFileCreation: { fileName, fileContent, command: cmd },
              followUpCommand: run?.command || null,
              summary: agentJson.summary ?? (res as any).summary,
              explanation: agentJson.explanation ?? (res as any).explanation,
              userPrompt: trimmed,
            };
            const sysMsg: Message = { id: sysId, sender: 'system', text: sysText, meta: sysMeta };
            setMessages(prev => [...prev, sysMsg]);
            confirmationMsgId = sysId;
          }
        }
        // b) Here-doc tolerante a comillas
        if (!confirmationMsgId) {
          const HEREDOC = /cat\s*>\s*([^\s]+)\s*<<\s*['"]?EOF['"]?\s*\n([\s\S]*?)\nEOF/gm;
          const docs = [...cmd.matchAll(HEREDOC)];
          if (docs.length > 0) {
            const [, fileName, fileContent] = docs[0];
            await setLastFile(fileName, fileContent);
            const sysId = String(Date.now() + 5);
            const sysText = `El agente quiere crear el archivo '${fileName}'. ¿Deseas continuar?`;
            const sysMeta = {
              pendingFileCreation: { fileName, fileContent, command: cmd },
              summary: (res as any).summary,
              explanation: (res as any).explanation,
              userPrompt: trimmed,
            };
            const sysMsg: Message = { id: sysId, sender: 'system', text: sysText, meta: sysMeta };
            setMessages(prev => [...prev, sysMsg]);
            confirmationMsgId = sysId;
          }
        }
        // c) Comando simple
        if (!confirmationMsgId) {
          const sysId = String(Date.now() + 5);
          const sysText = 'El agente quiere ejecutar un comando para ' + ((res as any).summary || 'realizar una acción') + '.';
          const sysMeta = { pendingCommand: cmd, summary: (res as any).summary, explanation: (res as any).explanation, userPrompt: trimmed };
          const sysMsg: Message = { id: sysId, sender: 'system', text: sysText, meta: sysMeta };
          setMessages(prev => [...prev, sysMsg]);
          confirmationMsgId = sysId;
        }
      }

      // Construir texto visible y limpiarlo
      const displayText = ((res as any).summary ?? (res as any).explanation ?? (res as any).ai_response ?? '') || aiText;
      const displayTextClean = cleanText(displayText);

      // Limpiar meta
      const metaWithFlag: any = { ...(res as any) };
      const cleanedMeta = { ...metaWithFlag } as any;
      if (cleanedMeta.summary) cleanedMeta.summary = cleanText(cleanedMeta.summary);
      if (cleanedMeta.explanation) cleanedMeta.explanation = cleanText(cleanedMeta.explanation);
      if (cleanedMeta.ai_response) cleanedMeta.ai_response = cleanText(cleanedMeta.ai_response);

      // Si se creó confirmación, evitar duplicados en meta
      if (confirmationMsgId) {
        delete cleanedMeta.summary;
        delete cleanedMeta.explanation;
      }

      const aiMsg: Message = { id: String(Date.now() + 1), sender: 'ai', text: displayTextClean, meta: cleanedMeta };
      setMessages(prev => [...prev, aiMsg]);

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
        aria-live={isSending ? true : undefined}
        aria-busy={isSending ? true : undefined}
        onScroll={(e) => {
          const el = e.currentTarget as HTMLDivElement;
          setShowScrollToBottom(!isNearBottom(el));
        }}
      >
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.sender}`}>
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{msg.text}</pre>

            {msg.meta?.summary && (
              <div className="summary">{msg.meta.summary}</div>
            )}

            {msg.meta?.explanation && msg.meta.explanation !== msg.text && (
              <div className="explanation">{msg.meta.explanation}</div>
            )}

            {!msg.meta?.sentToTerminal && msg.meta?.code_output && (
              <pre className="code-output">{msg.meta.code_output}</pre>
            )}
            {/* Card: comando pendiente */}
            {msg.sender === 'system' && msg.meta?.pendingCommand && !msg.meta?.processed && (
              <div className="confirm-card">
                <div className="confirm-title">El agente sugiere ejecutar este comando</div>
                <pre className="code-block"><code>{String(msg.meta.pendingCommand || '').trim()}</code></pre>
                <div className="confirm-actions">
                  <button
                    className="btn confirm"
                    onClick={async () => {
                      try {
                        const toSend = String(msg.meta?.pendingCommand || '').trim();
                        await invoke('ssh_stdin', { id: sessionId, data: toSend + '\n' });
                        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, meta: { ...m.meta, processed: true } } : m));
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
                      } catch (e) {}
                    }}
                  >Ejecutar ahora</button>
                  <button
                    className="btn cancel"
                    onClick={() => {
                      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, meta: { ...m.meta, processed: true } } : m));
                    }}
                  >Cancelar</button>
                </div>
              </div>
            )}

            {/* Card: creación de archivo pendiente */}
            {msg.sender === 'system' && msg.meta?.pendingFileCreation && !msg.meta?.processed && (
              <div className="confirm-card">
                <div className="confirm-title">El agente quiere crear un archivo</div>
                <div className="confirm-subtitle">{String(msg.meta.pendingFileCreation.fileName || '')}</div>
                <pre className="code-block"><code>{msg.meta.pendingFileCreation.fileContent}</code></pre>
                <div className="confirm-actions">
                  <button
                    className="btn confirm"
                    onClick={async () => {
                      try {
                        const cmdToSend = String(msg.meta.pendingFileCreation.command || '');
                        await invoke('ssh_stdin', { id: sessionId, data: cmdToSend + '\n' });
                        setMessages(prev => prev.map(m => m.id === msg.id ? {
                          ...m,
                          text: `Archivo '${msg.meta!.pendingFileCreation!.fileName}' creado exitosamente.`,
                          meta: { ...m.meta, processed: true, pendingFileCreation: undefined }
                        } : m));
                        const name = String(msg.meta!.pendingFileCreation!.fileName as string);
                        await setLastFile(name, msg.meta!.pendingFileCreation!.fileContent as string);
                        try { await setLastPath(name, 'file'); } catch {}
                      } catch (e) {}
                    }}
                  >Ejecutar ahora</button>
                  <button
                    className="btn cancel"
                    onClick={() => {
                      setMessages(prev => prev.map(m => m.id === msg.id ? ({
                        ...m,
                        text: 'Creación de archivo cancelada por el usuario.',
                        meta: { ...m.meta, processed: true, pendingFileCreation: undefined }
                      }) : m));
                    }}
                  >Cancelar</button>
                </div>
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