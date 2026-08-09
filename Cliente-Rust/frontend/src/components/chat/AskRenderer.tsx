import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { cleanText } from './chatUtils';
import { Message } from '../chatModes/types';
import CodeBlock from './CodeBlock';
import type { ChatAppearance } from './ChatMessageList';

interface AskRendererProps {
  content: string;
  sessionId?: string | null;
  setLastCommand?: (cmd: string) => Promise<void> | void;
  mode?: string;
  appearance?: ChatAppearance;
}

// Detecta si un bloque de código es ejecutable (script completo) o informativo (ejemplo)
const isExecutableCode = (code: string, precedingText: string): boolean => {
  const lines = code.split(/\r?\n/).filter(l => l.trim().length > 0);
  
  // REGLA 1: Si la MAYORÍA de líneas son comentarios (ej: lista de comandos con #), NO es ejecutable
  // Pero si es un comando individual corto (1-2 líneas), SÍ mostrarlo
  if (lines.length >= 3) {
    const commentLines = lines.filter(l => /^\s*#[^!]/.test(l)); // # pero no shebang (#!)
    if (commentLines.length > lines.length * 0.6) {
      // Más del 60% son comentarios = es una lista de ejemplos
      return false;
    }
  }
  
  // REGLA 2: Detectar si estamos en la sección de Explicación (🐧)
  // En esta sección, los bloques son informativos, no ejecutables
  const lastSectionMatch = precedingText.match(/###?\s*[🎯🐧💻✅❌]\s*([^\n]+)/g);
  if (lastSectionMatch && lastSectionMatch.length > 0) {
    const lastSection = lastSectionMatch[lastSectionMatch.length - 1];
    // Si estamos en sección Explicación (🐧 o "Explicación"), ocultar botones
    if (/🐧|Explicaci[óo]n/i.test(lastSection)) return false;
    // Si estamos en sección Comandos (💻 o "Comandos"), mostrar botones
    if (/💻|Comandos/i.test(lastSection)) return true;
  }
  
  // REGLA 3: Si contiene cat << 'EOF', es definitivamente ejecutable
  if (/cat\s+<<?\s*'?EOF'?/i.test(code)) return true;
  
  // REGLA 4: Si tiene shebang, es un script completo ejecutable  
  if (/^#!\/usr\/bin\/env\s+(bash|python|sh|node)/m.test(code)) return true;
  
  // REGLA 5: Si tiene múltiples líneas de código estructurado (funciones, clases, etc.)
  if (lines.length > 5) {
    const hasStructure = /(^|\n)\s*(def\s+|class\s+|function\s+|if\s+__name__|async\s+def)/.test(code);
    if (hasStructure) return true;
  }
  
  // REGLA 6: Comandos individuales (1-3 líneas) son SIEMPRE ejecutables
  // Esto incluye: ls, cd, chmod, mv, cp, etc.
  if (lines.length <= 3) {
    return true; // Siempre mostrar botones para comandos cortos
  }
  
  // Por defecto, si tiene más de 3 líneas y estructura, considerarlo ejecutable
  return lines.length > 3;
};

// Renderizador del modo ASK (reutilizable para respuestas AI)
export const AskRenderer: React.FC<AskRendererProps> = ({ content, sessionId, setLastCommand, mode, appearance = 'session' }) => {
  const isLanding = appearance === 'landing';
  const blocks: Array<{ type: 'code' | 'para'; lang?: string; body: string; precedingText?: string }> = [];
  const fenceRe = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;

  // NUEVO: Detectar el nombre de archivo del contenido completo ANTES de procesar bloques
  const detectFileInfo = (fullContent: string): { basename: string; extension: string; fullFilename: string } | null => {
    const catMatch = fullContent.match(/cat\s+>\s+([a-zA-Z0-9_-]+\.(sh|py|js|ts|cpp|c|java|rb))\s+<<'?EOF'?/);
    if (!catMatch) return null;
    
    const fullFilename = catMatch[1]; // ej: "calculadora.sh"
    const basename = fullFilename.split('.')[0]; // ej: "calculadora"
    const extension = fullFilename.split('.').pop() || ''; // ej: "sh"
    

    return { basename, extension, fullFilename };
  };
  
  const fileInfo = detectFileInfo(content);

  const guessLang = (txt: string): 'python' | 'bash' | undefined => {
    const t = txt || '';
    const hasPy = /(^|\n)\s*(def\s+|class\s+|import\s+|from\s+|print\(|input\(|if\s+.*:|elif\s+.*:|else:|while\s+|for\s+|try:|except\s+|with\s+)/.test(t);
    const hasBash = /(^|\n)\s*(#!\/usr\/bin\/env\s+bash|#!\/bin\/bash|echo\s+|read\s+-p|case\s+.*\sin|esac|chmod\s+|cat\s+>\s*|mkdir\s+|cd\s+|rm\s+|touch\s+|printf\s+)/.test(t);
    if (hasPy && !hasBash) return 'python';
    if (hasBash && !hasPy) return 'bash';
    if (hasPy && hasBash) {
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

  // Corrige nombres de archivo incompletos en scripts bash (ej: chmod +x script. -> chmod +x script.sh)
  const fixIncompleteFilenames = (code: string, lang?: string): string => {
    if (!lang || !['bash', 'sh', 'shell'].includes(lang.toLowerCase())) return code;
    if (!fileInfo) return code;
    const { fullFilename, basename } = fileInfo;
    const escapedBasename = basename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const chmodRegex = new RegExp(`(chmod\\s+\\+x\\s+)${escapedBasename}\\.(?=\\s|$)`, 'g');
    const execRegex = new RegExp(`(\\./)${escapedBasename}\\.(?=\\s|$)`, 'g');
    return code.replace(chmodRegex, `$1${fullFilename}`).replace(execRegex, `$1${fullFilename}`);
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
      if (/^\s*#/.test(s)) { codeish++; continue; }
    }
    return codeish >= Math.max(3, Math.floor(lines.length * 0.6));
  };

  let lastIndex = 0; let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(content)) !== null) {
    if (m.index > lastIndex) {
      const slice = content.slice(lastIndex, m.index);
      if (looksLikeCodeParagraph(slice)) {
        const cleaned = stripOuterFencesIfAny(slice);
        const precedingText = content.slice(0, lastIndex);
        const detectedLang = guessLang(cleaned);
        const fixedCode = fixIncompleteFilenames(cleaned, detectedLang);
        blocks.push({ type: 'code', lang: detectedLang, body: fixedCode, precedingText });
      } else {
        blocks.push({ type: 'para', body: slice });
      }
    }
    const precedingText = content.slice(0, m.index);
    const detectedLang = (m[1] || '').trim() || undefined;
    const rawBody = (m[2] || '').replace(/\n$/,'');
    const fixedBody = fixIncompleteFilenames(rawBody, detectedLang);
    blocks.push({ type: 'code', lang: detectedLang, body: fixedBody, precedingText });
    lastIndex = fenceRe.lastIndex;
  }
  if (lastIndex < content.length) {
    const tail = content.slice(lastIndex);
    if (looksLikeCodeParagraph(tail)) {
      const cleaned = stripOuterFencesIfAny(tail);
      const precedingText = content.slice(0, lastIndex);
      const detectedLang = guessLang(cleaned);
      const fixedCode = fixIncompleteFilenames(cleaned, detectedLang);
      blocks.push({ type: 'code', lang: detectedLang, body: fixedCode, precedingText });
    } else {
      blocks.push({ type: 'para', body: tail });
    }
  }

  const parseInlineElements = (text: string): React.ReactNode[] => {
    const regex = /(\*\*.*?\*\*|\*[^*]+\*|`[^`]+`)/g;
    const parts = text.split(regex);

    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-semibold text-[var(--text-primary)]">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return (
          <em key={i} className="italic text-[var(--text-secondary)]">
            {part.slice(1, -1)}
          </em>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={i}
            className="bg-[var(--background-tertiary)] px-1.5 py-0.5 rounded font-mono text-[12px] text-[var(--accent-primary)] break-words"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      // return normal text
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
  };

  const renderPara = (txt: string) => {
    const lines = txt.split(/\r?\n/);
    const nodes: React.ReactNode[] = [];
    let buf: string[] = [];
    let currentPaso: number | null = null;
    let subIndex = 0;
    
    const flush = () => { 
      if (buf.length) { 
        nodes.push(<p className="mb-3 leading-relaxed last:mb-0" key={`p-${nodes.length}`}>{parseInlineElements(buf.join(' '))}</p>); 
        buf = []; 
      } 
    };

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const raw = lines[lineIdx];
      const line = raw.replace(/\s+$/,'');
      if (/^\s*$/.test(line)) { flush(); continue; }
      
      // Horizontal Rules
      if (/^---$/.test(line) || /^\*\*\*$/.test(line)) {
        flush();
        nodes.push(
          <hr
            className="my-4 border-t border-[var(--border-subtle)]"
            key={`hr-${nodes.length}`}
          />,
        );
        continue;
      }

      // Markdown Tables — detect separator row like |---|---|
      if (/^\s*\|[\s:]*-{2,}[\s:]*(\|[\s:]*-{2,}[\s:]*)*\|\s*$/.test(line)) {
        // Pop the header line BEFORE flushing the rest of buf
        const headerLine = buf.length > 0 && /\|/.test(buf[buf.length - 1]) ? buf.pop()! : null;
        flush(); // flush any remaining non-header lines
        // Collect data rows
        const dataRows: string[] = [];
        while (lineIdx + 1 < lines.length && /^\s*\|.*\|\s*$/.test(lines[lineIdx + 1].trim())) {
          lineIdx++;
          dataRows.push(lines[lineIdx].trim());
        }
        // Parse cells
        const parseCells = (row: string) => row.split('|').slice(1, -1).map(c => c.trim());
        const headers = headerLine ? parseCells(headerLine) : [];
        const tableKey = `tbl-${nodes.length}`;
        nodes.push(
          <div
            key={tableKey}
            className="overflow-x-auto w-full mb-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--background-tertiary)]"
          >
            <table className="w-full text-left text-sm border-collapse m-0">
              {headers.length > 0 && (
                <thead className="bg-[var(--background-primary)] border-b border-[var(--border-subtle)]">
                  <tr>{headers.map((h, hi) => (
                    <th className="px-3 py-2 font-medium text-[var(--text-primary)]" key={hi}>
                      {parseInlineElements(h)}
                    </th>
                  ))}</tr>
                </thead>
              )}
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {dataRows.map((row, ri) => (
                  <tr key={ri} className="hover:bg-[var(--interactive-hover)] transition-colors">
                    {parseCells(row).map((cell, ci) => (
                      <td className="px-3 py-2 text-[var(--text-secondary)]" key={ci}>
                        {parseInlineElements(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }

      // Headings
      const h = line.match(/^(#{1,4})\s+(.*)$/);
      if (h) { 
        flush(); 
        const level = h[1].length; 
        const text = h[2]; 
        const Tag = (`h${Math.min(4, level)}` as any); 
        const pasoMatch = text.match(/\bPaso\s+(\d+)\b/i); 
        if (pasoMatch) { 
          currentPaso = parseInt(pasoMatch[1], 10); 
          subIndex = 0; 
        } 
        
        let headingClass = 'font-medium text-[var(--text-primary)] mt-4 mb-2 first:mt-0';
        if (level === 1) {
          headingClass = 'text-lg font-semibold text-[var(--text-primary)] mt-5 mb-3 first:mt-0 border-b border-[var(--border-subtle)] pb-1.5';
        }
        if (level === 2) {
          headingClass = 'text-[15px] font-semibold text-[var(--text-primary)] mt-4 mb-2 first:mt-0 border-b border-[var(--border-subtle)] pb-1';
        }
        if (level === 3) {
          headingClass = 'text-[14px] font-medium text-[var(--text-secondary)] mt-3 mb-1.5 first:mt-0 uppercase tracking-wide';
        }

        nodes.push(<Tag className={headingClass} key={`h-${nodes.length}`}>{parseInlineElements(text)}</Tag>); 
        continue; 
      }

      // Unordered / Ordered Lists — accumulate into mutable descriptor, flush to React element only at end
      const li = line.match(/^\s*[-*]\s+(.*)$/);
      const oli = !li ? line.match(/^\s*\d+\)\s+(.*)$|^\s*\d+\.\s+(.*)$/) : null;
      if (li || oli) {
        const rawText = li ? li[1].replace(/^\s*\d+[\.)]\s+/, '') : String((oli![1] || oli![2] || '')).replace(/^\s*\d+[\.)]\s+/, '');
        const label = (currentPaso != null) ? `${currentPaso}.${(++subIndex)}` : null;
        const liContent = label ? <><span className="font-mono text-[var(--accent-primary)] mr-1.5">{label}</span> {parseInlineElements(rawText)}</> : parseInlineElements(rawText);
        const isList = (n: any) => n && n.__listItems;
        const last = nodes[nodes.length - 1] as any;
        const useNumbered = !li && currentPaso == null;
        if (!isList(last)) {
          // Push a mutable accumulator object (not a React element)
          nodes.push({
            __listItems: [liContent],
            __ordered: useNumbered,
            __numbered: currentPaso != null,
          } as any);
        } else {
          last.__listItems.push(liContent);
          // If we entered a paso context after the list started as ol, upgrade to bullet
          if (currentPaso != null) last.__numbered = true;
          if (!li) last.__ordered = last.__ordered && currentPaso == null;
        }
        continue;
      }

      // Paragraph continuation
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
    // Convert any remaining list accumulator objects to proper React elements
    const materialize = (n: any, idx: number): React.ReactNode => {
      if (!n || !n.__listItems) return n;
      const items = (n.__listItems as React.ReactNode[]).map((child, ci) =>
        React.createElement('li', { className: 'mb-1 last:mb-0 relative pl-1', key: `li-${idx}-${ci}` }, child)
      );
      if (n.__numbered) {
        return React.createElement('ul', { className: 'mb-3 list-none p-0', key: `ul-${idx}` }, items);
      }
      if (n.__ordered) {
        return React.createElement('ol', { className: 'mb-3 pl-6 list-decimal marker:text-[var(--text-muted)]', key: `ol-${idx}` }, items);
      }
      return React.createElement('ul', { className: 'mb-3 pl-6 list-disc marker:text-[var(--text-muted)]', key: `ul-${idx}` }, items);
    };
    return nodes.map(materialize);
  };

  return (
    <div className="flex flex-col gap-1 w-full max-w-full overflow-hidden">
      {blocks.map((b, i) => b.type === 'code' ? (
        <CodeBlock
          key={`c-${i}`}
          code={b.body}
          language={b.lang}
          sessionId={sessionId}
          setLastCommand={setLastCommand}
          hideActions={!isExecutableCode(b.body, b.precedingText || '')}
        />
      ) : (
        <div
          className="w-full overflow-hidden text-[var(--text-secondary)]"
          key={`p-${i}`}
        >
          {renderPara(b.body)}
        </div>
      ))}
    </div>
  );
};

export default AskRenderer;
