import React, { useRef } from 'react';
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
  attachedImage: { base64: string; mediaType: string; preview: string } | null;
  setAttachedImage: (v: { base64: string; mediaType: string; preview: string } | null) => void;
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

  return (
    <div className="chat-input">
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const mediaType = file.type || 'image/jpeg';
          const reader = new FileReader();
          reader.onload = (ev) => {
            const dataUrl = ev.target?.result as string;
            const base64 = dataUrl.split(',')[1];
            setAttachedImage({ base64, mediaType, preview: dataUrl });
          };
          reader.readAsDataURL(file);
          e.target.value = '';
        }}
      />
      <input
        ref={textFileInputRef}
        type="file"
        accept=".txt,.conf,.config,.log,.sh,.bash,.py,.js,.ts,.json,.yaml,.yml,.toml,.env,.ini,.cfg,.nginx,.service,.xml,.html,.md,.rs,.go,.java,.c,.cpp,.h,.docx,.doc,.pdf"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          e.target.value = '';
          const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
          const MAX_TEXT_SIZE = 200_000;

          // ── Word (.docx / .doc) ──
          if (ext === 'docx' || ext === 'doc') {
            if (file.size > 10_000_000) {
              setToast('Archivo Word demasiado grande (máx. 10 MB)');
              setTimeout(() => setToast(null), 2500);
              return;
            }
            try {
              setToast(`Procesando "${file.name}"…`);
              const arrayBuffer = await file.arrayBuffer();
              const result = await mammoth.extractRawText({ arrayBuffer });
              const text = result.value.trim();
              if (!text) { setToast('El documento Word está vacío'); setTimeout(() => setToast(null), 2500); return; }
              setAttachedFile({ name: file.name, content: text.slice(0, 30_000) });
              setToast(`Word "${file.name}" adjuntado`);
              setTimeout(() => setToast(null), 2000);
            } catch {
              setToast('Error al leer el archivo Word');
              setTimeout(() => setToast(null), 2500);
            }
            return;
          }

          // ── PDF ──
          if (ext === 'pdf') {
            if (file.size > 20_000_000) {
              setToast('PDF demasiado grande (máx. 20 MB)');
              setTimeout(() => setToast(null), 2500);
              return;
            }
            try {
              setToast(`Procesando "${file.name}"…`);
              const arrayBuffer = await file.arrayBuffer();
              const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
              const pageTexts: string[] = [];
              for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                const pageText = content.items.map((item: any) => item.str).join(' ');
                pageTexts.push(pageText);
              }
              const text = pageTexts.join('\n\n').trim();
              if (!text) { setToast('El PDF no contiene texto extraíble'); setTimeout(() => setToast(null), 2500); return; }
              setAttachedFile({ name: `${file.name} (${pdf.numPages} págs.)`, content: text.slice(0, 30_000) });
              setToast(`PDF "${file.name}" adjuntado (${pdf.numPages} págs.)`);
              setTimeout(() => setToast(null), 2000);
            } catch {
              setToast('Error al leer el PDF');
              setTimeout(() => setToast(null), 2500);
            }
            return;
          }

          // ── Texto plano (comportamiento original) ──
          if (file.size > MAX_TEXT_SIZE) {
            setToast('Archivo demasiado grande (máx. 200 KB)');
            setTimeout(() => setToast(null), 2500);
            return;
          }
          const reader = new FileReader();
          reader.onload = (ev) => {
            const text = ev.target?.result as string;
            setAttachedFile({ name: file.name, content: text });
            setToast(`Archivo "${file.name}" adjuntado`);
            setTimeout(() => setToast(null), 2000);
          };
          reader.readAsText(file);
        }}
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
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>imagen lista para enviar</span>
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
            style={{ opacity: 0.5 }}
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
