import React, { useRef, useState } from 'react';
import { ChatMode, Message } from '../chatModes/types';
import { MAX_CHAR_WARN, MODE_PLACEHOLDERS, TOKEN_STORAGE_KEY } from './chatPane.constants';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ActionIcon, Popover, Progress, Textarea } from '@mantine/core';
import { Image, FileText, Send, Square, Activity, ChevronUp, ChevronDown } from 'lucide-react';

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
      className={`relative mt-2 mx-auto max-w-[850px] w-full px-2 sm:px-4 shrink-0 transition-all duration-200 ${isDragging ? 'ring-2 ring-blue-400/45 rounded-lg' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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

      <div className={`flex bg-tertiary border border-subtle rounded-xl overflow-hidden shadow-sm transition-colors duration-200 focus-within:border-accent/40 focus-within:bg-[#1a1c29] ${(attachedImage || attachedFile) ? 'flex-col items-stretch gap-0' : 'items-center'}`}>
        {/* Image chip */}
        {attachedImage && (
          <div className="flex items-center gap-2 pt-2 px-2.5 pb-1">
            <div className="relative shrink-0">
              <img
                src={attachedImage.preview}
                alt="adjunto"
                className="w-12 h-12 rounded-md object-cover border border-white/10 block"
              />
              <button
                onClick={() => setAttachedImage(null)}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#1e2130] border border-white/15 text-white/70 text-[9px] flex items-center justify-center cursor-pointer hover:bg-white/10 hover:text-white"
              >✕</button>
            </div>
            <span className="text-[11px] text-white/35 italic">{attachedImage.label ?? 'imagen lista para enviar'}</span>
          </div>
        )}
        {/* File chip */}
        {attachedFile && (
          <div className="flex items-center gap-1.5 pt-2 px-2.5 pb-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-400/10 border border-blue-400/20 text-[11.5px] flex-1 min-w-0">
              <FileText size={12} className="text-blue-400 shrink-0" />
              <span className="text-white/75 overflow-hidden text-ellipsis whitespace-nowrap">{attachedFile.name}</span>
            </div>
            <button
              onClick={() => setAttachedFile(null)}
              className="bg-transparent border-none text-white/35 cursor-pointer text-[15px] px-0.5 shrink-0 leading-none hover:text-white"
              title="Quitar archivo"
            >×</button>
          </div>
        )}

        <div className="flex items-end gap-1 flex-1 py-1 pr-1.5 min-h-[44px]">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={MODE_PLACEHOLDERS[mode]}
            autosize
            minRows={1}
            maxRows={8}
            className="flex-1"
            classNames={{
              input: "bg-transparent border-none text-primary text-[13px] leading-relaxed placeholder-white/30 focus:ring-0 px-3 py-2 scrollbar-thin"
            }}
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
          
          <div className="flex items-center pb-1 gap-1 shrink-0">
            <ActionIcon
              variant="subtle"
              onClick={() => fileInputRef.current?.click()}
              title="Adjuntar imagen"
              className={`hover:bg-white/5 ${attachedImage ? 'text-accent' : 'text-secondary/50 hover:text-primary'}`}
              size="md"
            >
              <Image size={15} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              onClick={() => textFileInputRef.current?.click()}
              title="Adjuntar archivo de texto (.sh, .conf, .log, .py…)"
              className={`hover:bg-white/5 ${attachedFile ? 'text-accent' : 'text-secondary/50 hover:text-primary'}`}
              size="md"
            >
              <FileText size={14} />
            </ActionIcon>
            <ActionIcon
              variant={isSending ? "light" : "filled"}
              color={isSending ? "red" : "blue"}
              onClick={isSending ? onCancel : onSend}
              disabled={!isSending && !canSend}
              aria-label={isSending ? 'Cancelar' : 'Enviar'}
              className="ml-1"
              size="md"
            >
              {isSending ? <Square size={14} fill="currentColor" /> : <Send size={15} className="mr-[2px]" />}
            </ActionIcon>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 px-1">
        <div className="text-[10.5px]">
          {input.length === 0
            ? <span className="text-secondary/40 font-medium">Shift+↵ nueva línea · Shift+? atajos</span>
            : <span className={`${input.length > MAX_CHAR_WARN ? 'text-red-400 font-semibold' : 'text-secondary/50 font-medium'}`}>
                {input.length > MAX_CHAR_WARN
                  ? `⚠ ${input.length.toLocaleString()} car. — mensaje muy largo`
                  : `${input.length} car.`}
              </span>
          }
        </div>

        {/* Token badge */}
        <div className="relative">
          <Popover opened={showTokenPopover} onChange={setShowTokenPopover} position="top-end" withArrow shadow="md">
            <Popover.Target>
              <button
                className={`flex items-center h-5 px-1.5 rounded bg-black/20 border border-white/5 text-[9px] font-mono tracking-wider cursor-pointer transition-colors duration-200 hover:bg-black/40 hover:border-white/10 text-white/50
                  ${sessionTokens.input === 0 ? 'opacity-40 grayscale pointer-events-none' : ''}`}
                onClick={() => setShowTokenPopover(v => !v)}
                title="Ver desglose de tokens de la sesión"
              >
                <Activity size={10} className="mr-1 opacity-70 text-blue-400" />
                <span className="text-blue-400/80">{sessionTokens.input.toLocaleString()}</span>
                <span className="mx-1 opacity-30"><ChevronUp size={9} /></span>
                <span className="text-emerald-400/80">{sessionTokens.output.toLocaleString()}</span>
                <span className="mx-1 opacity-30"><ChevronDown size={9} /></span>
              </button>
            </Popover.Target>
            <Popover.Dropdown className="bg-[#1a1c29] border border-white/10 p-3 min-w-[220px]">
              <div className="flex justify-between items-center text-xs mb-2">
                <span className="text-secondary font-medium">Entrada</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-blue-400 font-mono tracking-wider">{sessionTokens.input.toLocaleString()}</span>
                  <span className="text-[9px] text-secondary/40 uppercase tracking-widest font-semibold">tok</span>
                </div>
              </div>
              <div className="flex justify-between items-center text-xs mb-2">
                <span className="text-secondary font-medium">Salida</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-emerald-400 font-mono tracking-wider">{sessionTokens.output.toLocaleString()}</span>
                  <span className="text-[9px] text-secondary/40 uppercase tracking-widest font-semibold">tok</span>
                </div>
              </div>
              <div className="h-[1px] bg-white/10 my-2" />
              <div className="flex justify-between items-center text-xs mb-2">
                <span className="text-secondary font-medium">Total</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-gray-200 font-mono tracking-wider">{(sessionTokens.input + sessionTokens.output).toLocaleString()}</span>
                  <span className="text-[9px] text-secondary/40 uppercase tracking-widest font-semibold">tok</span>
                </div>
              </div>
              <div className="h-[1px] bg-white/10 my-2" />
              <div className="bg-black/30 rounded-lg p-2.5 mt-2 border border-white/5">
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="text-secondary/70 font-medium">Contexto ~</span>
                  <span className={`text-[10.5px] font-mono ${ctxUsagePct > 90 ? 'text-red-400' : ctxUsagePct > 70 ? 'text-amber-500' : 'text-purple-400/60'}`}>
                    {sessionTokens.input.toLocaleString()} tok ({ctxUsagePct.toFixed(1)}%)
                  </span>
                </div>
                <Progress 
                  value={ctxUsagePct} 
                  color={ctxUsagePct > 90 ? 'red' : ctxUsagePct > 70 ? 'yellow' : 'violet'} 
                  size="sm" 
                  radius="xl" 
                />
              </div>
              <button 
                className="w-full mt-3 h-7 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/40 rounded-md text-[11px] font-medium transition-all duration-200 cursor-pointer"
                onClick={() => {
                  const zeroed = { input: 0, output: 0 };
                  setSessionTokens(zeroed);
                  try { localStorage.setItem(TOKEN_STORAGE_KEY(sessionId ?? null), JSON.stringify(zeroed)); } catch {}
                  setShowTokenPopover(false);
                }}
              >
                Reiniciar contador
              </button>
            </Popover.Dropdown>
          </Popover>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
