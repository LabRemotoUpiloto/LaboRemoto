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

    // Inyección de contexto: pronombres/errores sin mencionar archivo
    const pronounCmdRegex = /\b(ejecuta(|lo|me|r)|borra(|lo)|elim(ina|ínalo)|abre(|lo))\b/i;
    const needsContextRegex = /\b(error|falla|no\s+funciona|traceback|exception)\b/i;
    const filenamePattern = /[\w\-.]+\.(py|sh|txt|md|json|js|ts)$/i;

    let finalInput = trimmed;
    const mentionsFile = filenamePattern.test(trimmed) || (mem.lastFile && trimmed.includes(mem.lastFile));
    if ((pronounCmdRegex.test(trimmed) || needsContextRegex.test(trimmed)) && mem.lastFile && !mentionsFile) {
      finalInput += buildContextAppendix();
    }

    const userMsg: Message = { id: String(Date.now()), sender: 'user', text: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    try {
      setIsSending(true);
      const modeValue = mode === 'agent' ? 'AGENT' : 'ASK';
      const res = await invoke<AiResponse>('ai_chat', { req: { user_input: finalInput, mode: modeValue } });

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
                <pre className="code-block"><code>{(() => {
                  let preview = String(msg.meta.pendingCommand || '').trim();
                  const up: string = String(msg.meta?.userPrompt || '').toLowerCase();
                  const hasDir = mem.lastPath && mem.lastPathKind === 'dir';
                  const hasFile = mem.lastPath && mem.lastPathKind === 'file';
                  const implyThere = /(ah[ií]|ahi|all[ií]|alli|all[aá]|allá)/.test(up);
                  // Intent: salir del directorio
                  const wantsLeaveDir = /(sal|salte|salir|regresa|regresar|volver)\s+(del\s+)?directorio|\b(subir|sube)\b.*(nivel|carpeta)|\b(arriba|atr[aá]s)\b/.test(up);
                  const leaveOverride = wantsLeaveDir;
                  if (leaveOverride) {
                    preview = 'cd ..';
                  }
                  // Intent: entrar/ir al último directorio creado
                  const wantsEnterLastDir = /(entra|ingresa|ve|ir)\s+(al|a la)\s*(directorio|carpeta)\s+(que\s+)?(me\s+)?(creaste|reciente|[úu]ltim[oa])/.test(up)
                    || (/(ve|ir)\s+(ah[ií]|ahi|all[ií]|alli|all[aá]|allá)/.test(up) && hasDir);
                  if (hasDir && wantsEnterLastDir) {
                    preview = `cd ${mem.lastPath}`;
                  }
                  // Intent: abrir/editar último archivo recordado
                  const srcFile = hasFile ? mem.lastPath! : (mem.lastFile ?? undefined);
                  const wantsOpen = /(abre|[áa]brelo|mostrar|muestra|ver)\b/.test(up);
                  const wantsEdit = /(edita|editar|ed[íi]talo|modifica|modificar)\b/.test(up);
                  if (srcFile && wantsEdit) {
                    preview = `nano ${srcFile}`;
                  } else if (srcFile && wantsOpen) {
                    preview = `cat ${srcFile}`;
                  }
                  // Intent: renombrar último archivo: "renómbralo como X" / "cámbiale el nombre a X"
                  const mRename = up.match(/(?:renombr[^\s]*|c[áa]mbiale?\s+el\s+nombre(?:\s+(?:a|por))?)\s+(\S+)/);
                  if (srcFile && mRename && mRename[1]) {
                    const newName = mRename[1];
                    const norm = srcFile.replace(/\\/g, '/');
                    const dir = norm.includes('/') ? norm.replace(/[^\/]+$/, '') : '';
                    const dst = dir ? `${dir}${newName}` : newName;
                    preview = `mv ${srcFile} ${dst}`;
                  }
                  // Intent: mover/copiar todo "ahí"
                  const wantsMoveAll = /(muev[ea]|mover|mu[ée]velo|traslada|lleva)\s+(todo|los\s+archivos|el\s+contenido|contenido)/.test(up);
                  const wantsCopyAll = /(copi[ae]|copiar|c[óo]pialo)\s+(todo|los\s+archivos|el\s+contenido|contenido)/.test(up);
                  if (hasDir && (wantsMoveAll || wantsCopyAll) && (implyThere || /(en|hacia)\s+(el|la)?\s*(directorio|carpeta)\s+(que\s+)?(me\s+)?(creaste|reciente|[úu]ltim[oa])/.test(up))) {
                    preview = wantsCopyAll ? `cp -r * ${mem.lastPath}` : `mv * ${mem.lastPath}`;
                  }
                  // cd autocorrección
                  if (!leaveOverride && /^cd\s+\S+/.test(preview) && hasDir) {
                    preview = preview.replace(/^(cd)\s+(\S+)/, (_m, c, arg) => {
                      if (arg === '.' || arg === '..' || arg === '-') return `${c} ${arg}`;
                      return `${c} ${mem.lastPath}`;
                    });
                  }
                  // rm / rmdir autocorrección
                  if (/^(rm|rmdir)\b/.test(preview) && mem.lastPath) {
                    preview = hasDir ? `rm -rf ${mem.lastPath}` : `rm ${mem.lastPath}`;
                  }
                  // editores/ver contenido: vim, nano, less, cat, tail
                  if (/^(vim|nano|less|cat|tail)\b/.test(preview) && mem.lastPath) {
                    const m = preview.match(/^(vim|nano|less|cat|tail)\b/);
                    if (m) preview = `${m[1]} ${mem.lastPath}`;
                  }
                  // mv/cp completar con memoria y pronombres
                  if (/^(mv|cp)\b/.test(preview)) {
                    const tokens = preview.split(/\s+/);
                    const cmdName = tokens[0];
                    const args = tokens.slice(1);
                    if (args.length === 1 && hasDir && implyThere) {
                      preview = `${cmdName} ${args[0]} ${mem.lastPath}`;
                    } else if (args.length === 1 && (mem.lastPath || mem.lastFile)) {
                      const src = hasFile ? mem.lastPath! : (mem.lastFile ?? args[0]);
                      const dst = hasDir ? mem.lastPath! : args[0];
                      preview = `${cmdName} ${src} ${dst}`;
                    }
                  }
                  // Crear archivo dentro del dir recordado si el prompt lo indica
                  const wantsInCreatedDir = /(en|dentro de|ponlo en|col[óo]calo en|m[ée]telo en|gu[áa]rdalo en)\s+(el|la)?\s*(directorio|carpeta|dir|direc[^\s]*rio)\s+(que\s+)?(me\s+)?(creaste|cre[ó]s|acabamos?\s+de\s+crear|reciente|[úu]ltim[oa])/.test(up) || /(ah[ií]|ahi|all[ií]|alli|all[aá]|allá)/.test(up);
                  if (hasDir && wantsInCreatedDir) {
                    // mkdir nombre
                    if (/^mkdir\s+\S+/.test(preview)) {
                      preview = preview.replace(/^mkdir\s+(\S+)/, (_m, d) => {
                        const isAbs = d.startsWith('/') || d.startsWith('./') || d.startsWith('../');
                        if (isAbs) return `mkdir ${d}`;
                        return mem.lastPath!.endsWith('/') ? `mkdir ${mem.lastPath}${d}` : `mkdir ${mem.lastPath}/${d}`;
                      });
                    }
                    if (/^touch\s+\S+/.test(preview)) {
                      preview = preview.replace(/^touch\s+(\S+)/, (_m, f) => mem.lastPath!.endsWith('/') ? `touch ${mem.lastPath}${f}` : `touch ${mem.lastPath}/${f}`);
                    }
                    if (/(>|>>)/.test(preview)) {
                      preview = preview.replace(/(>\>?\s*)([^\s]+)/, (_m, op, f) => {
                        const isAbs = f.startsWith('/') || f.startsWith('./') || f.startsWith('../');
                        if (isAbs) return `${op}${f}`;
                        return mem.lastPath!.endsWith('/') ? `${op}${mem.lastPath}${f}` : `${op}${mem.lastPath}/${f}`;
                      });
                    }
                    if (/^cat\s+>\s*\S+\s*<</.test(preview)) {
                      preview = preview.replace(/^(cat\s+>\s*)(\S+)(\s*<\<)/, (_m, p1, f, p3) => {
                        const isAbs = f.startsWith('/') || f.startsWith('./') || f.startsWith('../');
                        const joined = isAbs ? f : (mem.lastPath!.endsWith('/') ? `${mem.lastPath}${f}` : `${mem.lastPath}/${f}`);
                        return `${p1}${joined}${p3}`;
                      });
                    }
                    if (/^tee\s+\S+\s*<</.test(preview)) {
                      preview = preview.replace(/^(tee\s+)(\S+)(\s*<\<)/, (_m, p1, f, p3) => {
                        const isAbs = f.startsWith('/') || f.startsWith('./') || f.startsWith('../');
                        const joined = isAbs ? f : (mem.lastPath!.endsWith('/') ? `${mem.lastPath}${f}` : `${mem.lastPath}/${f}`);
                        return `${p1}${joined}${p3}`;
                      });
                    }
                  }
                  return preview;
                })()}</code></pre>
                <div className="confirm-actions">
                  <button
                    className="btn confirm"
                    onClick={async () => {
                      try {
                        let toSend = String(msg.meta?.pendingCommand || '').trim();
                        const up: string = String(msg.meta?.userPrompt || '').toLowerCase();
                        const hasDir = mem.lastPath && mem.lastPathKind === 'dir';
                        const hasFile = mem.lastPath && mem.lastPathKind === 'file';
                        const implyThere = /(ah[ií]|ahi|all[ií]|alli|all[aá]|allá)/.test(up);
                        // 1) Comandos derivados del intent del usuario (sin depender del comando sugerido)
                        // Salir del directorio actual
                        const wantsLeaveDir = /(sal|salte|salir|regresa|regresar|volver)\s+(del\s+)?directorio|\b(subir|sube)\b.*(nivel|carpeta)|\b(arriba|atr[aá]s)\b/.test(up);
                        const leaveOverride = wantsLeaveDir;
                        if (leaveOverride) {
                          toSend = 'cd ..';
                        }
                        // Entrar/ir al último directorio creado
                        const wantsEnterLastDir = /(entra|ingresa|ve|ir)\s+(al|a la)\s*(directorio|carpeta)\s+(que\s+)?(me\s+)?(creaste|reciente|[úu]ltim[oa])/.test(up) || (/(ve|ir)\s+(ah[ií]|ahi|all[ií]|alli|all[aá]|allá)/.test(up) && hasDir);
                        if (hasDir && wantsEnterLastDir) {
                          toSend = `cd ${mem.lastPath}`;
                        }
                        // Abrir/editar último archivo recordado
                        const srcFile = hasFile ? mem.lastPath! : (mem.lastFile ?? undefined);
                        const wantsOpen = /(abre|[áa]brelo|mostrar|muestra|ver)\b/.test(up);
                        const wantsEdit = /(edita|editar|ed[íi]talo|modifica|modificar)\b/.test(up);
                        if (srcFile && wantsEdit) {
                          toSend = `nano ${srcFile}`;
                        } else if (srcFile && wantsOpen) {
                          toSend = `cat ${srcFile}`;
                        }
                        // Renombrar último archivo: "renómbralo como X" / "cámbiale el nombre a X"
                        const mRename = up.match(/(?:renombr[^\s]*|c[áa]mbiale?\s+el\s+nombre(?:\s+(?:a|por))?)\s+(\S+)/);
                        if (srcFile && mRename && mRename[1]) {
                          const newName = mRename[1];
                          const norm = srcFile.replace(/\\/g, '/');
                          const dir = norm.includes('/') ? norm.replace(/[^\/]+$/, '') : '';
                          const dst = dir ? `${dir}${newName}` : newName;
                          toSend = `mv ${srcFile} ${dst}`;
                        }
                        // Mover/copiar todo "ahí"
                        const wantsMoveAll = /(muev[ea]|mover|mu[ée]velo|traslada|lleva)\s+(todo|los\s+archivos|el\s+contenido|contenido)/.test(up);
                        const wantsCopyAll = /(copi[ae]|copiar|c[óo]pialo)\s+(todo|los\s+archivos|el\s+contenido|contenido)/.test(up);
                        if (hasDir && (wantsMoveAll || wantsCopyAll) && (implyThere || /(en|hacia)\s+(el|la)?\s*(directorio|carpeta)\s+(que\s+)?(me\s+)?(creaste|reciente|[úu]ltim[oa])/.test(up))) {
                          toSend = wantsCopyAll ? `cp -r * ${mem.lastPath}` : `mv * ${mem.lastPath}`;
                        }
                        // Autocorregir 'cd <algo>'
                        if (!leaveOverride && /^cd\s+\S+/.test(toSend) && hasDir) {
                          toSend = toSend.replace(/^(cd)\s+(\S+)/, (_m, c, arg) => {
                            if (arg === '.' || arg === '..' || arg === '-') return `${c} ${arg}`;
                            return `${c} ${mem.lastPath}`;
                          });
                        }
                        // Autocorregir rm/rmdir con lastPath
                        if (/^(rm|rmdir)\b/.test(toSend) && mem.lastPath) {
                          toSend = hasDir ? `rm -rf ${mem.lastPath}` : `rm ${mem.lastPath}`;
                        }
                        // Autocorregir editores (vim/nano/less/cat/tail)
                        if (/^(vim|nano|less|cat|tail)\b/.test(toSend) && mem.lastPath) {
                          const m = toSend.match(/^(vim|nano|less|cat|tail)\b/);
                          if (m) toSend = `${m[1]} ${mem.lastPath}`;
                        }
                        // Autocorregir mv/cp según pronombres y memoria
                        if (/^(mv|cp)\b/.test(toSend)) {
                          const tokens = toSend.split(/\s+/);
                          const cmdName = tokens[0];
                          const args = tokens.slice(1);
                          // Si falta destino pero hay lastPath dir y el prompt dice 'ahí', úsalo como destino
                          if (args.length === 1 && hasDir && implyThere) {
                            toSend = `${cmdName} ${args[0]} ${mem.lastPath}`;
                          }
                          // Si falta origen pero hay lastFile/lastPath file, úsalo como origen
                          else if (args.length === 1 && (mem.lastPath || mem.lastFile)) {
                            const src = hasFile ? mem.lastPath! : (mem.lastFile ?? args[0]);
                            // si args[0] parece destino (p.ej. termina en '/') o prompt dice ahí y tenemos dir
                            const dst = hasDir ? mem.lastPath! : args[0];
                            toSend = `${cmdName} ${src} ${dst}`;
                          }
                        }
                        // 2) Crear archivo "en el directorio que me creaste":
                        //    Si el prompt lo indica y hay lastPath dir, forzar destino dentro de esa carpeta.
                        const wantsInCreatedDir = /(en|dentro de|ponlo en|col[óo]calo en|m[ée]telo en|gu[áa]rdalo en)\s+(el|la)?\s*(directorio|carpeta|dir|direc[^\s]*rio)\s+(que\s+)?(me\s+)?(creaste|cre[ó]s|acabamos?\s+de\s+crear|reciente|[úu]ltim[oa])/.test(up)
                          || /(ah[ií]|ahi|all[ií]|alli|all[aá]|allá)/.test(up);
                        if (hasDir && wantsInCreatedDir) {
                          // mkdir nombre
                          if (/^mkdir\s+\S+/.test(toSend)) {
                            toSend = toSend.replace(/^mkdir\s+(\S+)/, (_m, d) => {
                              const isAbs = d.startsWith('/') || d.startsWith('./') || d.startsWith('../');
                              if (isAbs) return `mkdir ${d}`;
                              const joined = mem.lastPath!.endsWith('/') ? `${mem.lastPath}${d}` : `${mem.lastPath}/${d}`;
                              return `mkdir ${joined}`;
                            });
                          }
                          // touch filename
                          if (/^touch\s+\S+/.test(toSend)) {
                            toSend = toSend.replace(/^touch\s+(\S+)/, (_m, f) => {
                              const joined = mem.lastPath!.endsWith('/') ? `${mem.lastPath}${f}` : `${mem.lastPath}/${f}`;
                              return `touch ${joined}`;
                            });
                          }
                          // echo/printf ... > filename  (also >>)
                          if (/(>|>>)/.test(toSend)) {
                            toSend = toSend.replace(/(>\>?\s*)([^\s]+)/, (_m, op, f) => {
                              // do not change if absolute path
                              const isAbs = f.startsWith('/') || f.startsWith('./') || f.startsWith('../');
                              if (isAbs) return `${op}${f}`;
                              const joined = mem.lastPath!.endsWith('/') ? `${mem.lastPath}${f}` : `${mem.lastPath}/${f}`;
                              return `${op}${joined}`;
                            });
                          }
                          // cat > filename << EOF (heredoc)
                          if (/^cat\s+>\s*\S+\s*<</.test(toSend)) {
                            toSend = toSend.replace(/^(cat\s+>\s*)(\S+)(\s*<\<)/, (_m, p1, f, p3) => {
                              const isAbs = f.startsWith('/') || f.startsWith('./') || f.startsWith('../');
                              const joined = isAbs ? f : (mem.lastPath!.endsWith('/') ? `${mem.lastPath}${f}` : `${mem.lastPath}/${f}`);
                              return `${p1}${joined}${p3}`;
                            });
                          }
                          // tee filename << EOF
                          if (/^tee\s+\S+\s*<</.test(toSend)) {
                            toSend = toSend.replace(/^(tee\s+)(\S+)(\s*<\<)/, (_m, p1, f, p3) => {
                              const isAbs = f.startsWith('/') || f.startsWith('./') || f.startsWith('../');
                              const joined = isAbs ? f : (mem.lastPath!.endsWith('/') ? `${mem.lastPath}${f}` : `${mem.lastPath}/${f}`);
                              return `${p1}${joined}${p3}`;
                            });
                          }
                        }
                        await invoke('ssh_stdin', { id: sessionId, data: toSend + '\n' });
                        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, meta: { ...m.meta, processed: true } } : m));
                        await setLastCommand(toSend);
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
                <div className="confirm-subtitle">{(() => {
                  const up: string = String(msg.meta?.userPrompt || '').toLowerCase();
                  const hasDir = mem.lastPath && mem.lastPathKind === 'dir';
                  const wantsInCreatedDir = /(en|dentro de|ponlo en|col[óo]calo en|m[ée]telo en|gu[áa]rdalo en)\s+(el|la)?\s*(directorio|carpeta|dir|direc[^\s]*rio)\s+(que\s+)?(me\s+)?(creaste|cre[ó]s|acabamos?\s+de\s+crear|reciente|[úu]ltim[oa])/.test(up)
                    || /(ah[ií]|ahi|all[ií]|alli|all[aá]|allá)/.test(up);
                  const name = String(msg.meta.pendingFileCreation.fileName || '');
                  if (hasDir && wantsInCreatedDir) {
                    return mem.lastPath!.endsWith('/') ? `${mem.lastPath}${name}` : `${mem.lastPath}/${name}`;
                  }
                  return name;
                })()}</div>
                <pre className="code-block"><code>{msg.meta.pendingFileCreation.fileContent}</code></pre>
                <div className="confirm-actions">
                  <button
                    className="btn confirm"
                    onClick={async () => {
                      try {
                        let cmdToSend = String(msg.meta.pendingFileCreation.command || '');
                        const up: string = String(msg.meta?.userPrompt || '').toLowerCase();
                        const hasDir = mem.lastPath && mem.lastPathKind === 'dir';
                        const wantsInCreatedDir = /(en|dentro de|ponlo en|col[óo]calo en|m[ée]telo en|gu[áa]rdalo en)\s+(el|la)?\s*(directorio|carpeta|dir|direc[^\s]*rio)\s+(que\s+)?(me\s+)?(creaste|cre[ó]s|acabamos?\s+de\s+crear|reciente|[úu]ltim[oa])/.test(up)
                          || /(ah[ií]|ahi|all[ií]|alli|all[aá]|allá)/.test(up);
                        if (hasDir && wantsInCreatedDir) {
                          const p = String(mem.lastPath);
                          const cdPart = p.startsWith('~') ? `cd ${p}` : (p.includes(' ') ? `cd "${p}"` : `cd ${p}`);
                          cmdToSend = `${cdPart} && ${cmdToSend}`;
                        }
                        await invoke('ssh_stdin', { id: sessionId, data: cmdToSend + '\n' });
                        setMessages(prev => prev.map(m => m.id === msg.id ? {
                          ...m,
                          text: `Archivo '${msg.meta!.pendingFileCreation!.fileName}' creado exitosamente.`,
                          meta: { ...m.meta, processed: true, pendingFileCreation: undefined }
                        } : m));
                        const effectiveName = (() => {
                          const name = String(msg.meta!.pendingFileCreation!.fileName as string);
                          if (hasDir && wantsInCreatedDir) {
                            return mem.lastPath!.endsWith('/') ? `${mem.lastPath}${name}` : `${mem.lastPath}/${name}`;
                          }
                          return name;
                        })();
                        await setLastFile(effectiveName, msg.meta!.pendingFileCreation!.fileContent as string);
                        try { await setLastPath(effectiveName, 'file'); } catch {}
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