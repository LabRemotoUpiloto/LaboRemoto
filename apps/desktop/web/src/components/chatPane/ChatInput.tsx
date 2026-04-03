import React, { useRef, useState } from 'react';
import { ChatMode, Message } from '../chatModes/types';
import { MAX_CHAR_WARN, MODE_PLACEHOLDERS, TOKEN_STORAGE_KEY } from './chatPane.constants';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface Props {
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  mode: ChatMode;
  isSending: boolean;
  onSend: () => void;
  onCancel: () => void;
  canSend: boolean;
  attachedImage: { base64: string; mediaType: string; preview: string; label?: string } | null;
  setAttachedImage: (v: { base64: string; mediaType: string; preview: string; label?: string } | null) => void;
  attachedFile: { name: string; content: string } | null;
  setAttachedFile: (v: { name: string; content: string } | null) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  isComposingRef: React.MutableRefObject<boolean>;
  messages: Message[];
  sessionTokens: { input: number; output: number };
  setSessionTokens: React.Dispatch<React.SetStateAction<{ input: number; output: number }>>;
  sessionId: string | null;
  ctxUsagePct: number;
  setToast: (v: string | null) => void;
  showTokenPopover: boolean;
  setShowTokenPopover: React.Dispatch<React.SetStateAction<boolean>>;
}

