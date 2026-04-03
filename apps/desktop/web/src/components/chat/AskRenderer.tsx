import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { cleanText } from './chatUtils';
import { Message } from '../chatModes/types';
import CodeBlock from './CodeBlock';

interface AskRendererProps {
  content: string;
  sessionId?: string | null;
  setLastCommand?: (cmd: string) => Promise<void> | void;
  mode?: string;
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
export const AskRenderer: React.FC<AskRendererProps> = ({ content, sessionId, setLastCommand, mode }) => {
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
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={i}>{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={i}>{part.slice(1, -1)}</code>;
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
        nodes.push(<p key={`p-${nodes.length}`}>{parseInlineElements(buf.join(' '))}</p>); 
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
        nodes.push(<hr key={`hr-${nodes.length}`} />);
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
          <div key={tableKey} className="md-table-wrap">
            <table className="md-table">
              {headers.length > 0 && (
                <thead><tr>{headers.map((h, hi) => <th key={hi}>{parseInlineElements(h)}</th>)}</tr></thead>
              )}
              <tbody>
                {dataRows.map((row, ri) => (
                  <tr key={ri}>{parseCells(row).map((cell, ci) => <td key={ci}>{parseInlineElements(cell)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }

      // Table data rows (part of a table that starts with |) — buffer if we haven't seen separator yet
      // This handles cases where a | line appears outside a table context
      // Just treat as regular text (falls through to buf.push)

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
        nodes.push(<Tag key={`h-${nodes.length}`}>{parseInlineElements(text)}</Tag>); 
        continue; 
      }

      // Unordered Lists
      const li = line.match(/^\s*[-*]\s+(.*)$/);
      if (li) { 
        const last = nodes[nodes.length - 1] as any; 
        const text = li[1].replace(/^\s*\d+[\.)]\s+/, ''); 
        const label = (currentPaso != null) ? `${currentPaso}.${(++subIndex)}` : null; 
        const liContent = label ? <>{label} {parseInlineElements(text)}</> : parseInlineElements(text); 
        
        const makeUl = () => React.createElement('ul', { 
          key: `ul-${nodes.length}`, 
          style: { listStyleType: (currentPaso != null ? 'none' : 'disc'), paddingLeft: (currentPaso != null ? 0 : undefined) } 
        }, [React.createElement('li', { key: `li-${nodes.length}-0` }, liContent)]); 
        
        if (!last || (last.type !== 'ul')) { 
          nodes.push(makeUl()); 
        } else { 
          (last.props.children as any[]).push(React.createElement('li', { key: `li-${nodes.length}-${(last.props.children as any[]).length}` }, liContent)); 
          if (currentPaso != null && last.props && last.props.style && last.props.style.listStyleType !== 'none') { 
            last.props.style = { ...(last.props.style||{}), listStyleType: 'none', paddingLeft: 0 }; 
          } 
        } 
        continue; 
      }

      // Ordered Lists
      const oli = line.match(/^\s*\d+\)\s+(.*)$|^\s*\d+\.\s+(.*)$/);
      if (oli) { 
        const textRaw = oli[1] || oli[2] || ''; 
        const text = String(textRaw).replace(/^\s*\d+[\.)]\s+/, ''); 
        const last = nodes[nodes.length - 1] as any; 
        const label = (currentPaso != null) ? `${currentPaso}.${(++subIndex)}` : null; 
        const liContent = label ? <>{label} {parseInlineElements(text)}</> : parseInlineElements(text); 
        
        if (!last || (last.type !== 'ol' && last.type !== 'ul')) { 
          if (currentPaso != null) { 
            nodes.push(React.createElement('ul', { key: `ul-${nodes.length}`, style: { listStyleType: 'none', paddingLeft: 0 } }, [React.createElement('li', { key: `li-${nodes.length}-0` }, liContent)])); 
          } else { 
            nodes.push(React.createElement('ol', { key: `ol-${nodes.length}` }, [React.createElement('li', { key: `oli-${nodes.length}-0` }, liContent)])); 
          } 
        } else { 
          (last.props.children as any[]).push(React.createElement('li', { key: `oli-${nodes.length}-${(last.props.children as any[]).length}` }, liContent)); 
          if (currentPaso != null && last.type === 'ol') { 
            last.type = 'ul'; 
            last.props = { ...(last.props||{}), style: { ...(last.props?.style||{}), listStyleType: 'none', paddingLeft: 0 } }; 
          } 
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
    return nodes;
  };

  return (
    <div>
      {blocks.map((b, i) => b.type === 'code' ? (
        <CodeBlock
          key={`c-${i}`}
          code={b.body}
          language={b.lang}
          sessionId={sessionId}
          setLastCommand={setLastCommand}
          hideActions={mode === 'analisis' || !isExecutableCode(b.body, b.precedingText || '')}
        />
      ) : (
        <div key={`p-${i}`}>{renderPara(b.body)}</div>
      ))}
    </div>
  );
};

export default AskRenderer;
