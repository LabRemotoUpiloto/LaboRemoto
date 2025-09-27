import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { cleanText } from './chatUtils';
import { Message } from '../chatModes/types';

interface AskRendererProps {
  content: string;
  sessionId?: string | null;
  setLastCommand?: (cmd: string) => Promise<void> | void;
}

// Renderizador del modo ASK (reutilizable para respuestas AI)
export const AskRenderer: React.FC<AskRendererProps> = ({ content, sessionId, setLastCommand }) => {
  const blocks: Array<{ type: 'code' | 'para'; lang?: string; body: string }> = [];
  const fenceRe = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;

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
        blocks.push({ type: 'code', lang: guessLang(cleaned), body: cleaned });
      } else {
        blocks.push({ type: 'para', body: slice });
      }
    }
    blocks.push({ type: 'code', lang: (m[1] || '').trim() || undefined, body: (m[2] || '').replace(/\n$/,'') });
    lastIndex = fenceRe.lastIndex;
  }
  if (lastIndex < content.length) {
    const tail = content.slice(lastIndex);
    if (looksLikeCodeParagraph(tail)) {
      const cleaned = stripOuterFencesIfAny(tail);
      blocks.push({ type: 'code', lang: guessLang(cleaned), body: cleaned });
    } else {
      blocks.push({ type: 'para', body: tail });
    }
  }

  const renderPara = (txt: string) => {
    const lines = txt.split(/\r?\n/);
    const nodes: React.ReactNode[] = [];
    let buf: string[] = [];
    let currentPaso: number | null = null;
    let subIndex = 0;
    const flush = () => { if (buf.length) { nodes.push(<p key={`p-${nodes.length}`}>{buf.join('\n')}</p>); buf = []; } };
    for (const raw of lines) {
      const line = raw.replace(/\s+$/,'');
      if (/^\s*$/.test(line)) { flush(); continue; }
      const h = line.match(/^(#{1,4})\s+(.*)$/);
      if (h) { flush(); const level = h[1].length; const text = h[2]; const Tag = (`h${Math.min(4, level)}` as any); const pasoMatch = text.match(/\bPaso\s+(\d+)\b/i); if (pasoMatch) { currentPaso = parseInt(pasoMatch[1], 10); subIndex = 0; } nodes.push(<Tag key={`h-${nodes.length}`}>{text}</Tag>); continue; }
      const li = line.match(/^\s*[-*]\s+(.*)$/);
      if (li) { const last = nodes[nodes.length - 1] as any; const text = li[1].replace(/^\s*\d+[\.)]\s+/, ''); const label = (currentPaso != null) ? `${currentPaso}.${(++subIndex)}` : null; const liContent = label ? `${label} ${text}` : text; const makeUl = () => React.createElement('ul', { key: `ul-${nodes.length}`, style: { listStyleType: (currentPaso!=null?'none':'disc'), paddingLeft: (currentPaso!=null?0:undefined) } }, [React.createElement('li', { key: `li-${nodes.length}-0` }, liContent)]); if (!last || (last.type !== 'ul')) { nodes.push(makeUl()); } else { (last.props.children as any[]).push(React.createElement('li', { key: `li-${nodes.length}-${(last.props.children as any[]).length}` }, liContent)); if (currentPaso != null && last.props && last.props.style && last.props.style.listStyleType !== 'none') { last.props.style = { ...(last.props.style||{}), listStyleType: 'none', paddingLeft: 0 }; } } continue; }
      const oli = line.match(/^\s*\d+\)\s+(.*)$|^\s*\d+\.\s+(.*)$/);
      if (oli) { const textRaw = oli[1] || oli[2] || ''; const text = String(textRaw).replace(/^\s*\d+[\.)]\s+/, ''); const last = nodes[nodes.length - 1] as any; const label = (currentPaso != null) ? `${currentPaso}.${(++subIndex)}` : null; const liContent = label ? `${label} ${text}` : text; if (!last || (last.type !== 'ol' && last.type !== 'ul')) { if (currentPaso != null) { nodes.push(React.createElement('ul', { key: `ul-${nodes.length}`, style: { listStyleType: 'none', paddingLeft: 0 } }, [React.createElement('li', { key: `li-${nodes.length}-0` }, liContent)])); } else { nodes.push(React.createElement('ol', { key: `ol-${nodes.length}` }, [React.createElement('li', { key: `oli-${nodes.length}-0` }, liContent)])); } } else { (last.props.children as any[]).push(React.createElement('li', { key: `oli-${nodes.length}-${(last.props.children as any[]).length}` }, liContent)); if (currentPaso != null && last.type === 'ol') { last.type = 'ul'; last.props = { ...(last.props||{}), style: { ...(last.props?.style||{}), listStyleType: 'none', paddingLeft: 0 } }; } } continue; }
      const numPara = line.match(/^\s*(\d+(?:\.\d+)*[\.)]?)\s+(.*)$/);
      if (numPara && currentPaso != null) { const text = numPara[2]; const label = `${currentPaso}.${(++subIndex)}`; buf.push(`${label} ${text}`); continue; }
      buf.push(line);
    }
    flush();
    return nodes;
  };

  const sanitizeForTerminal = (txt: string) => (txt || '')
    .split(/\r?\n/)
    .filter(l => !/^```/.test(l.trim()))
    .join('\n')
    .trimEnd();

  const onRun = async (text: string, btn: HTMLButtonElement | null) => {
    const toSendRaw = sanitizeForTerminal(text || '');
    if (!toSendRaw) return;
    if (!sessionId) { try { alert('No hay sesión SSH activa'); } catch {} return; }
    const danger = /\brm\s+-rf\b/i.test(toSendRaw);
    if (danger) {
      const proceed = confirm('Este comando incluye "rm -rf". ¿Seguro que deseas ejecutarlo?');
      if (!proceed) return;
    }
    const editorCmdRe = /\b(nano|vim|vi|nvim|emacs)\b/;
    if (editorCmdRe.test(toSendRaw)) {
      alert('Este bloque contiene un editor interactivo (nano/vim). Usa here-doc con cat/tee para crear archivos sin interacción.');
      return;
    }
    if (btn) {
      btn.disabled = true; const prev = btn.textContent; btn.textContent = 'Ejecutando…';
      try {
        await invoke('ssh_stdin', { id: sessionId, data: toSendRaw + '\n' });
        try { await setLastCommand?.(toSendRaw); } catch {}
        btn.textContent = 'Ejecutado';
      } catch { btn.textContent = 'Error'; }
      finally { setTimeout(() => { if (btn) { btn.textContent = prev || 'Ejecutar'; btn.disabled = false; } }, 300); }
      return;
    }
    try {
      await invoke('ssh_stdin', { id: sessionId, data: toSendRaw + '\n' });
      try { await setLastCommand?.(toSendRaw); } catch {}
    } catch {}
  };

  return (
    <div>
      {blocks.map((b, i) => b.type === 'code' ? (
        <div className="copyable-block" key={`c-${i}`}>
          <button
            className="copy-btn"
            onClick={(e) => onRun(b.body, e.currentTarget)}
            aria-label="Ejecutar código"
            type="button"
          >Ejecutar</button>
          <pre><code>{b.body}</code></pre>
        </div>
      ) : (
        <div key={`p-${i}`}>{renderPara(b.body)}</div>
      ))}
    </div>
  );
};

export default AskRenderer;