const ChatInput: React.FC<Props> = ({
  input, setInput, mode, isSending, onSend, onCancel, canSend,
  attachedImage, setAttachedImage,
  attachedFile, setAttachedFile,
  inputRef, isComposingRef,
  messages, sessionTokens, setSessionTokens, sessionId,
  ctxUsagePct, setToast,
  showTokenPopover, setShowTokenPopover,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // ── Handlers ──
  const handleImageFile = (file: File) => {
    const mediaType = file.type || 'image/jpeg';
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setAttachedImage({ base64: dataUrl.split(',')[1], mediaType, preview: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const handleTextFile = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const MAX_TEXT_SIZE = 200_000;
    if (ext === 'docx' || ext === 'doc') {
      if (file.size > 10_000_000) { setToast('Archivo Word demasiado grande (máx. 10 MB)'); setTimeout(() => setToast(null), 2500); return; }
      try {
        setToast(`Procesando "${file.name}"…`);
        const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        const text = result.value.trim();
        if (!text) { setToast('El documento Word está vacío'); setTimeout(() => setToast(null), 2500); return; }
        setAttachedFile({ name: file.name, content: text.slice(0, 30_000) });
        setToast(`Word "${file.name}" adjuntado`); setTimeout(() => setToast(null), 2000);
      } catch { setToast('Error al leer el archivo Word'); setTimeout(() => setToast(null), 2500); }
      return;
    }
    if (ext === 'pdf') {
      if (file.size > 20_000_000) { setToast('PDF demasiado grande (máx. 20 MB)'); setTimeout(() => setToast(null), 2500); return; }
      try {
        setToast(`Procesando "${file.name}"…`);
        const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        const pageTexts: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          pageTexts.push(content.items.map((item: any) => item.str).join(' '));
        }
        const text = pageTexts.join('\n\n').trim();
        if (text) {
          setAttachedFile({ name: `${file.name} (${pdf.numPages} págs.)`, content: text.slice(0, 30_000) });
          setToast(`PDF "${file.name}" adjuntado (${pdf.numPages} págs.)`); setTimeout(() => setToast(null), 2000);
        } else {
          const MAX_PAGES = 5;
          const pagesToRender = Math.min(pdf.numPages, MAX_PAGES);
          setToast(`PDF escaneado — renderizando ${pagesToRender} pág(s.)…`);
          const canvases: HTMLCanvasElement[] = [];
          for (let i = 1; i <= pagesToRender; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.8 });
            const c = document.createElement('canvas');
            c.width = viewport.width; c.height = viewport.height;
            await page.render({ canvasContext: c.getContext('2d')!, canvas: c, viewport }).promise;
            canvases.push(c);
          }
          const merged = document.createElement('canvas');
          merged.width = canvases[0].width;
          merged.height = canvases.reduce((s, c) => s + c.height, 0);
          const mctx = merged.getContext('2d')!;
          let offsetY = 0;
          for (const c of canvases) { mctx.drawImage(c, 0, offsetY); offsetY += c.height; }
          // Anthropic image limit ~5 MB base64 — recompress if too large
          let dataUrl = merged.toDataURL('image/jpeg', 0.82);
          if (dataUrl.length > 3_800_000) dataUrl = merged.toDataURL('image/jpeg', 0.55);
          if (dataUrl.length > 3_800_000) {
            const scale = Math.sqrt(3_800_000 / dataUrl.length);
            const small = document.createElement('canvas');
            small.width = Math.round(merged.width * scale); small.height = Math.round(merged.height * scale);
            small.getContext('2d')!.drawImage(merged, 0, 0, small.width, small.height);
            dataUrl = small.toDataURL('image/jpeg', 0.65);
          }
          const label = `PDF escaneado · ${pagesToRender}${pdf.numPages > MAX_PAGES ? '/' + pdf.numPages : ''} pág(s.)`;
          setAttachedImage({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg', preview: dataUrl, label });
          const extra = pdf.numPages > MAX_PAGES ? ` (de ${pdf.numPages} totales)` : '';
          setToast(`PDF escaneado: ${pagesToRender} pág(s.)${extra} → Claude Vision`); setTimeout(() => setToast(null), 3000);
        }
      } catch { setToast('Error al leer el PDF'); setTimeout(() => setToast(null), 2500); }
      return;
    }
    if (file.size > MAX_TEXT_SIZE) { setToast('Archivo demasiado grande (máx. 200 KB)'); setTimeout(() => setToast(null), 2500); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAttachedFile({ name: file.name, content: ev.target?.result as string });
      setToast(`Archivo "${file.name}" adjuntado`); setTimeout(() => setToast(null), 2000);
    };
    reader.readAsText(file);
  };

  // ── Drag & drop ──
  const handleDragOver = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.items).some((i: any) => i.kind === 'file')) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (file.type.startsWith('image/')) handleImageFile(file); else await handleTextFile(file);
  };

  return (
    <div
      className="chat-input"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={isDragging ? { outline: '1.5px dashed rgba(96,165,250,0.45)', borderRadius: 8 } : undefined}
    >
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleImageFile(f); }}
      />
      <input
        ref={textFileInputRef}
        type="file"
        accept=".txt,.conf,.config,.log,.sh,.bash,.py,.js,.ts,.json,.yaml,.yml,.toml,.env,.ini,.cfg,.nginx,.service,.xml,.html,.md,.rs,.go,.java,.c,.cpp,.h,.docx,.doc,.pdf"
        style={{ display: 'none' }}
        onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) await handleTextFile(f); }}
      />

      <div className="chat-input-wrap" style={(attachedImage || attachedFile) ? { flexDirection: 'column', alignItems: 'stretch', gap: 0 } : undefined}>
        {/* Image chip */}
        {attachedImage && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px 4px' }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <img
                src={attachedImage.preview}
                alt="adjunto"
                style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.10)', display: 'block' }}
              />
              <button
                onClick={() => setAttachedImage(null)}
                style={{
                  position: 'absolute', top: -5, right: -5,
                  width: 16, height: 16, borderRadius: '50%',
                  background: 'rgba(30,33,48,0.95)', border: '1px solid rgba(255,255,255,0.15)',
                  color: 'rgba(255,255,255,0.7)', fontSize: 9, lineHeight: 1, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                }}
              >✕</button>
            </div>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>{attachedImage.label ?? 'imagen lista para enviar'}</span>
          </div>
        )}
        {/* File chip */}
        {attachedFile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px 4px' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 6,
              background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.20)',
              fontSize: 11.5, flex: 1, minWidth: 0,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <span style={{ color: 'rgba(255,255,255,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachedFile.name}</span>
            </div>
            <button
              onClick={() => setAttachedFile(null)}
              style={{
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)',
                cursor: 'pointer', fontSize: 15, padding: '0 2px', flexShrink: 0, lineHeight: 1,
              }}
              title="Quitar archivo"
            >×</button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={MODE_PLACEHOLDERS[mode]}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && isSending) { e.preventDefault(); onCancel(); return; }
              if (e.key === 'ArrowUp' && input === '') {
                e.preventDefault();
                const lastUser = [...messages].reverse().find(m => m.sender === 'user');
                if (lastUser) { setInput(lastUser.text); return; }
              }
              if (e.key === 'Enter' && !e.shiftKey && !isComposingRef.current) {
                e.preventDefault();
                if (!isSending && canSend) onSend();
              }
            }}
            onCompositionStart={() => { isComposingRef.current = true; }}
            onCompositionEnd={() => { isComposingRef.current = false; }}
            onPaste={(e) => {
              const items = Array.from(e.clipboardData?.items ?? [] as any) as DataTransferItem[];
              const imgItem = items.find(it => it.type.startsWith('image/'));
              if (!imgItem) return;
              e.preventDefault();
              const file = imgItem.getAsFile();
              if (!file) return;
              const mediaType = file.type || 'image/png';
              const reader = new FileReader();
              reader.onload = (ev) => {
                const dataUrl = ev.target?.result as string;
                const base64 = dataUrl.split(',')[1];
                setAttachedImage({ base64, mediaType, preview: dataUrl });
              };
              reader.readAsDataURL(file);
            }}
          />
          <button
            className="chat-input-attach-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Adjuntar imagen"
            style={{ opacity: attachedImage ? 1 : 0.5, color: attachedImage ? 'var(--accent-primary)' : undefined }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </button>
          <button
            className="chat-input-attach-btn"
            onClick={() => textFileInputRef.current?.click()}
            title="Adjuntar archivo de texto (.sh, .conf, .log, .py…)"
            style={{ opacity: attachedFile ? 1 : 0.5, color: attachedFile ? 'var(--accent-primary)' : undefined }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </button>
          <button
            className={`send-btn send-icon ${isSending ? 'is-cancel' : ''}`}
            onClick={isSending ? onCancel : onSend}
            disabled={!isSending && !canSend}
            aria-label={isSending ? 'Cancelar' : 'Enviar'}
          >
            {isSending ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5"/>
                <polyline points="5 12 12 5 19 12"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Char counter footer */}
      <div className="chat-input-footer">
        {input.length === 0
          ? <span className="chat-input-hint">Shift+↵ nueva línea · Shift+? atajos</span>
          : <span className="chat-char-counter" data-warn={input.length > MAX_CHAR_WARN ? true : undefined}>
              {input.length > MAX_CHAR_WARN
                ? `⚠ ${input.length.toLocaleString()} car. — mensaje muy largo`
                : `${input.length} car.`}
            </span>
        }
      </div>

      {/* Token badge */}
      <div className="session-token-wrap">
        <button
          className={`session-token-badge${sessionTokens.input === 0 ? ' is-empty' : ''}`}
          onClick={() => setShowTokenPopover(v => !v)}
          title="Ver desglose de tokens de la sesión"
        >
          <span className="token-badge-icon">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </span>
          <span className="token-badge-in">{sessionTokens.input.toLocaleString()}</span>
          <span className="token-badge-sep">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
            </svg>
          </span>
          <span className="token-badge-out">{sessionTokens.output.toLocaleString()}</span>
          <span className="token-badge-sep">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
            </svg>
          </span>
        </button>
        {showTokenPopover && (
          <div className="token-popover">
            <div className="token-popover-row">
              <span className="token-pop-label">Entrada</span>
              <span className="token-pop-val token-badge-in">{sessionTokens.input.toLocaleString()}</span>
              <span className="token-pop-unit">tok</span>
            </div>
            <div className="token-popover-row">
              <span className="token-pop-label">Salida</span>
              <span className="token-pop-val token-badge-out">{sessionTokens.output.toLocaleString()}</span>
              <span className="token-pop-unit">tok</span>
            </div>
            <div className="token-popover-divider"/>
            <div className="token-popover-row">
              <span className="token-pop-label">Total</span>
              <span className="token-pop-val" style={{ color: '#e2e8f0' }}>{(sessionTokens.input + sessionTokens.output).toLocaleString()}</span>
              <span className="token-pop-unit">tok</span>
            </div>
            <div className="token-popover-divider"/>
            <div className="token-ctx-wrap">
              <div className="token-popover-row">
                <span className="token-pop-label">Contexto ~</span>
                <span className="token-pop-val" style={{
                  fontSize: 10.5,
                  color: ctxUsagePct > 90 ? '#f87171' : ctxUsagePct > 70 ? '#f59e0b' : 'rgba(167,139,250,0.6)',
                }}>{ctxUsagePct.toFixed(0)}%</span>
              </div>
              <div className="token-context-bar">
                <div className="token-context-bar__fill" style={{ width: `${ctxUsagePct}%` }}
                  data-warn={ctxUsagePct > 90 ? 'critical' : ctxUsagePct > 70 ? 'high' : undefined}/>
              </div>
            </div>
            <button className="token-pop-reset" onClick={() => {
              const zeroed = { input: 0, output: 0 };
              setSessionTokens(zeroed);
              try { localStorage.setItem(TOKEN_STORAGE_KEY(sessionId ?? null), JSON.stringify(zeroed)); } catch {}
              setShowTokenPopover(false);
            }}>
              Reiniciar contador
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatInput;
