import { BaseModeHandler } from './BaseModeHandler';
import { ModeHandlerContext, Message } from '../types';
import { invoke } from '@tauri-apps/api/core';

// Helpers internos para intención fuzzy de "analizar"
const ANALYZE_CANON = 'analiza';
const ANALYZE_VARIANTS_BASE = [
  'analiza','analizar','analizame','analízame','analizame','analisa','analiceme','analiceme','analicemen','analiceme',
  'analizad','analizalo','analizalo','analissame','analisame','analisar','analisamelo','que hace '
];

// Sinónimos / expresiones de inspección que deben equivaler a analizar
const INSPECT_SYNONYMS_BASE = [
  'ver','mostrar','muestra','muestrame','muéstrame','mostrame','muestrame','ensename','enséñame','ensename',
  'lee','leer','abrir','abre','open','revisa','revisar','examinar','examina','examíname','inspeccionar','inspecciona','visualiza','visualizar'
];
// Normaliza: minúsculas, sin tildes, colapsa letras repetidas.
function normalizeToken(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu,'')
    .replace(/([^\d])\1{2,}/g,'$1$1') // deja como máximo 2 repeticiones
    .replace(/[^a-z0-9]/g,'');
}
function levenshtein(a:string,b:string):number { // pequeño por inputs cortos
  const m=a.length,n=b.length; if(!m) return n; if(!n) return m; const dp=Array.from({length:m+1},()=>new Array<number>(n+1));
  for(let i=0;i<=m;i++) dp[i][0]=i; for(let j=0;j<=n;j++) dp[0][j]=j;
  for(let i=1;i<=m;i++){ for(let j=1;j<=n;j++){ const cost=a[i-1]===b[j-1]?0:1; dp[i][j]=Math.min(
    dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost
  ); }} return dp[m][n];
}
const ANALYZE_VARIANTS_NORM = Array.from(new Set(ANALYZE_VARIANTS_BASE.map(normalizeToken)));
const INSPECT_SYNONYMS_NORM = Array.from(new Set(INSPECT_SYNONYMS_BASE.map(normalizeToken)));

function isAnalyzeCommand(tokenRaw: string): boolean {
  const t = normalizeToken(tokenRaw);
  if (!t) return false;
  // coincidencia directa o distancia <=2 con algún canónico
  if (ANALYZE_VARIANTS_NORM.includes(t)) return true;
  return ANALYZE_VARIANTS_NORM.some(v => levenshtein(t, v) <= 2);
}

function isInspectSynonym(tokenRaw: string): boolean {
  const t = normalizeToken(tokenRaw);
  if (!t) return false;
  if (INSPECT_SYNONYMS_NORM.includes(t)) return true;
  // Para sinónimos usamos tolerancia menor (<=1) para reducir falsos positivos
  return INSPECT_SYNONYMS_NORM.some(v => levenshtein(t, v) <= 1);
}

// Palabras que indican intención NO permitida (crear, consulta general, etc.)
const BLOCKED_INTENTS = [
  'crea','create','creame','crear','haz','generar','genera','consultame','consulta','preguntame','explicame','explícame','dime','resume','resumeme','ayudame','ayúdame'
];
const BLOCKED_NORM = BLOCKED_INTENTS.map(normalizeToken);
function isBlockedIntentStart(raw: string): boolean {
  const first = raw.trim().split(/\s+/)[0] || '';
  const n = normalizeToken(first);
  if (!n) return false;
  if (BLOCKED_NORM.includes(n)) return true;
  return BLOCKED_NORM.some(v => levenshtein(n,v) <= 1);
}

const ONLY_ANALYZE_MSG = 'Modo análisis: sólo puedo analizar archivos. Ejemplos: "analizame main.py", "analiza numero.sh"';

// Tipo extendido para análisis con desambiguación (definición única)
interface AnalyzeFileResponse { analysis: { path: string; language?: string; line_count: number; size_bytes: number; sha256: string; head: string; tail: string; summary_hint: string; semantic_summary?: string | null; purpose?: string | null; key_points?: string[] | null; purpose_from_ai?: boolean | null; narrative?: string | null; candidates?: string[] | null; disambiguation_required?: boolean | null; ai_only?: boolean | null; }; }
interface PlanFileEditResponse { proposed_content: string; diff: string; needs_confirmation: boolean; }
interface ApplyFileEditResponse { backup_path: string; bytes_written: number; sha256_new: string; }
interface ListBackupsResponse { backups: { path: string; size: number }[]; }
interface RevertFileResponse { restored_from: string; }

