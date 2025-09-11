// Panel de chat: integra modo ASK (explicar) y AGENT (sugerir/confirmar comandos).
import React, { useState } from 'react';
import './ChatPane.css';
import { invoke } from '@tauri-apps/api/core';

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
  const [memory, setMemory] = useState<{ lastFile?: string }>({});

  // Limpiar mensajes automáticamente al cambiar de modo
  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setMode(e.target.value as ChatMode);
    setMessages([]);
    setMemory({});
  };

  // No se envía stdin directo desde aquí: la ejecución ocurre en el TerminalPane.

  const handleNewChat = () => {
    setMessages([]);
    // clear ephemeral memory for this chat
    setMemory({});
  };

  // Enviar prompt al backend (Tauri -> ai_chat) y procesar respuesta
  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    // If the user input uses pronouns/commands and doesn't include a filename, try to inject context
    const pronounCmdRegex = /\b(ejecuta|ejecutalo|ejecutamelo|ejecuta\s+lo|borralo|borramelo|bórralo|elimínalo|ábrelo|abrelo|ejecutar|ejecutame)\b/i;
    const filenamePattern = /[\w\-.]+\.(py|sh|txt|md|json|js|ts)$/i;
    let finalInput = trimmed;
    if (pronounCmdRegex.test(trimmed) && !filenamePattern.test(trimmed)) {
      if (memory.lastFile) {
        finalInput = `${trimmed} (Contexto: me refiero al archivo '${memory.lastFile}')`;
      }
    }

    const userMsg: Message = { id: String(Date.now()), sender: 'user', text: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    try {
      const modeValue = mode === 'agent' ? 'AGENT' : 'ASK';
      // Call Tauri command ai_chat
      const res = await invoke<AiResponse>('ai_chat', {
        req: { user_input: finalInput, mode: modeValue }
      });

      // Debug: surface the raw AI response in the browser console to inspect fields
      try { console.log('ai_chat response', res); } catch (e) {}

  // Intentar detectar nombre de archivo creado (here-doc o explicación)
      try {
        // look for here-doc pattern in ai_response or explanation
        const aiResp = (res as any).ai_response ?? '';
        const expl = (res as any).explanation ?? '';
        const combined = `${aiResp}\n${expl}`;
        // regex to capture: cat > filename
        const m = combined.match(/cat\s*>\s*([^\s<\n]+)/i);
        if (m && m[1]) {
          setMemory(prev => ({ ...prev, lastFile: m[1].trim() }));
        } else {
          // try pattern from explanation like: Se creó el archivo 'name'
          const m2 = combined.match(/Se cre(ó|o) el archivo '?"?([^'"\s]+)'?"?/i);
          if (m2 && m2[2]) {
            setMemory(prev => ({ ...prev, lastFile: m2[2].trim() }));
          }
        }
      } catch (e) {
        // non-fatal
      }

  // Limpiar texto de respuesta quitando fences y rótulos redundantes
      const cleanText = (text: string) => {
        if (!text) return '';
        return text
          .replace(/```(bash|sh)?\s*|\s*```/g, '') // remove code block markers
          .replace(/Comando sugerido:\s*/gi, '')    // remove "Comando sugerido:" text
          .replace(/"""/g, '')                      // remove triple quotes
          .replace(/^[\s`]+|[\s`]+$/g, '')         // remove leading/trailing spaces and backticks
          .trim();
      };

      // Clean all response fields
      if ((res as any).summary) (res as any).summary = cleanText((res as any).summary);
      if ((res as any).explanation) (res as any).explanation = cleanText((res as any).explanation);
      if ((res as any).ai_response) (res as any).ai_response = cleanText((res as any).ai_response);

  // Visualización: en AGENT priorizar summary; en ASK usar explicación
      const aiText =
        mode === 'agent'
          ? ((res as any).summary ?? (res as any).explanation ?? (res as any).ai_response ?? '')
          : ((res as any).explanation ?? (res as any).ai_response ?? '');

  // Detectar comando en ai_response/explanation/summary o en el texto final
      const runPrefix = 'RUN_CMD:';
      let cmd: string | null = null;
      const candidates = [(res as any).ai_response, (res as any).explanation, (res as any).summary, aiText];
      for (const candidate of candidates) {
        if (!candidate) continue;
        const out = cleanText(candidate as string);
        if (out.includes(runPrefix)) {
          cmd = out.split(runPrefix)[1].trim();
          break;
        }
        // detect code blocks or first command-looking line
        const m = out.match(/(?:^|\n)\$?\s*([^\n]+)\n?/m);
        if (m && m[1]) {
          cmd = m[1].trim();
          break;
        }
      }

      let sentToTerminal = false;

  // En modo AGENT: generar mensaje de confirmación (comando o creación de archivo)
      let confirmationMsgId: string | null = null;
      if (mode === 'agent' && cmd) {
        const catMatch = cmd.match(/cat\s*>\s*([^\s]+)\s*<<\s*EOF\n([\s\S]+)\nEOF/);
        if (catMatch) {
          // This is a file creation command
          const [, fileName, fileContent] = catMatch;
          const sysId = String(Date.now() + 5);
          const sysText = `El agente quiere crear el archivo '${fileName}'. ¿Deseas continuar?`;
          const sysMeta = {
            pendingFileCreation: { fileName, fileContent, command: cmd },
            summary: (res as any).summary,
            explanation: (res as any).explanation,
          };
          const sysMsg: Message = { id: sysId, sender: 'system', text: sysText, meta: sysMeta };
          setMessages(prev => [...prev, sysMsg]);
          confirmationMsgId = sysId;
        } else {
          // This is a regular command execution
          const sysId = String(Date.now() + 5);
          const sysText = 'El agente quiere ejecutar un comando para ' + ((res as any).summary || 'realizar una acción') + '.';
          const sysMeta = { pendingCommand: cmd, summary: (res as any).summary, explanation: (res as any).explanation };
          const sysMsg: Message = { id: sysId, sender: 'system', text: sysText, meta: sysMeta };
          setMessages(prev => [...prev, sysMsg]);
          confirmationMsgId = sysId;
        }
      }

  // Si ya se había enviado a terminal (flujo previo), mostrar confirmación; si no, usar aiText
      const displayText = sentToTerminal
        ? ((res as any).summary ?? (res as any).explanation ?? 'Comando ejecutado en la terminal.')
        : aiText;

  // Incluir bandera sentToTerminal en meta para ajustar renderizado
      const metaWithFlag: any = { ...(res as any), sentToTerminal };
      // sanitize summary/ai_response to remove stray backticks and repetitive 'Comando sugerido:' artifacts
      try {
        if (metaWithFlag.summary && typeof metaWithFlag.summary === 'string') {
          let s: string = metaWithFlag.summary;
          s = s.replace(/```/g, '').replace(/`/g, '').trim();
          s = s.replace(/^Comando sugerido:\s*/i, '');
          if (s === '') delete metaWithFlag.summary; else metaWithFlag.summary = s;
        }
        if (metaWithFlag.ai_response && typeof metaWithFlag.ai_response === 'string') {
          let a: string = metaWithFlag.ai_response;
          a = a.replace(/```/g, '').replace(/`/g, '').trim();
          a = a.replace(/^Comando sugerido:\s*/i, '');
          if (a === '') delete metaWithFlag.ai_response; else metaWithFlag.ai_response = a;
        }
      } catch (e) { /* non-fatal */ }

  // Si se creó mensaje de confirmación, evita duplicar summary/explanation en el mensaje de IA
      if (confirmationMsgId) {
        try {
          if (metaWithFlag.summary) delete metaWithFlag.summary;
          if (metaWithFlag.explanation) delete metaWithFlag.explanation;
        } catch (e) { /* non-fatal */ }
      }

      const aiMsg: Message = { id: String(Date.now() + 1), sender: 'ai', text: displayText, meta: metaWithFlag };
      setMessages(prev => [...prev, aiMsg]);

    } catch (e: any) {
      setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `Error: ${String(e)}` }]);
    }
  };

  return (
    <div className="chat-pane">
      <div className="chat-header">
        <button onClick={handleNewChat}>New Chat</button>
        <select value={mode} onChange={handleModeChange}>
          <option value="ask">Ask Mode</option>
          <option value="agent">Agent Mode</option>
        </select>
        {/* No SSH session id field anymore */}
      </div>

      <div className="chat-messages">
        {messages.map((msg) => {
          // detect command candidates in AI response (si lo quieres usar luego)
          let cmdCandidate: string | null = null;
          if (msg.sender === 'ai') {
            const out = (msg.meta && msg.meta.ai_response) || msg.text || '';
            const runPrefix = 'RUN_CMD:';
            if (typeof out === 'string' && out.includes(runPrefix)) {
              cmdCandidate = out.split(runPrefix)[1].trim();
            } else if (typeof out === 'string') {
              const m =
                out.match(/```bash\s*([\s\S]*?)```/m) ||
                out.match(/```sh\s*([\s\S]*?)```/m) ||
                out.match(/(?:^|\n)\$?\s*([^\n]+)\n?/m);
              if (m && m[1]) cmdCandidate = m[1].trim();
            }
          }

          return (
            <div key={msg.id} className={`message ${msg.sender}`}>
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{msg.text}</pre>

              {/* Si existe un resumen corto, muéstralo */}
              {msg.meta?.summary && (
                <div className="summary">{msg.meta.summary}</div>
              )}

              {/* Mostrar explicación detallada si existe y no es igual al texto principal */}
              {msg.meta?.explanation && msg.meta.explanation !== msg.text && (
                <div className="explanation">{msg.meta.explanation}</div>
              )}

              {!msg.meta?.sentToTerminal && msg.meta?.code_output && (
                <pre className="code-output">{msg.meta.code_output}</pre>
              )}

              {/* Confirmation UI para comando pendiente */}
              {msg.sender === 'system' && msg.meta?.pendingCommand && !msg.meta?.processed && (
                <div
                  style={{
                    marginTop: 8,
                    padding: '12px',
                    backgroundColor: '#1a1a1a',
                    borderRadius: '6px',
                    border: '1px solid #333'
                  }}
                >
                  <p
                    style={{
                      margin: '0 0 8px 0',
                      color: '#e0e0e0',
                      fontSize: '14px'
                    }}
                  >
                    {msg.text}
                  </p>

                  <div
                    style={{
                      backgroundColor: '#2d2d2d',
                      padding: '10px',
                      borderRadius: '4px',
                      border: '1px solid #404040',
                      marginTop: '8px'
                    }}
                  >
                    <pre
                      style={{
                        margin: 0,
                        color: '#e0e0e0',
                        fontSize: '13px',
                        fontFamily: 'monospace'
                      }}
                    >
                      {msg.meta.pendingCommand}
                    </pre>
                  </div>

                  <p
                    style={{
                      margin: '12px 0',
                      color: '#e0e0e0',
                      fontSize: '14px'
                    }}
                  >
                    ¿Deseas ejecutar este comando en la terminal?
                  </p>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={async () => {
                        try {
                          await invoke('ssh_stdin', { id: sessionId, data: (msg.meta.pendingCommand as string) + '\n' });
                          setMessages(prev => prev.map(m => m.id === msg.id ? 
                            { ...m, text: 'Comando enviado a la terminal.', meta: { ...m.meta, processed: true } } : m
                          ));
                          setMessages(prev => {
                            const pending = msg.meta.pendingCommand as string;
                            let marked = false;
                            return prev.map(m => {
                              if (!marked && m.sender === 'ai' && m.meta) {
                                const out = (m.meta.ai_response as string) || (m.meta.summary as string) || m.text || '';
                                if (typeof out === 'string' && out.includes(pending)) {
                                  marked = true;
                                  return { ...m, meta: { ...m.meta, sentToTerminal: true } };
                                }
                              }
                              return m;
                            });
                          });
                        } catch (e: any) {
                          setMessages(prev => [
                            ...prev,
                            {
                              id: String(Date.now()),
                              sender: 'system',
                              text: `Error enviando a la terminal: ${String(e)}`
                            }
                          ]);
                        }
                      }}
                      className="send-button"
                    >
                      Confirmar
                    </button>
                    <button
                      onClick={() => {
                        setMessages(prev =>
                          prev.map(m =>
                            m.id === msg.id
                              ? { ...m, text: 'Comando cancelado por el usuario.', meta: { ...m.meta, processed: true } }
                              : m
                          )
                        );
                      }}
                      className="cancel-button"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* Confirmation UI para creación de archivo pendiente */}
              {msg.sender === 'system' && msg.meta?.pendingFileCreation && (
                <div style={{ marginTop: 8 }}>
                  <p>{msg.text}</p>
                  <p>Contenido del archivo:</p>
                  <pre className="code-output">{msg.meta.pendingFileCreation.fileContent}</pre>
                  <button
                    onClick={async () => {
                      try {
                        await invoke('ssh_stdin', { id: sessionId, data: (msg.meta.pendingFileCreation.command as string) + '\n' });
                        setMessages(prev =>
                          prev.map(m =>
                            m.id === msg.id
                              ? { ...m, text: `Archivo '${msg.meta.pendingFileCreation.fileName}' creado exitosamente.` }
                              : m
                          )
                        );
                      } catch (e: any) {
                        setMessages(prev => [
                          ...prev,
                          { id: String(Date.now()), sender: 'system', text: `Error creando el archivo: ${String(e)}` }
                        ]);
                      }
                    }}
                  >
                    Confirmar
                  </button>
                  <button
                    onClick={() => {
                      setMessages(prev =>
                        prev.map(m =>
                          m.id === msg.id
                            ? { ...m, text: 'Creación de archivo cancelada por el usuario.', meta: undefined }
                            : m
                        )
                      );
                    }}
                    style={{ marginLeft: 8 }}
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="chat-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask something..."
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
        />
        <button onClick={handleSend}>Send</button>
      </div>
    </div>
  );
};

export default ChatPane;