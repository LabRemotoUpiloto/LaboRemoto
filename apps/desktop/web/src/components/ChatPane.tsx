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
    let lastIndex = 0; let m: RegExpExecArray | null;
    while ((m = fenceRe.exec(content)) !== null) {
      if (m.index > lastIndex) {
        blocks.push({ type: 'para', body: content.slice(lastIndex, m.index) });
      }
      blocks.push({ type: 'code', lang: (m[1] || '').trim() || undefined, body: (m[2] || '').replace(/\n$/,'') });
      lastIndex = fenceRe.lastIndex;
    }
    if (lastIndex < content.length) blocks.push({ type: 'para', body: content.slice(lastIndex) });

    // Simple formatting for headings and lists
    const renderPara = (txt: string) => {
      const lines = txt.split(/\r?\n/);
      const nodes: React.ReactNode[] = [];
      let buf: string[] = [];
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
          nodes.push(<Tag key={`h-${nodes.length}`}>{text}</Tag>);
          continue;
        }
        // Bulleted list
        const li = line.match(/^\s*[-*]\s+(.*)$/);
        if (li) {
          // Start or continue a list
          const last = nodes[nodes.length - 1] as any;
          if (!last || (last.type !== 'ul')) {
            nodes.push(React.createElement('ul', { key: `ul-${nodes.length}` }, [React.createElement('li', { key: `li-${nodes.length}-0` }, li[1])]));
          } else {
            (last.props.children as any[]).push(React.createElement('li', { key: `li-${nodes.length}-${(last.props.children as any[]).length}` }, li[1]));
          }
          continue;
        }
        // Ordered list (1., 2., ...)
        const oli = line.match(/^\s*\d+\)\s+(.*)$|^\s*\d+\.\s+(.*)$/);
        if (oli) {
          const text = oli[1] || oli[2] || '';
          const last = nodes[nodes.length - 1] as any;
          if (!last || (last.type !== 'ol')) {
            nodes.push(React.createElement('ol', { key: `ol-${nodes.length}` }, [React.createElement('li', { key: `oli-${nodes.length}-0` }, text)]));
          } else {
            (last.props.children as any[]).push(React.createElement('li', { key: `oli-${nodes.length}-${(last.props.children as any[]).length}` }, text));
          }
          continue;
        }
        buf.push(line);
      }
      flush();
      return nodes;
    };

    const onCopy = async (text: string, btn: HTMLButtonElement | null) => {
      let ok = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          ok = true;
        }
      } catch { /* noop */ }
      if (!ok) {
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          ok = document.execCommand('copy');
          document.body.removeChild(ta);
        } catch { ok = false; }
      }
      if (btn) {
        const prev = btn.textContent;
        btn.textContent = ok ? 'Copiado' : 'Error';
        btn.disabled = true;
        setTimeout(() => { btn.textContent = prev || 'Copiar'; btn.disabled = false; }, 1200);
      }
    };

    return (
      <div>
        {blocks.map((b, i) => b.type === 'code' ? (
          <div className="copyable-block" key={`c-${i}`}>
            <button
              className="copy-btn"
              onClick={(e) => onCopy(b.body, e.currentTarget)}
              aria-label="Copiar código"
              type="button"
            >Copiar</button>
            <pre><code>{b.body}</code></pre>
          </div>
        ) : (
          <div key={`p-${i}`}>{renderPara(b.body)}</div>
        ))}
      </div>
    );
  };

  // Renderizado para AGENT: igual a RenderAsk pero el botón ejecuta en terminal
  // Importante: el componente se memoiza para mantener su identidad entre renders
  const RenderAgent = React.useMemo(() => {
    const Comp: React.FC<{ content: string; sessionId?: string | null; onExecuted?: (cmd: string) => void; cacheKey?: string }>
      = ({ content, sessionId, onExecuted, cacheKey }) => {
      // Persistir estado por mensaje para no perder progreso en re-renders
      const getStore = (): Record<string, boolean> => {
        try {
          const g: any = (window as any);
          if (!g.__agentProgress) g.__agentProgress = {};
          return g.__agentProgress[cacheKey || content] || {};
        } catch { return {}; }
      };
      const saveStore = (obj: Record<string, boolean>) => {
        try {
          const g: any = (window as any);
          if (!g.__agentProgress) g.__agentProgress = {};
          g.__agentProgress[cacheKey || content] = obj;
        } catch {}
      };
  const [executed, setExecuted] = useState<Record<string, boolean>>(() => getStore());
  const runningRef = useRef(false);
      useEffect(() => { saveStore(executed); }, [executed]);
    // reutilizar el parser de RenderAsk
    const blocks: Array<{ type: 'code' | 'para'; lang?: string; body: string }> = [];
    const fenceRe = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    let lastIndex = 0; let m: RegExpExecArray | null;
    while ((m = fenceRe.exec(content)) !== null) {
      if (m.index > lastIndex) {
        blocks.push({ type: 'para', body: content.slice(lastIndex, m.index) });
      }
      blocks.push({ type: 'code', lang: (m[1] || '').trim() || undefined, body: (m[2] || '').replace(/\n$/, '') });
      lastIndex = fenceRe.lastIndex;
    }
    if (lastIndex < content.length) blocks.push({ type: 'para', body: content.slice(lastIndex) });

    const renderPara = (txt: string) => {
      const lines = txt.split(/\r?\n/);
      const nodes: React.ReactNode[] = [];
      let buf: string[] = [];
      const flush = () => { if (buf.length) { nodes.push(<p key={`p-${nodes.length}`}>{buf.join('\n')}</p>); buf = []; } };
      for (const raw of lines) {
        const line = raw.replace(/\s+$/, '');
        if (/^\s*$/.test(line)) { flush(); continue; }
        const h = line.match(/^(#{1,4})\s+(.*)$/);
        if (h) { flush(); const level = h[1].length; const text = h[2]; const Tag = (`h${Math.min(4, level)}` as any); nodes.push(<Tag key={`h-${nodes.length}`}>{text}</Tag>); continue; }
        const li = line.match(/^\s*[-*]\s+(.*)$/);
        if (li) { const last = nodes[nodes.length - 1] as any; if (!last || (last.type !== 'ul')) { nodes.push(React.createElement('ul', { key: `ul-${nodes.length}` }, [React.createElement('li', { key: `li-${nodes.length}-0` }, li[1]) ])); } else { (last.props.children as any[]).push(React.createElement('li', { key: `li-${nodes.length}-${(last.props.children as any[]).length}` }, li[1])); } continue; }
        const oli = line.match(/^\s*\d+\)\s+(.*)$|^\s*\d+\.\s+(.*)$/);
        if (oli) { const text = oli[1] || oli[2] || ''; const last = nodes[nodes.length - 1] as any; if (!last || (last.type !== 'ol')) { nodes.push(React.createElement('ol', { key: `ol-${nodes.length}` }, [React.createElement('li', { key: `oli-${nodes.length}-0` }, text)])); } else { (last.props.children as any[]).push(React.createElement('li', { key: `oli-${nodes.length}-${(last.props.children as any[]).length}` }, text)); } continue; }
        buf.push(line);
      }
      flush();
      return nodes;
    };

    // Obtiene el primer comando atómico (una sola instrucción) respetando comillas; no divide pipelines ni heredocs
    const getFirstAtomic = (s: string): string => {
      const src = (s || '').trim();
      if (!src) return '';
      if (/<<\s*['"]?EOF['"]?/m.test(src)) return src; // here-doc completo como atómico
      // Unir continuaciones \\ y tomar solo la primera línea significativa
      const join = src.replace(/\\\r?\n/g, ' ');
      let cur = '';
      let q: '"' | "'" | '`' | null = null;
      for (let i = 0; i < join.length; i++) {
        const ch = join[i];
        const next = join[i + 1];
        if (q) { cur += ch; if (ch === q) q = null; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { q = ch as any; cur += ch; continue; }
        if ((ch === '&' && next === '&') || (ch === '|' && next === '|') || ch === ';' || ch === '\n') {
          // cortar al encontrar &&, ||, ; o salto de línea (pero no cortar en '|')
          if (cur.trim()) break; else { i++; continue; }
        }
        if (ch === '#') break; // comentario
        cur += ch;
      }
      const first = (cur || join).split(/\r?\n/)[0].trim();
      return first;
    };

    const onRun = async (text: string, btn: HTMLButtonElement | null, key?: string) => {
      const cmdRaw = (text || '').trim();
      if (!cmdRaw) return;
      const toExec = getFirstAtomic(cmdRaw);
      if (!toExec) return;
  const markDone = () => { if (key) setExecuted(prev => { const n = { ...prev, [key!]: true }; return n; }); };
  const undoDone = () => { if (key) setExecuted(prev => { const n = { ...prev }; delete n[key!]; return n; }); };
      if (runningRef.current) return; // evita ejecuciones múltiples
      runningRef.current = true;
      if (btn) {
        btn.disabled = true; const prev = btn.textContent; btn.textContent = 'Ejecutando…';
        // Optimista: avanza el paso inmediatamente
        markDone();
        try {
          await invoke('ssh_stdin', { id: sessionId, data: toExec + '\n' });
          if (onExecuted) onExecuted(toExec);
          btn.textContent = 'Ejecutado';
        } catch (e) {
          // Revertir si falló
          undoDone();
          btn.textContent = 'Error';
        } finally {
          setTimeout(() => { if (btn) { btn.textContent = prev || 'Ejecutar'; btn.disabled = false; } runningRef.current = false; }, 300);
        }
      } else {
        markDone();
        try {
          await invoke('ssh_stdin', { id: sessionId, data: toExec + '\n' });
          if (onExecuted) onExecuted(toExec);
        } catch {
          undoDone();
        } finally { runningRef.current = false; }
      }
    };
    // Detecta si el bloque representa pasos independientes (no scripts complejos)
    const splitIntoSteps = (code: string): string[] | null => {
      const txt0 = (code || '').trim();
      if (!txt0) return null;
      // Evitar dividir here-docs o estructuras de control/funciones
      if (/<<\s*['"]?EOF['"]?/m.test(txt0)) return null;
      if (/[{}]/.test(txt0)) return null;
      if (/^\s*(if|for|while|case|function)\b/m.test(txt0)) return null;

      // Unir líneas con continuación \\ y normalizar saltos
      const txt = txt0.replace(/\\\r?\n/g, ' ');

      // Helpers para respetar comillas y evitar cortar dentro de ellas
      const splitByOps = (line: string): string[] => {
        const parts: string[] = [];
        let cur = '';
        let q: '"' | "'" | '`' | null = null;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          const next = line[i + 1];
          if (q) {
            cur += ch;
            if (ch === q) q = null;
            continue;
          }
          if (ch === '"' || ch === "'" || ch === '`') { q = ch as any; cur += ch; continue; }
          // No dividir pipelines: mantener "a | b" como una sola unidad
          if ((ch === '&' && next === '&') || (ch === '|' && next === '|') || ch === ';') {
            // cortar en &&, ||, ;
            if (ch === '|' && next === '|') { /* allow split on || */ }
            // push acumulado
            if (cur.trim()) parts.push(cur.trim());
            // saltar operador completo
            if ((ch === '&' && next === '&') || (ch === '|' && next === '|')) { i++; }
            cur = '';
            continue;
          }
          // comentarios inline: # ... (solo si comienza un comentario y no hay texto antes?)
          if (ch === '#') { break; }
          cur += ch;
        }
        if (cur.trim()) parts.push(cur.trim());
        return parts;
      };

      // Procesar por líneas y luego por operadores (&&, ||, ;) respetando comillas
      const cmds: string[] = [];
      for (const raw of txt.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const sub = splitByOps(line);
        for (const s of sub) if (s) cmds.push(s);
      }

      // Heurística: al menos 2 comandos y todos parecen shell sencillos
      const simpleCmds = cmds.filter(c => isLikelyShell(c));
      if (simpleCmds.length >= 2 && simpleCmds.length === cmds.length) return cmds;
      return null;
  };

    // Detect plan composed of multiple separate code blocks
    const codeBlockIndices = blocks.map((b, i) => ({ i, b })).filter(x => x.b.type === 'code').map(x => x.i);
    const isMultiCodePlan = codeBlockIndices.length >= 2;

    return (
      <div>
        {!isMultiCodePlan && blocks.map((b, i) => b.type === 'code' ? (() => {
          const steps = splitIntoSteps(b.body);
          if (steps) {
            // Mostrar solo el siguiente paso pendiente; al ejecutar, se revela el siguiente
            const keys = steps.map((_, idx) => `c-${i}-step-${idx}`);
            const nextIdx = steps.findIndex((_, idx) => !executed[keys[idx]]);
            const doneCount = steps.reduce((acc, _, idx) => acc + (executed[keys[idx]] ? 1 : 0), 0);
            if (nextIdx === -1) {
              return (
                <div className="copyable-block" key={`c-${i}`}>
                  <div className="confirm-title">Plan completado</div>
                </div>
              );
            }
            const s = steps[nextIdx];
            const k = keys[nextIdx];
            return (
              <div className="copyable-block" key={`c-${i}`}>
                <div className="confirm-title">Paso {nextIdx + 1} de {steps.length}</div>
                <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>
                  Progreso: {doneCount} / {steps.length} {doneCount>0 ? `— ✓ Paso ${doneCount} ejecutado` : ''}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <button
                    className="copy-btn"
                    onClick={(e) => onRun(s, e.currentTarget, k)}
                    aria-label={`Ejecutar paso ${nextIdx + 1}`}
                    type="button"
                  >Ejecutar paso</button>
                  <code>{s}</code>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {doneCount > 0 && (
                    <button
                      className="copy-btn"
                      onClick={async () => {
                        // Ejecutar en secuencia todos los pasos restantes
                        for (let idx = nextIdx; idx < steps.length; idx++) {
                          const key = keys[idx];
                          if (!executed[key]) {
                            await onRun(steps[idx], null, key);
                          }
                        }
                      }}
                      type="button"
                    >Ejecutar todos</button>
                  )}
                  {doneCount > 0 && (
                    <button
                      className="copy-btn"
                      onClick={() => {
                        // Retroceder un paso: marca el último ejecutado como pendiente
                        for (let idx = steps.length - 1; idx >= 0; idx--) {
                          const key = keys[idx];
                          if (executed[key]) { setExecuted(prev => { const n = { ...prev }; delete n[key]; return n; }); break; }
                        }
                      }}
                      type="button"
                    >Retroceder</button>
                  )}
                </div>
              </div>
            );
          }
          return (
            <div className="copyable-block" key={`c-${i}`}>
              <button
                className="copy-btn"
                onClick={(e) => onRun(b.body, e.currentTarget)}
                aria-label="Ejecutar código"
                type="button"
              >Ejecutar</button>
              <pre><code>{b.body}</code></pre>
            </div>
          );
        })() : (
          <div key={`p-${i}`}>{renderPara(b.body)}</div>
        ))}

        {isMultiCodePlan && (() => {
          // Multi-code-block plan: render paragraphs always; show only the next unexecuted code block
          const keys = codeBlockIndices.map((_, idx) => `c-multi-${idx}`);
          const doneCount = codeBlockIndices.reduce((acc, _, idx) => acc + (executed[keys[idx]] ? 1 : 0), 0);
          const nextIdx = codeBlockIndices.findIndex((_, idx) => !executed[keys[idx]]);
          const total = codeBlockIndices.length;
          const header = (
            <div className="copyable-block" key={`plan-h`}>
              {nextIdx === -1 ? (
                <div className="confirm-title">Plan completado</div>
              ) : (
                <>
                  <div className="confirm-title">Paso {doneCount + 1} de {total}</div>
                  <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>
                    Progreso: {doneCount} / {total} {doneCount>0 ? `— ✓ Paso ${doneCount} ejecutado` : ''}
                  </div>
                </>
              )}
            </div>
          );

          const bodyNodes: React.ReactNode[] = [];
          // Render paragraphs
          blocks.forEach((b, i) => {
            if (b.type === 'para') bodyNodes.push(<div key={`p2-${i}`}>{renderPara(b.body)}</div>);
          });

          // Render next code block only
          if (nextIdx >= 0) {
            const codeBlockIndex = codeBlockIndices[nextIdx];
            const b = blocks[codeBlockIndex];
            const s = b.body;
            const sAtomic = getFirstAtomic(s);
            const k = keys[nextIdx];
            bodyNodes.push(
              <div className="copyable-block" key={`c2-${codeBlockIndex}`}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <button
                    className="copy-btn"
                    onClick={(e) => onRun(sAtomic, e.currentTarget, k)}
                    aria-label={`Ejecutar paso ${doneCount + 1}`}
                    type="button"
                  >Ejecutar paso</button>
                  <code>{sAtomic}</code>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {doneCount > 0 && (
                    <button
                      className="copy-btn"
                      onClick={async () => {
                        // Ejecutar en secuencia todos los pasos restantes (cada code block)
                        for (let idx = nextIdx; idx < total; idx++) {
                          const key = keys[idx];
                          if (!executed[key]) {
                            const nextBlock = blocks[codeBlockIndices[idx]].body;
                            await onRun(getFirstAtomic(nextBlock), null, key);
                          }
                        }
                      }}
                      type="button"
                    >Ejecutar todos</button>
                  )}
                  {doneCount > 0 && (
                    <button
                      className="copy-btn"
                      onClick={() => {
                        // Retroceder un paso (code block)
                        for (let idx = total - 1; idx >= 0; idx--) {
                          const key = keys[idx];
                          if (executed[key]) { setExecuted(prev => { const n = { ...prev }; delete n[key]; return n; }); break; }
                        }
                      }}
                      type="button"
                    >Retroceder</button>
                  )}
                </div>
              </div>
            );
          }

          return (
            <>
              {header}
              {bodyNodes}
            </>
          );
        })()}
      </div>
    );
    };
    return Comp;
  }, []);

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

  // Mantener el modo seleccionado por el usuario para UI; para backend en AGENT reutilizamos ASK
  let effectiveMode: ChatMode = mode;

    // No adjuntar historial/contexto al prompt visible; el estado se envía como campo separado
    const finalInput = trimmed;

  const userMsg: Message = { id: String(Date.now()), sender: 'user', text: trimmed };
  setMessages(prev => [...prev, userMsg]);
    setInput('');

    try {
      setIsSending(true);
  // Para que AGENT reutilice el mismo contexto y comportamiento del modo CONSULTA en el backend
  const modeValue = (effectiveMode === 'agent') ? 'ASK' : effectiveMode.toUpperCase();
      // API sin estado: enviar todo el historial user/assistant de la sesión actual
      const history = [...messages, userMsg]
        .filter(m => m.sender !== 'system')
        .map(m => ({
          role: m.sender === 'ai' ? 'assistant' : 'user',
          content: m.text,
        }));
  const res = await invoke<AiResponse>('ai_chat', { req: { user_input: finalInput, mode: modeValue, history, state: agentState } });

      // Visualización: en AGENT priorizar summary; en ASK combinar summary + explanation
      // En AGENT reutilizamos completamente la lógica de visualización de ASK
      const aiText = (() => {
        const expRaw = (res as any).explanation as string | undefined;
        const respRaw = (res as any).ai_response as string | undefined;
        const exp = expRaw ? String(expRaw) : '';
        return exp || String(respRaw || '');
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
      // En AGENT no mostramos tarjetas de confirmación; el usuario puede ejecutar desde el botón "Ejecutar" del bloque
      let createdConfirmation = false;

      // Construir texto visible: mantener el contenido tal cual (incluido el bloque de código) en modo ASK
      const displayText = aiText;
  // En ASK mantener fences y etiqueta de lenguaje para copiar/pegar; en otros modos, limpiar
  const askLike = (effectiveMode === 'ask' || effectiveMode === 'agent');
  const displayTextClean = askLike ? (displayText || '') : cleanText(displayText);

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
  // En AGENT reutilizamos ASK: ocultar summary/explanation para evitar duplicados
  if (askLike) { cleanedMeta.summary = undefined; cleanedMeta.explanation = undefined; }

      // En AGENT reutilizamos ASK: no exponer code_output separado ni bloques accesorios; el código va inline
      if (askLike) {
        cleanedMeta.code_output = undefined;
        cleanedMeta.suggestedCommands = undefined;
      } else {
        if (cmd && !cleanedMeta.code_output) {
          cleanedMeta.code_output = cmd;
        }
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

      // Mostrar el mensaje de IA normalmente (sin tarjetas de confirmación en AGENT)
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
            className={`message ${msg.sender} ${msg.sender === 'user' ? 'message--user' : 'message--assistant'} ${msg.meta?.chat_mode === 'ask' ? 'ask' : msg.meta?.chat_mode === 'agent' ? 'agent' : ''}`}
          >
            {/* Ocultar el texto superior para los mensajes de sistema con tarjeta de confirmación */}
            {!(msg.sender === 'system' && msg.meta?.pendingCommand && !msg.meta?.processed) && (
              <div className="message-text message-card">
                <div className="message-content">
                  {msg.sender === 'ai' && msg.meta?.chat_mode === 'ask'
                    ? <RenderAsk content={msg.text} />
                    : msg.sender === 'ai' && msg.meta?.chat_mode === 'agent'
                      ? <RenderAgent content={msg.text} sessionId={sessionId} cacheKey={msg.id} onExecuted={async (cmd) => {
                          // Actualizar memoria (no modificar el mensaje para no reiniciar el estado interno de pasos)
                          try { await setLastCommand(cmd); } catch {}
                          // Si es un 'cd <dir>', registra ese directorio como lastPath
                          try {
                            const mCd = cmd.match(/^\s*cd\s+(.+)$/);
                            if (mCd && mCd[1]) {
                              const raw = mCd[1].trim();
                              const dir = raw.replace(/^"|"$/g, '');
                              await setLastPath(dir, 'dir');
                            }
                          } catch {}
                          // Si es un mkdir, guarda el directorio creado como lastPath
                          try {
                            const mk = cmd.match(/^\s*mkdir\s+([^\s]+)/);
                            if (mk && mk[1]) { await setLastPath(mk[1].trim(), 'dir'); }
                          } catch {}
                          // Si creamos archivo con touch/echo/printf/tee/cat >, también registra lastFile y lastPath(file)
                          try {
                            let created: string | null = null;
                            const mTouch = cmd.match(/^\s*touch\s+(\S+)/);
                            if (mTouch) created = mTouch[1];
                            const mRedir = cmd.match(/>\>?\s*([^\s]+)/);
                            if (!created && mRedir) created = mRedir[1];
                            const mHeredoc = cmd.match(/^(?:cat\s*>\s*|tee\s+)(\S+)\s*<</);
                            if (!created && mHeredoc) created = mHeredoc[1];
                            if (created) { await setLastFile(created, ""); await setLastPath(created, 'file'); }
                          } catch {}
                        }} />
                      : msg.text}
                </div>
              </div>
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

            {/* Evitar duplicado: si se usó RenderAgent y ya se envió, no mostrar code_output */}
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