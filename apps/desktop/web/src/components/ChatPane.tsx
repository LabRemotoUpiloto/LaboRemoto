// Panel de chat: integra modo ASK (explicar) y AGENT (sugerir/confirmar comandos).
import React, { useEffect, useRef, useState } from 'react';
import './ChatPane.css';
import ConfirmModal from './ConfirmModal';
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
  // NUEVO: soporte de plan estructurado del backend
  plan?: Plan;
  planProgressKey?: string;
  // NUEVO: detección de errores de ejecución (para asistencia inmediata)
  errorDetected?: boolean;
  errorSignature?: string;
  errorData?: { lastCommand?: string; exitCode?: number; stdoutTail?: string; stderrTail?: string };
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

// Tipos de plan estructurado (del backend)
type PlanStep = { desc: string; cmd: string };
type Plan = { title?: string; steps: PlanStep[] };

const ChatPane: React.FC<Props> = ({ sessionId = null }) => {
  // Feature flag: when false, do NOT infer shell commands on the frontend from natural language;
  // only render whatever the backend returns (plan, actions JSON, or code). Per user request.
  const FRONTEND_INFER: boolean = false;
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

  // Normaliza invocaciones de Python a python3 cuando el comando inicia con 'python'
  const enforcePythonInvoker = (cmd: string): string => {
    const s = (cmd || '').trim();
    if (!s) return s;
    // Si comienza con 'python ' y no es ya 'python3', sustituir por python3
    if (/^python\b/i.test(s) && !/^python3\b/i.test(s)) {
      return s.replace(/^python\b/i, 'python3');
    }
    return s;
  };

  // Obtiene el primer comando atómico (una sola instrucción) respetando comillas; no divide pipelines ni heredocs
  const getFirstAtomic = (s: string): string => {
    const src = (s || '').trim();
    if (!src) return '';
    if (/<<\s*['"]?EOF['"]?/m.test(src)) return src; // here-doc completo como atómico
    // Unir continuaciones \\\ y tomar solo la primera línea significativa
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

  // ¿El usuario pide ejecutar lo anterior? (es/pt/en básicos)
  const looksLikeExecuteFollowup = (s: string): boolean => {
    const t = (s || '').toLowerCase().trim();
    if (!t) return false;
    // Si el usuario mezcla crear/editar/explicar con ejecutar, no lo tratamos como simple "ejecútalo"
    const creationHints = ['crea', 'crear', 'haz', 'genera', 'generar', 'construye', 'construir', 'escribe', 'script', 'archivo', 'python', 'bash', 'nuevo', 'nueva'];
    if (creationHints.some(k => t.includes(k))) return false;
    // Si hay conectores de composición, requiere un plan, no un simple follow-up
    if (/[,;]|\by\b|\bluego\b|\bdespués\b/.test(t)) return false;
    // Frases cortas que equivalen a "ejecútalo"
    const onlyRun = /^(?:ejec(?:uta|útalo|utalo|utala|útala)|corre(?:lo|la)?|run(?: it)?|start(?: it)?)\.?$/.test(t);
    if (onlyRun) return true;
    // Imperativo directo con pronombre y nada más
    if (/^\s*ejecuta(r)?\b/.test(t) || /^\s*corre(r)?\b/.test(t)) {
      const rest = t.replace(/^\s*(ejecuta(r)?|corre(r)?)\b/, '').trim();
      if (!rest || /^(lo|la|eso|esto|el|le)\.?$/.test(rest)) return true;
    }
    return false;
  };

  // Mensaje compuesto: crea/edita + conectores (y, luego, después, comas)
  const isCompositeInstruction = (s: string): boolean => {
    const t = (s || '').toLowerCase();
    const hasCreate = /(crea|crear|genera|generar|haz|construye|construir|escribe|archivo|script|python|bash|nuevo|nueva)\b/.test(t);
    const hasConnector = /[,;]|\by\b|\bluego\b|\bdespués\b/.test(t);
    return hasCreate && hasConnector;
  };

  // Heurística básica para otros follow-ups: renombrar, mover, borrar, mostrar, listar, permisos
  type FollowIntent =
    | { type: 'rename'; to: string; target?: 'file' | 'dir' | 'auto'; name?: string }
    | { type: 'move'; to: string; target?: 'file' | 'dir' | 'auto'; name?: string }
    | { type: 'delete'; target?: 'file' | 'dir' | 'auto'; name?: string }
    | { type: 'show'; target?: 'file' | 'dir' | 'auto'; name?: string }
    | { type: 'list'; target?: 'file' | 'dir' | 'auto'; name?: string }
    | { type: 'make_executable'; target?: 'file' | 'dir' | 'auto'; name?: string }
  | { type: 'cd_into'; target?: 'dir' | 'auto'; name?: string }
  | { type: 'none'; target?: 'file' | 'dir' | 'auto'; name?: string };

  const extractQuoted = (s: string): string | null => {
    const m = s.match(/["'“”‘’]([^"'“”‘’]+)["'“”‘’]/);
    return m ? m[1].trim() : null;
  };
  const extractAfter = (s: string, markers: string[]): string | null => {
    const t = s.toLowerCase();
    let best: { idx: number; len: number } | null = null;
    for (const mk of markers) {
      const idx = t.indexOf(mk);
      if (idx >= 0) {
        if (!best || idx < best.idx) best = { idx, len: mk.length };
      }
    }
    if (!best) return null;
    const raw = s.slice(best.idx + best.len).trim();
    if (!raw) return null;
    // tomar última palabra o resto si parece ruta compuesta
    return raw;
  };
  const quoteArg = (s: string): string => {
    if (!s) return s;
    if (/^[A-Za-z0-9_./-]+$/.test(s)) return s;
    return `"${s.replace(/"/g, '\\"')}"`;
  };

  const resolveFollowUpIntent = (s: string): FollowIntent => {
    const t = (s || '').toLowerCase();
    // Si el usuario está pidiendo una acción compuesta (crear + luego hacer algo), no intentes
    // realizar un follow-up de una sola acción (como cd/mv/rm) en el frontend.
    if (isCompositeInstruction(s)) return { type: 'none' };
    if (!t) return { type: 'none' };
    const targetHint: 'file' | 'dir' | 'auto' = (/(directorio|carpeta|folder)/.test(t)) ? 'dir' : (/(archivo|script|fichero)/.test(t) ? 'file' : 'auto');
    const named = extractQuoted(s);
    // rename
    if (t.includes('renombr') || t.includes('cambiale el nombre') || t.includes('cámbiale el nombre') || t.includes('cambia el nombre') || t.includes('ponle nombre') || t.includes('llámalo') || t.includes('llamalo')) {
      const q = extractAfter(s, [' a ', ' como ']) || named;
      return { type: 'rename', to: (q || '').trim(), target: targetHint, name: named || undefined };
    }
    // move
    if (t.includes('mueve') || t.includes('muévelo') || t.includes('muevelo') || t.includes('pasalo') || t.includes('pásalo') || t.includes('traslada') || t.includes('mover')) {
      const q = extractAfter(s, [' a ', ' hacia ', ' en ']) || named;
      return { type: 'move', to: (q || '').trim(), target: targetHint, name: named || undefined };
    }
    // delete
    if (t.includes('borra') || t.includes('elimín') || t.includes('elimin') || t.includes('bota') || t.includes('quitalo') || t.includes('quítalo') || t.includes('remove') || t.includes('delete')) {
      return { type: 'delete', target: targetHint, name: named || undefined };
    }
    // show content
    if (t.includes('muestra') || t.includes('enséñame') || t.includes('enseñame') || t.includes('ver ') || t.includes('verlo') || t.includes('imprime') || t.includes('show')) {
      return { type: 'show', target: targetHint, name: named || undefined };
    }
    // list
    if (t.includes('lista') || t.includes('listar') || t.includes('listame') || t.includes('ls ')) {
      return { type: 'list', target: targetHint, name: named || undefined };
    }
    // make executable
    if (t.includes('ejecutable') || t.includes('permisos') || t.includes('chmod')) {
      return { type: 'make_executable', target: targetHint, name: named || undefined };
    }
    // cd into
    if (t.includes('entra') || t.includes('cambia a') || t.includes('ve a') || t.startsWith('cd ')) {
      const to = extractAfter(s, [' a ', ' en ', ' hacia ']) || named;
      return { type: 'cd_into', target: 'dir', name: to || undefined };
    }
    return { type: 'none' };
  };

  const buildCommandFromIntent = (intent: FollowIntent): { cmd: string; reason: string } | null => {
    // 1) Intent + chat context artifacts (prefer names mentioned in recent messages)
    const MAX_LOOKBACK = 8; // last 8 messages for lightweight mining
    const recentMsgs = messages.slice(-MAX_LOOKBACK).map(m => m.text).join('\n');
    const minePaths = (txt: string): { files: string[]; dirs: string[] } => {
      const files = new Set<string>();
      const dirs = new Set<string>();
      if (!txt) return { files: [], dirs: [] };
      const isPlausiblePath = (p: string): boolean => {
        const s = (p || '').trim();
        if (!s || s.length > 260) return false;
        // allow drive letters, ./, ../, ~, or contain slash/backslash or a dot (for extension)
        const looksPathy = /^(?:[A-Za-z]:\\|\.\.?\/|~\/)/.test(s) || /[\\\/]/.test(s) || /\.[A-Za-z0-9]{1,8}$/.test(s);
        if (!looksPathy) return false;
        // restrict to safe filename chars (spaces allowed)
        if (!/^[\w ._\-\\\/~:]+$/.test(s)) return false;
        return true;
      };
      // quoted paths
      const quoted = txt.match(/["'“”‘’]([^"'“”‘’\n]+)["'“”‘’]/g) || [];
      for (const q of quoted) {
        const p = q.slice(1, -1).trim();
        if (!p) continue;
        if (!isPlausiblePath(p)) continue;
        if (/\.[a-zA-Z0-9]{1,6}$/.test(p)) files.add(p); else dirs.add(p);
      }
      // inline like luzLed/prender_led.sh or ./scripts/build.sh
      const inline = txt.match(/(?:\.{0,2}\/)?[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+(?:\.[A-Za-z0-9]{1,6})?/g) || [];
      for (const p of inline) {
        if (!p) continue;
        if (!isPlausiblePath(p)) continue;
        if (/\.[a-zA-Z0-9]{1,6}$/.test(p)) files.add(p); else dirs.add(p);
      }
      return { files: Array.from(files), dirs: Array.from(dirs) };
    };
  const mined = minePaths(recentMsgs);
    const rf = [...(mined.files || []), ...(mem.recentFiles || [])];
    const rd = [...(mined.dirs || []), ...(mem.recentDirs || [])];
    const chooseByName = (name: string | undefined, pool: string[]): string | undefined => {
      if (!name) return undefined;
      const byExact = pool.find(p => p === name);
      if (byExact) return byExact;
      const byEnd = pool.find(p => p.endsWith(name));
      if (byEnd) return byEnd;
      const byIncl = pool.find(p => p.toLowerCase().includes(name.toLowerCase()));
      return byIncl;
    };

  const subjectFileRaw = chooseByName(intent.name, rf) || mem.lastFile?.trim() || (mem.lastPathKind === 'file' ? mem.lastPath : undefined) || rf[0];
  const subjectDirRaw = chooseByName(intent.name, rd) || (mem.lastPathKind === 'dir' ? mem.lastPath : undefined) || rd[0];
    const fileQ = subjectFileRaw ? quoteArg(subjectFileRaw) : undefined;
    const dirQ = subjectDirRaw ? quoteArg(subjectDirRaw) : undefined;

    // Detectores contextuales
    const lastUserMsg = (messages[messages.length - 1]?.text || '').toLowerCase();
    const looksNetwork = (txt: string): boolean => {
      const t = (txt || '').toLowerCase();
      return /(puerto|puertos|port|ports|escuchando|listening|servicio|servicios|netstat|lsof|ss\b)/.test(t);
    };

    switch (intent.type) {
      case 'rename': {
        if (!subjectFileRaw && !subjectDirRaw) return null;
        const target = (intent.to || '').trim();
        if (!target) return null;
        const targetQ = quoteArg(target);
        const preferDir = intent.target === 'dir';
        const srcQ = (preferDir ? dirQ : fileQ) || dirQ || fileQ!;
        return { cmd: `mv ${srcQ} ${targetQ}` , reason: `Renombrar ${srcQ === dirQ ? 'carpeta' : 'archivo'} a ${target}` };
      }
      case 'move': {
        if (!subjectFileRaw && !subjectDirRaw) return null;
        const target = (intent.to || '').trim();
        if (!target) return null;
        const targetQ = quoteArg(target);
        const preferDir = intent.target === 'dir';
        const srcQ = (preferDir ? dirQ : fileQ) || dirQ || fileQ!;
        return { cmd: `mv ${srcQ} ${targetQ}`, reason: `Mover ${srcQ === dirQ ? 'carpeta' : 'archivo'} a ${target}` };
      }
      case 'delete': {
        // Si pide explícitamente directorio/carpeta, preferir dir incluso si también hay archivo
        if (intent.target === 'dir' && dirQ) return { cmd: `rm -rf ${dirQ}`, reason: 'Eliminar carpeta' };
        if (intent.target === 'file' && fileQ) return { cmd: `rm -f ${fileQ}`, reason: 'Eliminar archivo' };
        // Auto: si hay dir reciente, eliminar dir; en otro caso, archivo
        if (dirQ) return { cmd: `rm -rf ${dirQ}`, reason: 'Eliminar carpeta' };
        if (fileQ) return { cmd: `rm -f ${fileQ}`, reason: 'Eliminar archivo' };
        return null;
      }
      case 'show': {
        if ((intent.target === 'file' || intent.target === 'auto') && fileQ) return { cmd: `sed -n '1,200p' ${fileQ}`, reason: 'Mostrar contenido del archivo (primeras 200 líneas)' };
        if (dirQ) return { cmd: `ls -la ${dirQ}`, reason: 'Listar carpeta' };
        return { cmd: `ls -la`, reason: 'Listar directorio actual' };
      }
      case 'list': {
        // Si parece una solicitud de red/puertos, preferir comando de red
        if (looksNetwork(lastUserMsg) || looksNetwork(recentMsgs)) {
          // Un solo comando simple compatible con Linux; pipelines se conservan
          return { cmd: `ss -tulpn`, reason: 'Listar servicios escuchando puertos (Linux)' };
        }
        // Solo usar una carpeta de memoria si el usuario mencionó explícitamente directorio/carpeta
        if (intent.target === 'dir' && dirQ) return { cmd: `ls -la ${dirQ}`, reason: 'Listar carpeta' };
        // Si el usuario nombró una ruta concreta
        if (intent.name && (dirQ || fileQ)) {
          if (dirQ) return { cmd: `ls -la ${dirQ}`, reason: 'Listar carpeta' };
          // si nombró archivo, mostrar su carpeta contenedora
          if (fileQ && subjectFileRaw) {
            const parts = subjectFileRaw.split(/[\\\/]/); parts.pop(); const parent = parts.join('/');
            if (parent) return { cmd: `ls -la ${quoteArg(parent)}`, reason: 'Listar carpeta del archivo' };
          }
        }
        return { cmd: `ls -la`, reason: 'Listar directorio actual' };
      }
      case 'make_executable': {
        if (fileQ) return { cmd: `chmod +x ${fileQ}`, reason: 'Conceder permisos de ejecución al archivo' };
        return null;
      }
      case 'cd_into': {
        // Si el usuario mencionó un nombre, intentar ir a esa carpeta
        if (intent.name) {
          const chosen = chooseByName(intent.name, rd);
          if (chosen) return { cmd: `cd ${quoteArg(chosen)}`, reason: 'Entrar al directorio' };
        }
        if (dirQ) return { cmd: `cd ${dirQ}`, reason: 'Entrar al directorio' };
        if (fileQ) {
          // entrar al directorio contenedor
          const parts = subjectFileRaw!.split(/[\\/]/);
          parts.pop();
          const parent = parts.join('/');
          if (parent) return { cmd: `cd ${quoteArg(parent)}`, reason: 'Entrar al directorio del archivo' };
        }
        return null;
      }
      case 'none':
      default:
        return null;
    }
  };

  // Construir comando para ejecutar desde memoria de sesión
  const buildExecuteFromMemory = (): { cmd: string; reason: string } | null => {
    const file = mem.lastFile?.trim();
    const lastCmd = mem.lastCommand?.trim();
    if (file) {
      const quoted = /\s/.test(file) ? `"${file}"` : file;
      const lower = file.toLowerCase();
      if (lower.endsWith('.py')) {
        return { cmd: enforcePythonInvoker(`python ${quoted}`), reason: `Ejecutar script Python ${file}` };
      }
      if (lower.endsWith('.sh')) {
        return { cmd: `bash ${quoted}` , reason: `Ejecutar script shell ${file}` };
      }
      // Si recientemente se otorgaron permisos de ejecución al archivo, intentar invocarlo directamente
      if (lastCmd && lastCmd.includes('chmod +x') && lastCmd.includes(file)) {
        // Si el path no es absoluto, usar ./ cuando no hay separador de directorio
        const direct = /[\\/]/.test(file) ? quoted : `./${quoted}`;
        return { cmd: direct, reason: `Ejecutar archivo recientemente marcado como ejecutable (${file})` };
      }
      // Fallback: intentar ejecutarlo con bash (común para here-docs .sh sin extensión)
      return { cmd: `bash ${quoted}`, reason: `Ejecutar archivo ${file}` };
    }
    if (lastCmd) {
      return { cmd: lastCmd, reason: 'Re-ejecutar el último comando' };
    }
    return null;
  };

  const tryParseJson = (s: string | null | undefined): any | null => {
    if (!s) return null;
    const text = s.trim();
    if (!text) return null;
    try { return JSON.parse(text); } catch { return null; }
  };

  // Convierte JSON de acciones de UI (version: ui-v1, actions: [...]) en un script bash único
  // Soporta acciones: create_file { path, content|fileContent|data }, create_dir { path }, command { cmd }
  const buildScriptFromActions = (json: any): { script: string; reason?: string } | null => {
    if (!json || typeof json !== 'object') return null;
    const actions = Array.isArray(json.actions) ? json.actions : null;
    if (!actions || !actions.length) return null;
    const lines: string[] = [];
    // Usar set -e para fallar rápido; respetar aquí-docs con EOF
    lines.push('set -e');
    const mkdirs = new Set<string>();
    const getContent = (obj: any): string => {
      return (
        obj?.content ?? obj?.fileContent ?? obj?.data ?? obj?.body ?? ''
      );
    };
    const normPath = (p: string) => (p || '').replace(/\\/g, '/');
    for (const a of actions) {
      const type = String(a?.type || a?.action || '').toLowerCase();
      if (!type) continue;
      if (type === 'create_file' || type === 'write_file') {
        const p = normPath(a?.path || a?.name || a?.file || '');
        if (!p) continue;
        const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
        if (dir) mkdirs.add(dir);
        const content = String(getContent(a) ?? '');
        const eof = 'EOF_UI';
        lines.push(`cat > ${JSON.stringify(p)} <<'${eof}'`);
        // No interpolar, dejar tal cual
        lines.push(content.replace(/\r\n/g, '\n'));
        lines.push(eof);
      } else if (type === 'create_dir' || type === 'mkdir') {
        const p = normPath(a?.path || a?.dir || a?.name || '');
        if (p) mkdirs.add(p);
      } else if (type === 'command' || type === 'run' || type === 'exec') {
        const cmd = String(a?.cmd || a?.command || '').trim();
        if (cmd) lines.push(cmd);
      } else {
        // ignorar tipos desconocidos
      }
    }
    const prefix: string[] = [];
    if (mkdirs.size > 0) {
      // Crear directorios primero con -p
      for (const d of mkdirs) prefix.push(`mkdir -p ${JSON.stringify(d)}`);
    }
    // Si la primera instrucción es here-doc, asegurar directorio antes
    const script = [...prefix, ...lines].join('\n');
    const reason = (json.summary || json.explanation || '').toString() || undefined;
    return { script, reason };
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
      <>
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
      </>
    );
  };

  // Renderizado para AGENT: igual a RenderAsk pero el botón ejecuta en terminal
  // Importante: el componente se memoiza para mantener su identidad entre renders
  const RenderAgent = React.useMemo(() => {
    // Explicación breve heurística por comando (fallback cuando no hay plan del backend)
    const describeCmd = (cmd: string): string => {
      const s = (cmd || '').trim();
      if (!s) return '';
      // mkdir
      let m = s.match(/^mkdir\s+(.+)$/);
      if (m) return `Crear el directorio ${m[1].trim()}.`;
      // cd
      m = s.match(/^cd\s+(.+)$/);
      if (m) return `Entrar al directorio ${m[1].trim()}.`;
      // touch
      m = s.match(/^touch\s+(.+)$/);
      if (m) return `Crear el archivo vacío ${m[1].trim()}.`;
      // echo/printf > file
      m = s.match(/^(?:echo|printf)\b[\s\S]*?>\s*([^\s]+)$/);
      if (m) return `Escribir contenido en el archivo ${m[1].trim()}.`;
      // here-doc cat > file <<EOF
      m = s.match(/^cat\s*>\s*([^\s]+)\s*<</);
      if (m) return `Crear el archivo ${m[1].trim()} con contenido.`;
      // git clone
      m = s.match(/^git\s+clone\s+([^\s]+)(?:\s+([^\s]+))?/);
      if (m) return `Clonar el repositorio ${m[1]}${m[2] ? ` en la carpeta ${m[2]}` : ''}.`;
      // npm/yarn/pnpm install
      if (/^(npm|yarn|pnpm)\s+install\b/.test(s)) return 'Instalar dependencias del proyecto.';
      // cargo build/run
      if (/^cargo\s+build\b/.test(s)) return 'Compilar el proyecto Rust (cargo build).';
      if (/^cargo\s+run\b/.test(s)) return 'Ejecutar el binario del proyecto Rust (cargo run).';
      // chmod +x
      if (/^chmod\s+\+x\b/.test(s)) return 'Dar permisos de ejecución al archivo.';
      // mv/cp
      if (/^mv\b/.test(s)) return 'Mover o renombrar archivos/directorios.';
      if (/^cp\b/.test(s)) return 'Copiar archivos o directorios.';
      // default
      return 'Ejecutar el comando indicado.';
    };
    const RenderPlan: React.FC<{ plan: Plan; progressKey?: string; sessionId?: string | null; onExecuted?: (cmd: string) => void; }>
      = ({ plan, progressKey, sessionId, onExecuted }) => {
        // Persistencia simple por mensaje (índice de paso)
        const getStore = (): number => {
          try {
            const g: any = (window as any);
            g.__agentPlanIndex = g.__agentPlanIndex || {};
            return g.__agentPlanIndex[progressKey || plan.title || ''] ?? 0;
          } catch { return 0; }
        };
        const saveStore = (idx: number) => {
          try {
            const g: any = (window as any);
            g.__agentPlanIndex = g.__agentPlanIndex || {};
            g.__agentPlanIndex[progressKey || plan.title || ''] = idx;
          } catch {}
        };

        const [idx, setIdx] = React.useState<number>(() => getStore());
        React.useEffect(() => { saveStore(idx); }, [idx]);
        const total = plan.steps.length;
        const done = Math.min(idx, total);
        const next = done >= total ? -1 : done;

        if (next === -1) {
          return (
            <div className="agent-card">
              <div className="agent-header">
                <span className="agent-step">Plan completado</span>
                <span className="agent-progress">{total}/{total} completados</span>
              </div>
            </div>
          );
        }

        const step = plan.steps[next];
        const runStep = async (btn?: HTMLButtonElement | null) => {
          if (btn) { btn.disabled = true; const prev = btn.textContent; btn.textContent = 'Ejecutando…'; }
          try {
            const finalCmd = enforcePythonInvoker(step.cmd);
            await invoke('ssh_stdin', { id: sessionId, data: finalCmd + '\n' });
            if (onExecuted) onExecuted(finalCmd);
            setIdx(i => Math.min(i + 1, total));
          } finally {
            if (btn) { setTimeout(() => { btn.disabled = false; btn.textContent = 'Ejecutar paso'; }, 200); }
          }
        };
        const runRest = async () => {
          for (let i = next; i < total; i++) {
            const finalCmd = enforcePythonInvoker(plan.steps[i].cmd);
            await invoke('ssh_stdin', { id: sessionId, data: finalCmd + '\n' });
            if (onExecuted) onExecuted(finalCmd);
            setIdx(i + 1);
          }
        };
        const back = () => setIdx(i => Math.max(0, i - 1));

        return (
          <div className="agent-card">
            <div className="agent-header">
              <span className="agent-step">Paso {next + 1} de {total}</span>
              <span className="agent-progress">{done}/{total} completados</span>
            </div>
            <div className="agent-explainer">{step.desc}</div>
            <pre className="agent-code"><code>{step.cmd}</code></pre>
            <div className="agent-actions">
              <button className="agent-run" onClick={(e) => runStep(e.currentTarget)} disabled={false}>Ejecutar paso</button>
              {done > 0 && <button className="agent-run-all" onClick={runRest}>Ejecutar restantes</button>}
              {done > 0 && <button className="agent-back" onClick={back}>Retroceder</button>}
            </div>
          </div>
        );
      };

    const Comp: React.FC<{ content: string; sessionId?: string | null; onExecuted?: (cmd: string) => void; cacheKey?: string; meta?: any }>
      = ({ content, sessionId, onExecuted, cacheKey, meta }) => {
      // Si hay plan estructurado en meta, usarlo y ocultar resto
      if (meta?.plan && Array.isArray(meta?.plan?.steps)) {
        const stepsLen = (meta.plan.steps as any[]).length;
        if (stepsLen >= 2) {
          return <RenderPlan plan={meta.plan as Plan} progressKey={meta.planProgressKey} sessionId={sessionId} onExecuted={onExecuted} />;
        }
        // Si solo hay 1 paso, tratarlo como acción única (no plan)
      }
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
  // Confirmación para comandos destructivos (rm -rf)
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmCmd, setConfirmCmd] = useState<string | null>(null);
  const [confirmPath, setConfirmPath] = useState<string | null>(null);
  const confirmResolveRef = useRef<((ok: boolean) => void) | null>(null);
  const confirmTimerRef = useRef<number | null>(null);
  const requestConfirm = (cmd: string, path: string | null): Promise<boolean> => {
    setConfirmCmd(cmd); setConfirmPath(path); setConfirmOpen(true);
    return new Promise<boolean>((resolve) => {
      // Wrapper que limpia el fallback si el modal se usa
      confirmResolveRef.current = (ok: boolean) => {
        if (confirmTimerRef.current !== null) { window.clearTimeout(confirmTimerRef.current); confirmTimerRef.current = null; }
        resolve(ok);
      };
      // Fallback por si el modal no aparece (seguridad)
      confirmTimerRef.current = window.setTimeout(() => {
        if (confirmResolveRef.current) {
          const ok = window.confirm(`¿Confirmas borrar la carpeta ${path ?? ''}?`);
          setConfirmOpen(false);
          const cb = confirmResolveRef.current; confirmResolveRef.current = null;
          cb(ok);
        }
      }, 900);
    });
  };
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

  

    const onRun = async (text: string, btn: HTMLButtonElement | null, key?: string) => {
      const cmdRaw = (text || '').trim();
      if (!cmdRaw) return;
      const toExec = getFirstAtomic(cmdRaw);
      if (!toExec) return;
      const finalCmd = enforcePythonInvoker(toExec);
      // Interceptar rm -rf para confirmar
      const mRmrf = finalCmd.match(/^\s*rm\s+-rf\s+(.+)$/i);
      if (mRmrf) {
        const ok = await requestConfirm(finalCmd, (mRmrf[1] || '').trim());
        if (!ok) return;
      }
      const markDone = () => { if (key) setExecuted(prev => { const n = { ...prev, [key!]: true }; return n; }); };
      const undoDone = () => { if (key) setExecuted(prev => { const n = { ...prev }; delete n[key!]; return n; }); };
      if (runningRef.current) return; // evita ejecuciones múltiples
      runningRef.current = true;
      if (btn) {
        btn.disabled = true; const prev = btn.textContent; btn.textContent = 'Ejecutando…';
        // Optimista: avanza el paso inmediatamente
        markDone();
        try {
          await invoke('ssh_stdin', { id: sessionId, data: finalCmd + '\n' });
          if (onExecuted) onExecuted(finalCmd);
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
          await invoke('ssh_stdin', { id: sessionId, data: finalCmd + '\n' });
          if (onExecuted) onExecuted(finalCmd);
        } catch {
          undoDone();
        } finally { runningRef.current = false; }
      }
    };
    // Detecta si el bloque representa pasos independientes (no scripts complejos)
    const splitIntoSteps = (code: string): string[] | null => {
      const txt0 = (code || '').trim();
      if (!txt0) return null;
      // Evitar dividir JSON/objetos UI o scripts multilínea
      if (/^\s*[{\[]/.test(txt0)) return null; // JSON o arrays
      if (/("version"\s*:\s*"?ui-v\d)|("actions"\s*:)/i.test(txt0)) return null;
      if (/<<\s*['"]?EOF['"]?/m.test(txt0)) return null; // here-docs
      if (/[{}]/.test(txt0)) return null; // llaves: probablemente JSON o funciones
      if (/^\s*(if|for|while|case|function|def|class)\b/m.test(txt0)) return null; // bash o python estructurado
      if (/^\s*#\!/.test(txt0)) return null; // shebang
      if (/\n/.test(txt0) && /(import\s+|from\s+\S+\s+import\s+|print\(|def\s+|class\s+)/m.test(txt0)) return null; // script python

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
      <>
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
                <div className="agent-card" key={`c-${i}`}>
                  <div className="agent-header">
                    <span>Plan completado</span>
                  </div>
                </div>
              );
            }
            const s = steps[nextIdx];
            const k = keys[nextIdx];
            return (
              <div className="agent-card" key={`c-${i}`}>
                <div className="agent-header">
                  <span>Paso {nextIdx + 1} de {steps.length}</span>
                  <span className="agent-step">{doneCount} / {steps.length}</span>
                </div>
                {/* Explicación heurística del paso actual (fallback) */}
                <div className="agent-explainer">{describeCmd(s)}</div>
                <div className="agent-code"><code>{s}</code></div>
                <div className="agent-actions">
                  <button
                    className="agent-run"
                    onClick={(e) => onRun(s, e.currentTarget, k)}
                    aria-label={`Ejecutar paso ${nextIdx + 1}`}
                    type="button"
                  >Ejecutar paso</button>
                  {doneCount > 0 && (
                    <button
                      className="agent-run-all"
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
                      className="agent-back"
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
          // Caso de un solo comando: mostramos explicación breve y el comando
          return (
            <div className="agent-card" key={`c-${i}`}>
              <div className="agent-header">
                <span>Acción</span>
              </div>
              {meta?.reason ? (
                <div className="agent-explainer">{String(meta.reason)}</div>
              ) : (
                <div className="agent-explainer">{describeCmd(b.body)}</div>
              )}
              <div className="agent-code"><code>{b.body}</code></div>
              <div className="agent-actions">
                {(() => {
                  const k = `c-${i}-single`;
                  return executed[k] ? null : (
                    <button
                      className="agent-run"
                      onClick={(e) => onRun(b.body, e.currentTarget, k)}
                      aria-label="Ejecutar código"
                      type="button"
                    >Ejecutar</button>
                  );
                })()}
              </div>
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
            <div className="agent-card" key={`plan-h`}>
              {nextIdx === -1 ? (
                <div className="agent-header"><span>Plan completado</span></div>
              ) : (
                <div className="agent-header">
                  <span>Paso {doneCount + 1} de {total}</span>
                  <span className="agent-step">{doneCount} / {total}</span>
                </div>
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
              <div className="agent-card" key={`c2-${codeBlockIndex}`}>
                <div className="agent-code"><code>{sAtomic}</code></div>
                <div className="agent-actions">
                  {executed[k] ? null : (
                    <button
                      className="agent-run"
                      onClick={(e) => onRun(sAtomic, e.currentTarget, k)}
                      aria-label={`Ejecutar paso ${doneCount + 1}`}
                      type="button"
                    >Ejecutar paso</button>
                  )}
                  {doneCount > 0 && (
                    <button
                      className="agent-run-all"
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
                      className="agent-back"
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
      <ConfirmModal
        open={confirmOpen}
        title="Confirmar eliminación"
        message={`Vas a borrar la carpeta ${confirmPath ?? ''}. ¿Confirmas?`}
        confirmLabel="Sí, borrar"
  onConfirm={() => { setConfirmOpen(false); const cb = confirmResolveRef.current; confirmResolveRef.current = null; cb?.(true); }}
  onCancel={() => { setConfirmOpen(false); const cb = confirmResolveRef.current; confirmResolveRef.current = null; cb?.(false); }}
      />
      </>
    );
    };
    return Comp;
  }, []);

  // ConfirmModal global para RenderAgent (se controla dentro del propio componente RenderAgent via hooks locales)

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

  // Resumen de contexto/foco actual
  const ContextSummary: React.FC = () => {
    const files = mem.recentFiles || [];
    const dirs = mem.recentDirs || [];
    const cmds = mem.recentCommands || [];
    const cur = {
      file: mem.lastFile,
      dir: mem.lastPathKind === 'dir' ? mem.lastPath : undefined,
      cmd: mem.lastCommand,
    };
    return (
      <div className="context-summary" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ opacity: 0.8 }}>Contexto:</span>
        {cur.dir && <span title="Directorio actual" className="badge">📁 {cur.dir}</span>}
        {cur.file && <span title="Archivo reciente" className="badge">📄 {cur.file}</span>}
        {cur.cmd && <span title="Último comando" className="badge">⌨️ {cur.cmd}</span>}
        {(files.length + dirs.length + cmds.length) > 0 && (
          <details>
            <summary style={{ cursor: 'pointer' }}>Cambiar foco</summary>
            <div style={{ display: 'flex', gap: 16 }}>
              <div>
                <div className="label">Archivos</div>
                <ul>
                  {files.map((f, i) => (
                    <li key={`f-${i}`}>
                      <button onClick={() => setLastPath(f, 'file')} title="Usar este archivo como foco">{f}</button>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="label">Carpetas</div>
                <ul>
                  {dirs.map((d, i) => (
                    <li key={`d-${i}`}>
                      <button onClick={() => setLastPath(d, 'dir')} title="Usar esta carpeta como foco">{d}</button>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="label">Comandos</div>
                <ul>
                  {cmds.map((c, i) => (
                    <li key={`c-${i}`}>
                      <button onClick={() => setLastCommand(c)} title="Usar este comando como foco">{c}</button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
        )}
      </div>
    );
  };

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
  // Atajo: en modo agente, si el usuario dice "ejecútalo" (o similar), usar memoria para proponer la ejecución
  if (effectiveMode === 'agent' && looksLikeExecuteFollowup(finalInput)) {
    const execPlan = buildExecuteFromMemory();
    if (execPlan) {
      const aiTextFollow = `Voy a ejecutar la última acción solicitada.\n\n\n\n\u0060\u0060\u0060bash\n${execPlan.cmd}\n\u0060\u0060\u0060`;
      const aiMsg: Message = {
        id: String(Date.now() + 1),
        sender: 'ai',
        text: aiTextFollow,
        meta: { chat_mode: 'agent', summary: undefined, explanation: undefined }
      } as any;
      setMessages(prev => [...prev, aiMsg]);
      setIsSending(false);
      return;
    }
    // Si no hay memoria aprovechable, seguimos con el flujo normal hacia backend
  }
  // Intentos generales: renombrar/mover/borrar/mostrar/etc desde memoria
  if (effectiveMode === 'agent' && FRONTEND_INFER && !isCompositeInstruction(finalInput)) {
    const intent = resolveFollowUpIntent(finalInput);
    if (intent.type !== 'none' && !looksLikeExecuteFollowup(finalInput)) {
      const built = buildCommandFromIntent(intent);
      if (built) {
        const aiTextFollow = `${built.reason}\n\n\n\n\u0060\u0060\u0060bash\n${built.cmd}\n\u0060\u0060\u0060`;
        const aiMsg: Message = {
          id: String(Date.now() + 2),
          sender: 'ai',
          text: aiTextFollow,
          meta: { chat_mode: 'agent', summary: undefined, explanation: undefined, reason: built.reason }
        } as any;
        setMessages(prev => [...prev, aiMsg]);
        setIsSending(false);
        return;
      }
    }
  }
  // Heurística: si en modo AGENT el usuario hace una pregunta explicativa ("¿qué significa?", "explica", etc.),
  // enrutar como ASK para evitar generar comandos innecesarios y obtener texto.
  const isAskLikeInput = (() => {
    const t = finalInput.toLowerCase();
    const q = ["que significa", "qué significa", "que es", "qué es", "por que", "por qué", "explica", "explícame", "explicame", "significado", "que hace", "qué hace", "me sale", "me aparece", "error:", "unable to", "no se puede", "por favor explica"];
    const imperativeHints = ["instala", "crea", "genera", "ejecuta", "descarga", "inicia", "configura", "borra", "elimina", "mueve", "copia", "compila", "construye", "mkdir", "cd ", "chmod", "curl", "wget", "git "];
    const likelyQuestion = q.some(k => t.includes(k)) || t.includes('?') || t.includes('¿');
    const hasImperative = imperativeHints.some(k => t.includes(k));
    return likelyQuestion && !hasImperative;
  })();
  const modeValue = (effectiveMode === 'agent') ? (isAskLikeInput ? 'ASK' : 'AGENT') : effectiveMode.toUpperCase();
      // API sin estado: enviar todo el historial user/assistant de la sesión actual
      const history = [...messages, userMsg]
        .filter(m => m.sender !== 'system')
        .map(m => ({
          role: m.sender === 'ai' ? 'assistant' : 'user',
          content: m.text,
        }));
  // Adjuntar contexto de sesión al último mensaje del historial para que el backend tenga memoria extendida
  const historyWithCtx = history.map((h, idx, arr) => idx === arr.length - 1 && h.role === 'user'
    ? { ...h, content: `${h.content}${buildContextAppendix()}` }
    : h);
  const res = await invoke<AiResponse>('ai_chat', { req: { user_input: finalInput, mode: modeValue, history: historyWithCtx, state: agentState } });

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

      // NUEVO: Intentar leer un plan estructurado desde la respuesta (json dentro de fences o directo)
      let plan: Plan | null = null;
      {
        const candidates = [(res as any).code_output, (res as any).ai_response, (res as any).explanation, (res as any).summary];
        for (const c of candidates) {
          if (!c) continue;
          const block = extractCodeBlock(String(c));
          const maybe = tryParseJson(block || String(c));
          if (maybe?.plan?.steps && Array.isArray(maybe.plan.steps) && maybe.plan.steps.length > 0) {
            plan = { title: maybe.plan.title, steps: maybe.plan.steps };
            break;
          }
        }
      }

      // NUEVO: detectar acciones UI y convertirlas a script ejecutable (en un solo bloque)
      let actionsScript: { script: string; reason?: string } | null = null;
      {
        const candidates = [(res as any).ai_response, (res as any).explanation, (res as any).summary];
        for (const c of candidates) {
          if (!c) continue;
          const block = extractCodeBlock(String(c));
          const maybe = tryParseJson(block || String(c));
          if (maybe && (maybe.actions || (maybe.version && String(maybe.version).startsWith('ui-v')))) {
            const built = buildScriptFromActions(maybe);
            // Si el usuario dijo "y luego ejecútamela" o similar, y se creó un .py/.sh, añadir ejecución al final
            try {
              const askExec = /\bejecuta\b|\bejecutame\b|\bejecutamela\b|\bejecutarlo\b|\bejecutarla\b/i.test(finalInput);
              if (askExec && Array.isArray(maybe.actions)) {
                // Tomar el último archivo creado
                const created = [...maybe.actions].reverse().find((a: any) => String(a?.type || a?.action || '').toLowerCase() === 'create_file');
                const p = created?.path || created?.file || created?.name;
                if (p && built && built.script && !/\bpython3\b|\bbash\b|\bnode\b/.test(built.script)) {
                  const pl = String(p).toLowerCase();
                  if (pl.endsWith('.py')) built.script += `\npython3 ${JSON.stringify(p)}`;
                  else if (pl.endsWith('.sh')) built.script += `\nbash ${JSON.stringify(p)}`;
                }
              }
            } catch {}
            if (built && built.script) { actionsScript = built; break; }
          }
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

      // Nota: No auto-ejecutar. El usuario debe tener un botón para ejecutar.

  // Generar tarjeta de confirmación en modo AGENT
      // En AGENT no mostramos tarjetas de confirmación; el usuario puede ejecutar desde el botón "Ejecutar" del bloque
      let createdConfirmation = false;

      // Construir texto visible: mantener el contenido tal cual (incluido el bloque de código) en modo ASK
  let displayText = aiText;
  // En ASK mantener fences y etiqueta de lenguaje para copiar/pegar; en otros modos, limpiar
  const askLike = (effectiveMode === 'ask' || effectiveMode === 'agent');
  // Si estamos en agente y no hay plan, y detectamos un único comando sin bloque de código,
  // añade un bloque de código para ofrecer el botón de ejecutar.
  if (effectiveMode === 'agent' && !plan) {
    const hasFence = /```[\s\S]*```/.test(displayText || '');
    // Preferir script construido desde acciones JSON si existe
    if (actionsScript && actionsScript.script) {
      const atomic = actionsScript.script;
      displayText = `${displayText}\n\n\n\n\u0060\u0060\u0060bash\n${atomic}\n\u0060\u0060\u0060`;
    } else if (!hasFence && cmd && isLikelyShell(cmd)) {
      const atomic = getFirstAtomic(cmd);
      if (atomic) {
        displayText = `${displayText}\n\n\n\n\u0060\u0060\u0060bash\n${atomic}\n\u0060\u0060\u0060`;
      }
    }
  }
  const displayTextClean = askLike ? (displayText || '') : cleanText(displayText);

      // Limpiar meta
      const metaWithFlag: any = { ...(res as any) };
      const cleanedMeta = { ...metaWithFlag } as any;
      cleanedMeta.chat_mode = effectiveMode; // tag to control rendering later
      if (cleanedMeta.summary) cleanedMeta.summary = cleanText(cleanedMeta.summary);
      if (cleanedMeta.explanation) cleanedMeta.explanation = cleanText(cleanedMeta.explanation);
      if (cleanedMeta.ai_response) cleanedMeta.ai_response = cleanText(cleanedMeta.ai_response);

      // Aprender entidades del backend (si las provee)
      try {
        const createdDir = (res as any).created_dir as string | undefined;
        if (createdDir) { await setLastPath(createdDir, 'dir'); }
        const createdFile = (res as any).created_file as string | undefined;
        if (createdFile) { await setLastFile(createdFile, ''); await setLastPath(createdFile, 'file'); }
      } catch {}

      // Deduplicar: si summary/explanation coinciden con el texto mostrado o entre sí, ocultarlos
      const norm = (s?: string | null) => (s || '')
        .replace(/[`]/g, '')
        .replace(/[.,;:!?¡¿\"']+/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
  if (actionsScript?.reason && !cleanedMeta.reason) cleanedMeta.reason = actionsScript.reason;
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

      // Sin fallback local: el backend debe devolver un plan/acciones/código adecuado cuando la intención es crear un archivo.

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
      // Adjuntar plan y clave de progreso si viene del backend
      if (plan) {
        (cleanedMeta as any).plan = plan;
        (cleanedMeta as any).planProgressKey = `${sessionId || 'local'}:${Date.now()}`;
      }
      // Adjuntar razón del script de acciones si aplica, para que RenderAgent la muestre encima
      if (actionsScript?.reason && !(cleanedMeta as any).reason) {
        (cleanedMeta as any).reason = actionsScript.reason;
      }
      const aiMsg: Message = { id: String(Date.now() + 1), sender: 'ai', text: displayTextClean, meta: cleanedMeta };
      setMessages(prev => [...prev, aiMsg]);

      // NUEVO: si estamos en AGENT, y hay señales de error recientes, emitir una tarjeta de ayuda
      if (effectiveMode === 'agent') {
        const lastExit = mem.lastExitCode ?? cleanedMeta?.state?.lastExitCode;
        const stderrTail = mem.lastStderrTail ?? cleanedMeta?.state?.lastStdoutTail; // prefer local mem stderr
        const stdoutTail = mem.lastStdoutTail ?? cleanedMeta?.state?.lastStdoutTail;
        const lastCmd = mem.lastCommand;
        if (typeof lastExit === 'number' && lastExit !== 0) {
          // Generar una firma simple del error desde stderr o stdout
          const sigSrc = (mem.lastStderrTail || '').split(/\r?\n/).filter(Boolean).slice(-3).join(' | ') ||
                         (stderrTail || '').toString().split(/\r?\n/).filter(Boolean).slice(-3).join(' | ') ||
                         (stdoutTail || '').toString().split(/\r?\n/).filter(Boolean).slice(-3).join(' | ');
          const errMsg: Message = {
            id: String(Date.now() + 2),
            sender: 'ai',
            text: 'Detecté un error en la última ejecución. ¿Quieres que lo analice y proponga una corrección?',
            meta: {
              chat_mode: 'agent' as any,
              errorDetected: true,
              errorSignature: sigSrc || 'error-desconocido',
              errorData: { lastCommand: lastCmd, exitCode: lastExit, stdoutTail, stderrTail: mem.lastStderrTail },
            } as any
          };
          setMessages(prev => [...prev, errMsg]);
        }
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

  {/* Context summary deshabilitado temporalmente */}

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
                      ? <RenderAgent content={msg.text} sessionId={sessionId} cacheKey={msg.id} meta={msg.meta} onExecuted={async (cmd) => {
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
            {/* NUEVO: tarjeta de ayuda cuando detectamos un error */}
            {msg.meta?.errorDetected && (
              <div className="agent-card">
                <div className="agent-header">
                  <span>Error detectado</span>
                  {typeof msg.meta?.errorData?.exitCode === 'number' && (
                    <span className="agent-step">exit {msg.meta.errorData.exitCode}</span>
                  )}
                </div>
                {msg.meta?.errorSignature && (
                  <div className="agent-explainer">{msg.meta.errorSignature}</div>
                )}
                {msg.meta?.errorData?.lastCommand && (
                  <pre className="agent-code"><code>{msg.meta.errorData.lastCommand}</code></pre>
                )}
                <div className="agent-actions">
                  <button
                    className="agent-run"
                    onClick={() => {
                      // Empujar una consulta para análisis de error en modo AGENT
                      const errCtx = `Analiza este error y propón la corrección mínima.\nComando: ${msg.meta?.errorData?.lastCommand || '(desconocido)'}\nExit code: ${msg.meta?.errorData?.exitCode}\nSTDERR (cola):\n${msg.meta?.errorData?.stderrTail || ''}\nSTDOUT (cola):\n${msg.meta?.errorData?.stdoutTail || ''}`;
                      setInput(errCtx);
                      setTimeout(() => { const el = document.querySelector('.send-btn') as HTMLButtonElement | null; el?.click(); }, 10);
                    }}
                  >Analizar y corregir</button>
                  {msg.meta?.errorData?.stderrTail && (
                    <button
                      className="agent-back"
                      onClick={() => {
                        const insight = `Dame un diagnóstico preciso en español del siguiente error y cómo solucionarlo.\n\n${msg.meta?.errorData?.stderrTail}`;
                        setInput(insight);
                        setTimeout(() => { const el = document.querySelector('.send-btn') as HTMLButtonElement | null; el?.click(); }, 10);
                      }}
                    >Explicar error</button>
                  )}
                </div>
              </div>
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
                         const finalCmd = enforcePythonInvoker(toSend);
                         await invoke('ssh_stdin', { id: sessionId, data: finalCmd + '\n' });
                         // Marcar tarjeta como procesada y eliminar el banner correspondiente
                         setMessages(prev => prev
                           .map(m => m.id === msg.id ? { ...m, meta: { ...m.meta, processed: true } } : m)
                           .filter(m => !(m.sender === 'system' && m.meta?.requiresConfirmation && m.meta?.command && String(m.meta.command).trim() === toSend))
                         );
                         await setLastCommand(finalCmd);
                         // Si es un 'cd <dir>', registra ese directorio como lastPath
                         try {
                           const mCd = finalCmd.match(/^\s*cd\s+(.+)$/);
                           if (mCd && mCd[1]) {
                             const raw = mCd[1].trim();
                             const dir = raw.replace(/^"|"$/g, '');
                             await setLastPath(dir, 'dir');
                           }
                         } catch {}
                         // Si es un mkdir, guarda el directorio creado como lastPath
                         const mk = finalCmd.match(/^\s*mkdir\s+([^\s]+)/);
                         if (mk && mk[1]) {
                           try { await setLastPath(mk[1].trim(), 'dir'); } catch {}
                         }
                         // Si creamos archivo con touch/echo/printf/tee/cat >, también registra lastFile y lastPath(file)
                         try {
                           let created: string | null = null;
                           const mTouch = finalCmd.match(/^\s*touch\s+(\S+)/);
                           if (mTouch) created = mTouch[1];
                           const mRedir = finalCmd.match(/>\>?\s*([^\s]+)/);
                           if (!created && mRedir) created = mRedir[1];
                           const mHeredoc = finalCmd.match(/^(?:cat\s+>\s*|tee\s+)(\S+)\s*<</);
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