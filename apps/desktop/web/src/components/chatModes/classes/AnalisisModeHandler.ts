import { BaseModeHandler } from './BaseModeHandler';
import { ModeHandlerContext, Message } from '../types';
import { invoke } from '@tauri-apps/api/core';
import { detectAnalysisIntent } from '../../../api/intent';

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
    console.log('[AnalisisModeHandler] send() llamado con:', raw);

    // ============================================
    // 📝 PASO 1: HEURÍSTICAS RÁPIDAS (sin tokens)
    // ============================================
    // Primero intentamos detectar con reglas rápidas para ahorrar tokens de IA
    
    // Patrones de comando básicos
    const analyzeReLoose = /^(\S+)\s+(.+)/i;
    const editRe = /^(editar|modifica|modificar|cambiar)\s+(\S+)(?:\s+con\s+(.+))?/i;
    const applyRe = /^(aplicar|apply)\s+(\S+)/i;
    const revertRe = /^(revertir|revert|restore)\s+(\S+)/i;
    const backupsRe = /^(backups|listar\s+backups|list\s+backups)\s+(\S+)/i;
    const whatFileRe1 = /^(que|qué)\s+hay\s+en\s+(?:este\s+)?archivo\s+(\S+)/i;
    const whatFileRe2 = /^(que|qué)\s+hay\s+en\s+(\S+)/i;
    const directModifyPrefix = /^(modificame|modifica|cambia|cambiar|modificar)\b/i;

    let heuristicMatched = false;
    let m: RegExpMatchArray | null;
    console.log('[AnalisisModeHandler] Iniciando búsqueda de heurísticas para:', raw);

    try {

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
        heuristicMatched = true;  // ✅ Marcamos que heurística coincidió
        const path = (m[2] || '').replace(/[?]+$/, '');
        if (path) {
          try {
            const r = await invokeWithTimeout<AnalyzeFileResponse>('analyze_any_file', { session_id: ctx.sessionId || undefined, path }, 45000, 1);
            const a = r.analysis;
            
            // Función para formatear el análisis con las 4 secciones visuales
            const formatAnalysisText = (analysis: any): string => {
              let output = `📄 **Análisis de ${analysis.path}**\n`;
              output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
              output += `📊 ${analysis.language || 'desconocido'} • ${analysis.line_count} líneas • ${analysis.size_bytes} bytes\n\n`;
              
              const useAi = !!analysis.purpose_from_ai;
              
              if (useAi && analysis.purpose) {
                // Nuevo formato con 4 secciones
                output += `🎯 **PROPÓSITO DEL PROGRAMA**\n${analysis.purpose}\n\n`;
                
                if (analysis.key_points && analysis.key_points.length > 0) {
                  // Verificar si los key_points son secciones completas (ya formateadas del backend)
                  const firstPoint = analysis.key_points[0];
                  const isSectionFormat = firstPoint.includes('**') && (
                    firstPoint.includes('EJEMPLO') || 
                    firstPoint.includes('MEJORAS') || 
                    firstPoint.includes('CONCLUSIONES')
                  );
                  
                  if (isSectionFormat) {
                    // Las secciones ya vienen formateadas del backend, solo agregarles iconos
                    for (const section of analysis.key_points) {
                      let icon = '📋';
                      if (section.includes('EJEMPLO')) icon = '▶️';
                      else if (section.includes('MEJORAS')) icon = '🔧';
                      else if (section.includes('CONCLUSIONES')) icon = '📊';
                      
                      output += `${icon} ${section}\n\n`;
                    }
                  } else {
                    // Fallback: clasificar bullets individuales (formato antiguo)
                    const ejemploPoints: string[] = [];
                    const mejorasPoints: string[] = [];
                    const conclusionesPoints: string[] = [];
                    const otrosPoints: string[] = [];
                    
                    for (const kp of analysis.key_points) {
                      const lower = kp.toLowerCase();
                      if (lower.includes('ejecuta') || lower.includes('comando') || lower.includes('entrada') || lower.includes('salida') || lower.includes('ejemplo')) {
                        ejemploPoints.push(kp);
                      } else if (lower.includes('mejora') || lower.includes('optimiza') || lower.includes('sugiere') || lower.includes('validación') || lower.includes('seguridad')) {
                        mejorasPoints.push(kp);
                      } else if (lower.includes('conclusión') || lower.includes('calidad') || lower.includes('fortaleza') || lower.includes('consideración')) {
                        conclusionesPoints.push(kp);
                      } else {
                        otrosPoints.push(kp);
                      }
                    }
                    
                    if (ejemploPoints.length > 0) {
                      output += `▶️ **EJEMPLO DE EJECUCIÓN**\n`;
                      ejemploPoints.forEach(p => output += `  • ${p}\n`);
                      output += `\n`;
                    }
                    
                    if (mejorasPoints.length > 0) {
                      output += `🔧 **POSIBLES MEJORAS**\n`;
                      mejorasPoints.forEach(p => output += `  • ${p}\n`);
                      output += `\n`;
                    }
                    
                    if (conclusionesPoints.length > 0) {
                      output += `📊 **CONCLUSIONES**\n`;
                      conclusionesPoints.forEach(p => output += `  • ${p}\n`);
                      output += `\n`;
                    }
                    
                    if (otrosPoints.length > 0) {
                      output += `📋 **DETALLES ADICIONALES**\n`;
                      otrosPoints.forEach(p => output += `  • ${p}\n`);
                    }
                  }
                }
              } else {
                // Formato anterior para análisis sin IA
                if (!useAi && analysis.narrative) {
                  output += `📝 ${analysis.narrative}\n\n`;
                }
                if (analysis.purpose) {
                  output += `🎯 **Propósito:** ${analysis.purpose}\n\n`;
                }
                if (analysis.key_points && analysis.key_points.length) {
                  output += `📋 **Detalles clave:**\n`;
                  for (const kp of analysis.key_points.slice(0,6)) output += `  • ${kp}\n`;
                } else if (analysis.semantic_summary) {
                  output += `💡 ${analysis.semantic_summary}\n`;
                }
              }
              
              return output;
            };
            
            const text = formatAnalysisText(a);
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
        heuristicMatched = true;  // ✅ Marcamos que heurística coincidió
        const pathPart = m[2];
        const path = extractPathCandidate(pathPart);
        if (!path) {
          ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: ONLY_ANALYZE_MSG }]);
          return;
        }
        try {
          const r = await invokeWithTimeout<AnalyzeFileResponse>('analyze_any_file', { session_id: ctx.sessionId || undefined, path }, 45000, 1);
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
          
          // Reutilizar la función de formateo visual
          const formatAnalysisText = (analysis: any, showElements: boolean = false): string => {
            let output = `📄 **Análisis de ${analysis.path}**\n`;
            output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            output += `📊 ${analysis.language || 'desconocido'} • ${analysis.line_count} líneas • ${analysis.size_bytes} bytes\n`;
            if (showElements && elements) output += `🔍 ${elements}\n`;
            output += `\n`;
            
            const useAi = !!analysis.purpose_from_ai;
            
            if (useAi && analysis.purpose) {
              // Nuevo formato con 4 secciones
              output += `🎯 **PROPÓSITO DEL PROGRAMA**\n${analysis.purpose}\n\n`;
              
              if (analysis.key_points && analysis.key_points.length > 0) {
                // Verificar si los key_points son secciones completas (ya formateadas del backend)
                const firstPoint = analysis.key_points[0];
                const isSectionFormat = firstPoint.includes('**') && (
                  firstPoint.includes('EJEMPLO') || 
                  firstPoint.includes('MEJORAS') || 
                  firstPoint.includes('CONCLUSIONES')
                );
                
                if (isSectionFormat) {
                  // Las secciones ya vienen formateadas del backend, solo agregarles iconos
                  for (const section of analysis.key_points) {
                    let icon = '📋';
                    if (section.includes('EJEMPLO')) icon = '▶️';
                    else if (section.includes('MEJORAS')) icon = '🔧';
                    else if (section.includes('CONCLUSIONES')) icon = '📊';
                    
                    output += `${icon} ${section}\n\n`;
                  }
                } else {
                  // Fallback: clasificar bullets individuales
                  const ejemploPoints: string[] = [];
                  const mejorasPoints: string[] = [];
                  const conclusionesPoints: string[] = [];
                  const otrosPoints: string[] = [];
                  
                  for (const kp of analysis.key_points) {
                    const lower = kp.toLowerCase();
                    if (lower.includes('ejecuta') || lower.includes('comando') || lower.includes('entrada') || lower.includes('salida') || lower.includes('ejemplo') || lower.includes('uso')) {
                      ejemploPoints.push(kp);
                    } else if (lower.includes('mejora') || lower.includes('optimiza') || lower.includes('sugiere') || lower.includes('validación') || lower.includes('seguridad') || lower.includes('implementar')) {
                      mejorasPoints.push(kp);
                    } else if (lower.includes('conclusión') || lower.includes('calidad') || lower.includes('fortaleza') || lower.includes('consideración') || lower.includes('evaluación')) {
                      conclusionesPoints.push(kp);
                    } else {
                      otrosPoints.push(kp);
                    }
                  }
                  
                  if (ejemploPoints.length > 0) {
                    output += `▶️ **EJEMPLO DE EJECUCIÓN**\n`;
                    ejemploPoints.forEach(p => output += `  • ${p}\n`);
                    output += `\n`;
                  }
                  
                  if (mejorasPoints.length > 0) {
                    output += `🔧 **POSIBLES MEJORAS**\n`;
                    mejorasPoints.forEach(p => output += `  • ${p}\n`);
                    output += `\n`;
                  }
                  
                  if (conclusionesPoints.length > 0) {
                    output += `📊 **CONCLUSIONES**\n`;
                    conclusionesPoints.forEach(p => output += `  • ${p}\n`);
                    output += `\n`;
                  }
                  
                  if (otrosPoints.length > 0) {
                    output += `📋 **DETALLES ADICIONALES**\n`;
                    otrosPoints.forEach(p => output += `  • ${p}\n`);
                  }
                }
              }
            } else {
              // Formato anterior para análisis sin IA
              if (!useAi && analysis.narrative) {
                output += `📝 ${analysis.narrative}\n\n`;
              }
              if (analysis.purpose) {
                output += `🎯 **Propósito:** ${analysis.purpose}\n\n`;
              }
              if (analysis.key_points && analysis.key_points.length) {
                output += `📋 **Detalles clave:**\n`;
                for (const kp of analysis.key_points.slice(0,6)) output += `  • ${kp}\n`;
              } else if (analysis.semantic_summary) {
                output += `💡 ${analysis.semantic_summary}\n`;
              }
            }
            
            return output;
          };
          
          const narrative = formatAnalysisText(a, true);
          ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: narrative }]);
          return;
        } catch (e:any) {
          ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `No se pudo analizar ${path}: ${String(e)}` }]);
          return;
        }
      }

      // MODIFICACIÓN DIRECTA SIN "con" (auto-aplicar)
      if (directModifyPrefix.test(raw) && !editRe.test(raw)) {
        heuristicMatched = true;  // ✅ Marcamos que heurística coincidió
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
        heuristicMatched = true;  // ✅ Marcamos que heurística coincidió
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
        heuristicMatched = true;  // ✅ Marcamos que heurística coincidió
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
        heuristicMatched = true;  // ✅ Marcamos que heurística coincidió
        const path = m[2];
        const res = await invoke<RevertFileResponse>('revert_file', { req: { path } });
        ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `Revertido ${path} desde backup ${res.restored_from}` }]);
        return;
      }

      // LIST BACKUPS
      if ((m = raw.match(backupsRe))) {
        heuristicMatched = true;  // ✅ Marcamos que heurística coincidió
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

      // Si parece que pide análisis pero con sólo un token (ej: nombre.py) -> orientar.
      const single = raw.split(/\s+/).length === 1 && /\.[a-zA-Z0-9]{1,6}$/.test(raw);
      if (single) {
        ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: `Escribe: analizame ${raw}` }]);
        return;
      }

      // PASO 2: Si ninguna heurística coincidió, usar DETECCIÓN POR IA (fallback inteligente)
      console.log('[AnalisisModeHandler] Antes de fallback IA. heuristicMatched:', heuristicMatched);
      if (!heuristicMatched) {
        console.log('[AnalisisModeHandler] No hubo match de heurística, usando detección por IA...');
        try {
          const intent = await detectAnalysisIntent(raw);
          console.log('[AnalisisModeHandler] Intent detectado:', intent);
          if (intent.wants_analysis && intent.filename) {
            console.log('[AnalisisModeHandler] IA detectó análisis para:', intent.filename);
            // Usuario quiere analizar un archivo, ejecutar análisis
            const path = intent.filename;
            const r = await invokeWithTimeout<AnalyzeFileResponse>('analyze_any_file', { session_id: ctx.sessionId || undefined, path }, 45000, 1);
            const a = r.analysis;
            
            // Manejar desambiguación (múltiples archivos con el mismo nombre)
            if (a.disambiguation_required && a.candidates && a.candidates.length > 1) {
              const text = `Nombre ambiguo para ${path}.`;
              ctx.setMessages(prev => [...prev, { 
                id: String(Date.now()), 
                sender: 'ai', 
                text, 
                meta: { fileAnalysisDisambiguation: { base: path, candidates: a.candidates } } 
              }]);
              return;
            }
            
            // Reutilizamos la función de formateo que ya existe arriba (línea 130)
            const formatAnalysisText = (analysis: any): string => {
              let output = `📄 **Análisis de ${analysis.path}**\n`;
              output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
              output += `📊 ${analysis.language || 'desconocido'} • ${analysis.line_count} líneas • ${analysis.size_bytes} bytes\n\n`;
              
              const useAi = !!analysis.purpose_from_ai;
              
              if (useAi && analysis.purpose) {
                output += `🎯 **PROPÓSITO DEL PROGRAMA**\n${analysis.purpose}\n\n`;
                if (analysis.key_points && analysis.key_points.length > 0) {
                  const firstPoint = analysis.key_points[0];
                  const isSectionFormat = firstPoint.includes('**') && (firstPoint.includes('EJEMPLO') || firstPoint.includes('MEJORAS') || firstPoint.includes('CONCLUSIONES'));
                  if (isSectionFormat) {
                    for (const section of analysis.key_points) {
                      let icon = '📋';
                      if (section.includes('EJEMPLO')) icon = '▶️';
                      else if (section.includes('MEJORAS')) icon = '🔧';
                      else if (section.includes('CONCLUSIONES')) icon = '📊';
                      output += `${icon} ${section}\n\n`;
                    }
                  }
                }
              } else {
                if (!useAi && analysis.narrative) output += `📝 ${analysis.narrative}\n\n`;
                if (analysis.purpose) output += `🎯 **Propósito:** ${analysis.purpose}\n\n`;
                if (analysis.key_points && analysis.key_points.length) {
                  output += `📋 **Detalles clave:**\n`;
                  for (const kp of analysis.key_points.slice(0,6)) output += `  • ${kp}\n`;
                }
              }
              return output;
            };
            
            const text = formatAnalysisText(a);
            ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text }]);
            return;
          }
        } catch (aiErr) {
          // Si la detección por IA falla, continuar al mensaje de error estándar
          console.warn('Detección de intención por IA falló:', aiErr);
        }
      }

      // Intentos bloqueados explícitos (solo después de intentar heurísticas y IA)
      if (isBlockedIntentStart(raw)) {
        ctx.setMessages(prev => [...prev, { id: String(Date.now()), sender: 'ai', text: ONLY_ANALYZE_MSG }]);
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
