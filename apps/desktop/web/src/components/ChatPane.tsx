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

  // No SSH session input in this pane anymore; running commands must be done via the terminal/SSH pane.

  const handleNewChat = () => {
    setMessages([]);
    // clear ephemeral memory for this chat
    setMemory({});
  };

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

      // Try to detect created filename from response (here-doc or explanation)
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

      // For display: only use summary when in Agent mode; Ask mode should show normal explanation.
      const aiText =
        mode === 'agent'
          ? ((res as any).summary ?? (res as any).explanation ?? (res as any).ai_response ?? '')
          : ((res as any).explanation ?? (res as any).ai_response ?? '');

      // Detect command in ai_response, explanation, summary, or aiText (detection independent of display)
      const runPrefix = 'RUN_CMD:';
      let cmd: string | null = null;
      const candidates = [(res as any).ai_response, (res as any).explanation, (res as any).summary, aiText];
      for (const candidate of candidates) {
        if (!candidate) continue;
        const out = candidate as string;
        if (out.includes(runPrefix)) { cmd = out.split(runPrefix)[1].trim(); break; }
        // detect code blocks or first command-looking line
        const m =
          out.match(/```bash\s*([\s\S]*?)```/m) ||
          out.match(/```sh\s*([\s\S]*?)```/m) ||
          out.match(/(?:^|\n)\$?\s*([^\n]+)\n?/m);
        if (m && m[1]) { cmd = m[1].trim(); break; }
      }

      let sentToTerminal = false;

      // If in Agent mode and we have a session + detected command, create a confirmation message
      let confirmationMsgId: string | null = null;
      if (mode === 'agent' && cmd) {
        // do NOT auto-send; instead ask the user to confirm
        const sysId = String(Date.now() + 5);
        const sysText = 'Se ha generado un comando. Confirma si deseas ejecutarlo en la terminal.';
        const sysMeta = { pendingCommand: cmd, summary: (res as any).summary, explanation: (res as any).explanation };
        const sysMsg: Message = { id: sysId, sender: 'system', text: sysText, meta: sysMeta };
        setMessages(prev => [...prev, sysMsg]);
        confirmationMsgId = sysId;
      }

      // If we had already sent to terminal (older flow) keep behavior; otherwise displayText is aiText
      const displayText = sentToTerminal
        ? ((res as any).summary ?? (res as any).explanation ?? 'Comando ejecutado en la terminal.')
        : aiText;

      // include sentToTerminal flag in meta so the renderer can hide the code/run UI
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

      // If we created a confirmation system message, avoid repeating summary/explanation in the AI message
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
        <select value={mode} onChange={(e) => setMode(e.target.value as ChatMode)}>
          <option value="ask">Ask Mode</option>
          <option value="agent">Agent Mode</option>
        </select>
        {/* No SSH session id field anymore */}
      </div>
      <div className="chat-messages">
        {messages.map((msg) => {
          // detect command candidates in AI response
          let cmdCandidate: string | null = null;
          if (msg.sender === 'ai') {
            const out = (msg.meta && msg.meta.ai_response) || msg.text || '';
            const runPrefix = 'RUN_CMD:';
            if (out.includes(runPrefix)) {
              cmdCandidate = out.split(runPrefix)[1].trim();
            } else {
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
              {/* If a short summary exists, show it prominently */}
              {msg.meta && msg.meta.summary && (
                <div className="summary">{msg.meta.summary}</div>
              )}
              {/* always show the detailed explanation if present */}
              {msg.meta && msg.meta.explanation && msg.meta.explanation !== msg.text && (
                <div className="explanation">{msg.meta.explanation}</div>
              )}
              {!msg.meta?.sentToTerminal && msg.meta && msg.meta.code_output && (
                <pre className="code-output">{msg.meta.code_output}</pre>
              )}
              {!msg.meta?.sentToTerminal && cmdCandidate && mode === 'agent' && (
                <div style={{ marginTop: 8 }}>
                  <button onClick={async () => {
                    try {
                      // copy the command to clipboard so the user can paste it in their SSH pane/terminal
                      await navigator.clipboard.writeText(cmdCandidate!);
                      setMessages(prev => [...prev, {
                        id: String(Date.now()),
                        sender: 'system',
                        text: `Comando copiado al portapapeles: ${cmdCandidate}`
                      }]);
                    } catch (e: any) {
                      setMessages(prev => [...prev, {
                        id: String(Date.now()),
                        sender: 'system',
                        text: `Error copiando al portapapeles: ${String(e)}`
                      }]);
                    }
                  }}>Run (copy)</button>
                </div>
              )}

              {/* Confirmation UI for pending commands created by the agent */}
              {msg.sender === 'system' && msg.meta && (msg.meta.pendingCommand) && (
                <div style={{ marginTop: 8 }}>
                  <button onClick={async () => {
                    // Confirm: send the pending command to the terminal
                    try {
                      await invoke('ssh_stdin', { id: sessionId, data: (msg.meta.pendingCommand as string) + '\n' });
                      // update the system message to reflect confirmation
                      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, text: 'Comando enviado a la terminal.' } : m));
                      // mark the last AI message that referenced this pendingCommand as sentToTerminal so its run UI hides
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
                      setMessages(prev => [...prev, { id: String(Date.now()), sender: 'system', text: `Error enviando a la terminal: ${String(e)}` }]);
                    }
                  }}>Confirmar</button>
                  <button
                    onClick={() => {
                      // Cancel: remove the pendingCommand from the system message
                      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, text: 'Ejecución cancelada por el usuario.', meta: undefined } : m));
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