export class AnalisisModeHandler extends BaseModeHandler {
  help = 'Análisis y edición segura de archivos: analiza, planea cambios, aplica, lista backups y revierte.';

  async send(finalInput: string, userMsg: Message, ctx: ModeHandlerContext) {
    const raw = finalInput.trim();

    // Patrones de comando básicos (algunos se complementan con fuzzy)
  const analyzeReLoose = /^(\S+)\s+(.+)/i; // primer token + resto (usaremos fuzzy con el primer token)
    const editRe = /^(editar|modifica|modificar|cambiar)\s+(\S+)(?:\s+con\s+(.+))?/i;
    const applyRe = /^(aplicar|apply)\s+(\S+)/i;
    const revertRe = /^(revertir|revert|restore)\s+(\S+)/i;
    const backupsRe = /^(backups|listar\s+backups|list\s+backups)\s+(\S+)/i;
  // Pregunta tipo "que hay en este archivo foo.py" o "qué hay en foo.py"
  const whatFileRe1 = /^(que|qué)\s+hay\s+en\s+(?:este\s+)?archivo\s+(\S+)/i;
  const whatFileRe2 = /^(que|qué)\s+hay\s+en\s+(\S+)/i;
  // Modificación directa estilo natural: "modificame el script que se llama script.sh para que ..."
  const directModifyPrefix = /^(modificame|modifica|cambia|cambiar|modificar)\b/i;

    try {
      let m: RegExpMatchArray | null;

      // CONSULTA "que hay en ..." / "qué hay en ..."
      const invokeWithTimeout = async <T>(cmd: string, args: any, ms = 15000, retries = 1): Promise<T> => {
        let attempt = 0;
        while (true) {
          try {
            return await Promise.race([
              invoke<T>(cmd, args),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Tiempo de espera excedido')), ms))
            ]);
          } catch (e) {
            if (attempt < retries) {
              attempt++;
              // pequeño backoff
              await new Promise(r => setTimeout(r, 300 + attempt*200));
              continue;
            }
            throw e;
          }
        }
      };

      if ((m = raw.match(whatFileRe1)) || (m = raw.match(whatFileRe2))) {
        const path = (m[2] || '').replace(/[?]+$/, '');
        if (path) {
          try {
            const r = await invokeWithTimeout<AnalyzeFileResponse>('analyze_any_file', { session_id: ctx.sessionId || undefined, path }, 20000, 1);
            const a = r.analysis;
            let extra = '';
            const useAi = !!a.purpose_from_ai;
            if (!useAi && a.narrative) {
              extra += `\nNarrativa: ${a.narrative}`;
            }
            if (a.purpose || (a.key_points && a.key_points.length) || useAi) {
              if (useAi) {
                extra += `\nDescripción : ${a.purpose || '—'}`;
              } else {
                extra += `\nPropósito: ${a.purpose || '—'}`;
              }
              if (a.key_points && a.key_points.length) {
                extra += `\nDetalles clave:`;
                for (const kp of a.key_points.slice(0,6)) extra += `\n • ${kp}`;
              }
            } else if (a.semantic_summary) {
              extra += `\nExplicación: ${a.semantic_summary}`;
            }
            const text = `Resumen de ${a.path}\nTipo/Lenguaje probable: ${a.language || 'desconocido'}\nLíneas: ${a.line_count} | Tamaño: ${a.size_bytes} bytes\nDescripción: ${a.summary_hint}${extra}`;
            ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text }]);
            return;
          } catch (e:any) {
            ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `No se pudo analizar ${path}: ${String(e)}` }]);
            return;
          }
        }
      }

      // INTENCIÓN ANALIZAR (fuzzy). Se evalúa primer token y también "que hay en ..." arriba.
      if ((m = raw.match(analyzeReLoose)) && (isAnalyzeCommand(m[1]) || isInspectSynonym(m[1]))) {
        const pathPart = m[2];
        const path = extractPathCandidate(pathPart);
        if (!path) {
          ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: ONLY_ANALYZE_MSG }]);
          return;
        }
        try {
          const r = await invokeWithTimeout<AnalyzeFileResponse>('analyze_any_file', { session_id: ctx.sessionId || undefined, path }, 20000, 1);
          const a = r.analysis;
          if (a.disambiguation_required && a.candidates && a.candidates.length > 1) {
            // Ya no mostramos el listado textual crudo; la UI renderiza una tarjeta estilizada usando meta.
            const text = `Nombre ambiguo para ${path}.`;
            ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text, meta: { fileAnalysisDisambiguation: { base: path, candidates: a.candidates } } }]);
            return;
          }
          // Extraer señales ligeras del contenido (solo head para rapidez)
          const sample = `${a.head}\n${a.tail}`;
          const items: string[] = [];
          const lines = sample.split(/\n/);
          for (const line of lines) {
            const l = line.trim();
            if (items.length >= 8) break;
            let mFn;
            if ((mFn = l.match(/^def\s+([A-Za-z0-9_]+)/))) items.push(`func ${mFn[1]}()`);
            else if ((mFn = l.match(/^class\s+([A-Za-z0-9_]+)/))) items.push(`class ${mFn[1]}`);
            else if ((mFn = l.match(/^fn\s+([A-Za-z0-9_]+)/))) items.push(`fn ${mFn[1]}()`);
            else if ((mFn = l.match(/^function\s+([A-Za-z0-9_]+)/))) items.push(`func ${mFn[1]}()`);
          }
          const elements = items.length ? `Elementos: ${items.join(', ')}.` : '';
          let extra = '';
          const useAi = !!a.purpose_from_ai;
          if (!useAi && a.narrative) {
            extra += `\nNarrativa: ${a.narrative}`;
          }
          if (a.purpose || (a.key_points && a.key_points.length) || useAi) {
            if (useAi) {
              extra += `\nDescripción (IA): ${a.purpose || '—'}`;
            } else {
              extra += `\nPropósito: ${a.purpose || '—'}`;
            }
            if (a.key_points && a.key_points.length) {
              extra += `\nDetalles clave:`;
              for (const kp of a.key_points.slice(0,6)) extra += `\n • ${kp}`;
            }
          } else if (a.semantic_summary) {
            extra += `\nExplicación: ${a.semantic_summary}`;
          }
          const narrative = `Resumen de ${a.path}\nTipo/Lenguaje probable: ${a.language || 'desconocido'}\nLíneas: ${a.line_count} | Tamaño: ${a.size_bytes} bytes${elements ? '\n'+elements : ''}${extra}`;
          ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: narrative }]);
          return;
        } catch (e:any) {
          ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `No se pudo analizar ${path}: ${String(e)}` }]);
          return;
        }
      }

      // MODIFICACIÓN DIRECTA SIN "con" (auto-aplicar)
      if (directModifyPrefix.test(raw) && !editRe.test(raw)) {
        // Heurística: localizar primer token con extensión típica y tomar el resto como instrucción
        const tokens = raw.split(/\s+/);
        let fileIdx = -1;
        const exts = ['.sh','.py','.ts','.tsx','.js','.rs','.toml','.yml','.yaml','.json','.md'];
        for (let i=0;i<tokens.length;i++) {
          const t = tokens[i].replace(/['"?,]/g,'');
            if (exts.some(ext => t.toLowerCase().endsWith(ext))) { fileIdx = i; break; }
        }
        if (fileIdx !== -1) {
          const path = tokens[fileIdx].replace(/['"?,]/g,'');
          // Construir instrucción eliminando palabras de relleno previas
          const filler = new Set(['modificame','modifica','cambia','cambiar','modificar','el','la','archivo','script','que','se','llama']);
          const after = tokens.slice(fileIdx+1).filter(t => t.trim().length>0).join(' ').trim();
          let instruction = after;
          if (!instruction) {
            // Si no hay texto después, reintentar tomando tokens entre verbo y archivo que no son filler
            const between = tokens.slice(0,fileIdx).filter(t => !filler.has(t.toLowerCase())).join(' ');
            if (between) instruction = between;
          }
          instruction = instruction.replace(/^para\s+que\s+/i,'');
          if (instruction) {
            try {
              const plan = await invokeWithTimeout<PlanFileEditResponse>('plan_file_edit', { req: { path, instruction } });
              if (!plan.diff || /--- original\n\+\+\+ propuesto\s*$/.test(plan.diff.trim())) {
                ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `No se generaron cambios para ${path}.` }]);
                return;
              }
              // Aplicar directamente
              const applied = await invoke<ApplyFileEditResponse>('apply_file_edit', { req: { path, new_content: plan.proposed_content } });
              const msg: Message = {
                id: String(Date.now()),
                sender: 'ai',
                text: `Cambios aplicados automáticamente a ${path}. Backup: ${applied.backup_path}\nDiff:\n\n\`\n${plan.diff}\n\``,
                meta: { fileEdit: { path, diff: plan.diff, proposedContent: plan.proposed_content, needsConfirmation: false } }
              };
              ctx.setMessages(prev => [...prev, msg]);
              return;
            } catch (e:any) {
              ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `Error al modificar ${path}: ${String(e)}` }]);
              return;
            }
          }
        }
      }

      // PLAN EDIT
      if ((m = raw.match(editRe))) {
        const path = m[2];
        const instruction = (m[3] || '').trim();
        if (!instruction) {
          ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: 'Falta la instrucción después de "con".' }]);
          return;
        }
  const res = await invokeWithTimeout<PlanFileEditResponse>('plan_file_edit', { req: { path, instruction } });
        if (!res.diff || res.diff.trim() === '' || res.diff.trim() === '--- original\n+++ propuesto') {
          ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: 'No se detectaron cambios propuestos (diff vacío).' }]);
          return;
        }
        const aiMsg: Message = {
          id: String(Date.now()),
            sender: 'ai',
            text: `Propuesta de edición para ${path} (requiere confirmación)\nInstrucción: ${instruction}\nDiff:\n\n\`\n${res.diff}\n\`\nEscribe: aplicar ${path} para aplicar, o descartar para cancelar.`,
            meta: { fileEdit: { path, diff: res.diff, proposedContent: res.proposed_content, needsConfirmation: true } }
        };
        ctx.setMessages(prev => [...prev, aiMsg]);
        return;
      }

      // APPLY
      if ((m = raw.match(applyRe))) {
        const path = m[2];
        // buscar última propuesta pendiente
        const pending = [...ctx.messages].reverse().find(msg => msg.meta?.fileEdit?.path === path && msg.meta.fileEdit.needsConfirmation);
        if (!pending) {
          ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `No hay propuesta pendiente para ${path}.` }]);
          return;
        }
        const proposedContent = pending.meta!.fileEdit!.proposedContent;
        const applied = await invoke<ApplyFileEditResponse>('apply_file_edit', { req: { path, newContent: proposedContent, new_content: proposedContent } });
        ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `Cambios aplicados a ${path}. Backup: ${applied.backup_path}` }]);
        return;
      }

      // REVERT
      if ((m = raw.match(revertRe))) {
        const path = m[2];
        const res = await invoke<RevertFileResponse>('revert_file', { req: { path } });
        ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `Revertido ${path} desde backup ${res.restored_from}` }]);
        return;
      }

      // LIST BACKUPS
      if ((m = raw.match(backupsRe))) {
        const path = m[2];
        const res = await invoke<ListBackupsResponse>('list_file_backups', { path });
        if (!res.backups.length) {
          ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `No hay backups para ${path}.` }]);
          return;
        }
        const lines = res.backups.map(b => `- ${b.path} (${b.size} bytes)`).join('\n');
        ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `Backups de ${path}:\n${lines}` }]);
        return;
      }

      // DESCARTAR
      if (/^descartar$/i.test(raw)) {
        ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: 'Propuesta descartada.' }]);
        return;
      }

      // Intentos bloqueados explícitos
      if (isBlockedIntentStart(raw)) {
        ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: ONLY_ANALYZE_MSG }]);
        return;
      }

      // Si parece que pide análisis pero con sólo un token (ej: nombre.py) -> orientar.
      const single = raw.split(/\s+/).length === 1 && /\.[a-zA-Z0-9]{1,6}$/.test(raw);
      if (single) {
        ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `Escribe: analizame ${raw}` }]);
        return;
      }

      // Último recurso: no hacer fallback a chat general.
      ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: ONLY_ANALYZE_MSG }]);
    } catch (err: any) {
      ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `Error: ${String(err)}` }]);
    }
  }
}

// Extrae ruta candidata soportando comillas o espacios.
function extractPathCandidate(rest: string): string | null {
  const trimmed = rest.trim();
  if (!trimmed) return null;
  // Si viene entre comillas simples, dobles o backticks
  const mQuoted = trimmed.match(/^(["'`])(.*)\1(?:\s|$)/);
  if (mQuoted) {
    const content = mQuoted[2].trim();
    return sanitizePathToken(content);
  }
  // Hasta primer espacio si no hay comillas, pero permitir rutas con / y . y - _
  const firstSeg = trimmed.split(/\s+/)[0];
  return sanitizePathToken(firstSeg);
}

function sanitizePathToken(tok: string): string | null {
  let t = tok.replace(/[?;,]+$/,'');
  if (!t) return null;
  // Quitar trailing puntos repetidos (archivo.py..)
  t = t.replace(/\.+$/,'');
  return t;
}
