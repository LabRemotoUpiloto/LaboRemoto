import React, { useRef, useState } from 'react';
import { ChatMode, Message } from '../chatModes/types';
import ModeSelect from './ModeSelect';
import { MAX_CHAR_WARN, MODE_PLACEHOLDERS, TOKEN_STORAGE_KEY } from './chatPane.constants';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ActionIcon, Menu, Popover, Progress, Textarea } from '@mantine/core';
import { Image, FileText, Send, Square, Activity, ChevronUp, ChevronDown, Plus, Paperclip, History, X, SquarePen } from 'lucide-react';
import ModelSelect from './ModelSelect';
import { ModelSelection } from '../chatModes/types';

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
  variant?: 'default' | 'pill';
  selectedModel?: ModelSelection;
  onModelChange?: (m: ModelSelection) => void;
  footerMinimal?: boolean;
  onModeSwitch?: (m: ChatMode) => void;
  pi4AgentReady?: boolean;
  showHistory?: boolean;
  onToggleHistory?: () => void;
  onClose?: () => void;
  onNewChat?: () => void;
}

const ChatInput: React.FC<Props> = ({
  input, setInput, mode, isSending, onSend, onCancel, canSend,
  attachedImage, setAttachedImage,
  attachedFile, setAttachedFile,
  inputRef, isComposingRef,
  messages, sessionTokens, setSessionTokens, sessionId,
  ctxUsagePct, setToast,
  showTokenPopover, setShowTokenPopover,
  variant = 'default',
  selectedModel,
  onModelChange,
  footerMinimal = false,
  onModeSwitch,
  pi4AgentReady = false,
  showHistory = false,
  onToggleHistory,
  onClose,
  onNewChat,
}) => {
  const isPill = variant === 'pill';
  const pillPlaceholder = MODE_PLACEHOLDERS[mode];
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

  const attachMenu = (
    <Menu position="top-start" offset={8} withinPortal>
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          className={isPill ? 'shrink-0 w-9 h-9 min-w-[36px] min-h-[36px] rounded-[10px] text-[var(--text-secondary)] self-center hover:text-[var(--text-primary)] hover:bg-[var(--interactive-hover,var(--background-tertiary))]' : ''}
          title="Adjuntar"
          size={isPill ? 'lg' : 'md'}
          style={isPill ? undefined : undefined}
        >
          {isPill ? <Plus size={20} strokeWidth={2} /> : <Image size={15} />}
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<Image size={14} />} onClick={() => fileInputRef.current?.click()}>
          Imagen
        </Menu.Item>
        <Menu.Item leftSection={<Paperclip size={14} />} onClick={() => textFileInputRef.current?.click()}>
          Archivo de texto
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );

  const showModeRow = !footerMinimal && onModeSwitch && selectedModel && onModelChange;

  return (
    <div
      className={[
        'chat-input relative shrink-0 transition-all duration-200',
        isPill ? 'mt-0 max-w-[860px] w-full p-0' : 'mt-2 mx-auto max-w-[850px] w-full px-2 sm:px-4',
        isDragging ? 'ring-2 ring-blue-400/45 rounded-lg' : '',
      ].join(' ')}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {showModeRow && (
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <ModeSelect value={mode} onChange={onModeSwitch} sessionId={sessionId} pi4AgentReady={pi4AgentReady} />
          <ModelSelect value={selectedModel} onChange={onModelChange} />
          <div className="flex items-center gap-0.5 ml-auto">
            {onToggleHistory && (
              <ActionIcon
                data-no-window-drag
                variant="subtle"
                color={showHistory ? 'teal' : 'gray'}
                size="sm"
                onClick={onToggleHistory}
                title="Historial"
              >
                <History size={15} />
              </ActionIcon>
            )}
            {onNewChat && (
              <ActionIcon
                data-no-window-drag
                variant="subtle"
                color="gray"
                size="sm"
                onClick={onNewChat}
                title="Nuevo chat (Ctrl+N)"
              >
                <SquarePen size={15} />
              </ActionIcon>
            )}
            {onClose && (
              <ActionIcon
                data-no-window-drag
                variant="subtle"
                color="red"
                size="sm"
                onClick={onClose}
                title="Cerrar panel"
              >
                <X size={16} />
              </ActionIcon>
            )}
          </div>
        </div>
      )}

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

      <div
        className={
          isPill
            ? `flex items-center gap-1.5 min-h-[62px] py-2.5 pr-2.5 pl-3.5 rounded-r-[18px] rounded-l-none max-[760px]:rounded-r-[14px] border-none border-l-[5px] border-l-[var(--accent-primary)] bg-[color-mix(in_srgb,var(--background-secondary)_96%,var(--accent-primary)_4%)] shadow-[0_20px_44px_rgba(0,0,0,0.16)] transition-all duration-200 overflow-hidden focus-within:bg-[color-mix(in_srgb,var(--background-secondary)_90%,var(--accent-secondary)_10%)] focus-within:shadow-[0_24px_52px_rgba(0,0,0,0.24)] ${(attachedImage || attachedFile) ? 'flex-col items-stretch !rounded-3xl' : ''}`
            : `flex flex-col items-stretch border border-subtle rounded-xl overflow-hidden shadow-sm transition-colors duration-200 focus-within:border-[var(--accent-primary)]/40 p-2 gap-1`
        }
        style={isPill ? undefined : { backgroundColor: 'var(--background-tertiary)' }}
      >
        {isPill && (
          <span className="shrink-0 ml-0.5 mr-1 font-mono text-[18px] font-extrabold text-[var(--accent-secondary)] select-none">
            $
          </span>
        )}
        {isPill && !attachedImage && !attachedFile && attachMenu}
        {/* Image chip */}
        {attachedImage && (
          <div className="flex items-center gap-2 pt-2 px-2.5 pb-1">
            <div className="relative shrink-0">
              <img
                src={attachedImage.preview}
                alt="adjunto"
                className="w-12 h-12 rounded-md object-cover border border-[var(--border-subtle)] block"
              />
              <button
                onClick={() => setAttachedImage(null)}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] flex items-center justify-center cursor-pointer transition-colors" style={{ backgroundColor: 'var(--background-tertiary)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
              >✕</button>
            </div>
            <span className="text-[11px] text-[var(--text-muted)] italic">{attachedImage.label ?? 'imagen lista para enviar'}</span>
          </div>
        )}
        {/* File chip */}
        {attachedFile && (
          <div className="flex items-center gap-1.5 pt-2 px-2.5 pb-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--accent-primary-subtle)] border border-[var(--border-subtle)] text-[11.5px] flex-1 min-w-0">
              <FileText size={12} className="text-[var(--accent-primary)] shrink-0" />
              <span className="text-[var(--text-primary)] overflow-hidden text-ellipsis whitespace-nowrap">{attachedFile.name}</span>
            </div>
            <button
              onClick={() => setAttachedFile(null)}
              className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer text-[15px] px-0.5 shrink-0 leading-none hover:text-[var(--text-primary)]"
              title="Quitar archivo"
            >×</button>
          </div>
        )}

        {!isPill ? (
          // STACKED LAYOUT (for active chat pane)
          <div className="flex flex-col w-full">
            {/* Top row: full-width Textarea */}
            <div className="w-full">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={MODE_PLACEHOLDERS[mode]}
                variant="unstyled"
                autosize
                minRows={2}
                maxRows={10}
                className="w-full"
                classNames={{
                  wrapper: 'w-full',
                  input: 'bg-transparent border-none text-[var(--text-primary)] text-[13.5px] leading-relaxed placeholder-[var(--placeholder-fg)] focus:ring-0 px-2 py-1.5 scrollbar-thin w-full min-h-[40px]',
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
                    if (!isSending && canSend && input.trim().length > 0) onSend();
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
            </div>
            
            {/* Bottom row: actions on left, send on right */}
            <div className="flex items-center justify-between w-full pt-1.5 px-2 border-t border-[var(--border-subtle)]/30 mt-1 min-h-[32px]">
              {/* Left actions */}
              <div className="flex items-center gap-1.5">
                <ActionIcon
                  variant="subtle"
                  onClick={() => fileInputRef.current?.click()}
                  title="Adjuntar imagen"
                  className={`hover:bg-[var(--interactive-hover)] ${attachedImage ? 'text-[var(--accent-primary)]' : 'text-[var(--text-secondary)]/50 hover:text-[var(--text-primary)]'}`}
                  size="sm"
                >
                  <Image size={14} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  onClick={() => textFileInputRef.current?.click()}
                  title="Adjuntar archivo de texto (.sh, .conf, .log, .py…)"
                  className={`hover:bg-[var(--interactive-hover)] ${attachedFile ? 'text-[var(--accent-primary)]' : 'text-[var(--text-secondary)]/50 hover:text-[var(--text-primary)]'}`}
                  size="sm"
                >
                  <FileText size={13} />
                </ActionIcon>
              </div>

              {/* Right actions (Send button) */}
              <div className="flex items-center gap-1.5">
                {(input.trim().length > 0 || isSending) && (
                  <ActionIcon
                    variant={isSending ? 'light' : 'filled'}
                    color={isSending ? 'red' : undefined}
                    onClick={isSending ? onCancel : onSend}
                    disabled={!isSending && !canSend}
                    aria-label={isSending ? 'Cancelar' : 'Enviar'}
                    className="!shrink-0 !w-7 !h-7 !min-w-[28px] !min-h-[28px] !rounded-lg !bg-[var(--accent-primary)] !text-[var(--accent-contrast,#fff)] hover:not(:disabled):!bg-[var(--accent-primary-hover)] disabled:!opacity-45 disabled:!bg-[var(--border-subtle)] animate-[scaleIn_0.15s_ease-out]"
                    size="sm"
                  >
                    {isSending ? <Square size={12} fill="currentColor" /> : <Send size={13} className="mr-[1px]" />}
                  </ActionIcon>
                )}
              </div>
            </div>
          </div>
        ) : (
          // ROW LAYOUT (for empty search-bar home-page pill)
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={pillPlaceholder}
              variant="unstyled"
              autosize
              minRows={1}
              maxRows={8}
              className="flex-1 min-w-0 flex items-center"
              classNames={{
                wrapper: 'w-full',
                input: '!p-[10px_4px] !text-[14px] !leading-[1.4] !text-[var(--text-primary)] !min-h-[24px] bg-transparent border-none focus:ring-0 scrollbar-thin placeholder:!text-[var(--text-muted)]',
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
                  if (!isSending && canSend && input.trim().length > 0) onSend();
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
            
            <div className="flex items-center justify-center gap-2 shrink-0 pr-[2px]">
              {onModeSwitch && (
                <div className="flex items-center shrink-0">
                  <ModeSelect
                    value={mode}
                    onChange={onModeSwitch}
                    sessionId={sessionId}
                    pi4AgentReady={pi4AgentReady}
                    compact
                  />
                </div>
              )}
              {selectedModel && onModelChange && (
                <div className="hidden sm:flex items-center">
                  <ModelSelect value={selectedModel} onChange={onModelChange} compact />
                </div>
              )}
              {(input.trim().length > 0 || isSending) && (
                <ActionIcon
                  variant={isSending ? 'light' : 'filled'}
                  color={isSending ? 'red' : undefined}
                  onClick={isSending ? onCancel : onSend}
                  disabled={!isSending && !canSend}
                  aria-label={isSending ? 'Cancelar' : 'Enviar'}
                  className="!shrink-0 !w-8 !h-8 !min-w-[32px] !min-h-[32px] !rounded-xl !bg-[var(--accent-primary)] !text-[var(--text-inverse,#fff)] !self-center !m-0 hover:not(:disabled):!bg-[var(--accent-primary-hover)] disabled:!opacity-45 animate-[scaleIn_0.15s_ease-out]"
                  size="md"
                >
                  {isSending ? <Square size={14} fill="currentColor" /> : <Send size={15} />}
                </ActionIcon>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className={
          isPill
            ? 'flex items-center justify-center mt-2.5 px-1'
            : `flex items-center justify-between mt-2 px-1 ${footerMinimal ? 'justify-center mt-2.5' : ''}`
        }
      >
        <div className={isPill ? 'text-[11px] text-[var(--text-muted)] font-medium' : 'text-[10.5px]'}>
          {footerMinimal && input.length === 0 ? (
            <span className={isPill ? 'text-[var(--text-muted)]' : undefined}>
              {mode === 'agente'
                ? (pi4AgentReady || sessionId
                  ? 'Modo agente · ejecuta comandos en la Raspberry (PI4 en .env o sesión SSH)'
                  : 'Modo agente · configura PI4_USER y PI4_PASSWORD en .env o conecta SSH')
                : mode === 'plan'
                  ? (pi4AgentReady || sessionId
                    ? 'Modo plan · requiere PI4 en .env o sesión SSH'
                    : 'Modo plan · requiere PI4 en .env o sesión SSH')
                  : (pi4AgentReady
                    ? 'Modo consulta · cambia a Agente en el selector junto al enviar'
                    : 'Modo consulta · conecta SSH o configura PI4 en .env para Agente')}
            </span>
          ) : input.length === 0 ? (
            <span className="text-secondary/40 font-medium">Shift+↵ nueva línea · Shift+? atajos</span>
          ) : (
            <span className={`${input.length > MAX_CHAR_WARN ? 'text-red-400 font-semibold' : 'text-secondary/50 font-medium'}`}>
              {input.length > MAX_CHAR_WARN
                ? `⚠ ${input.length.toLocaleString()} car. — mensaje muy largo`
                : `${input.length} car.`}
            </span>
          )}
        </div>

        {/* Token badge */}
        {!footerMinimal && (
        <div className="relative">
          <Popover opened={showTokenPopover} onChange={setShowTokenPopover} position="top-end" withArrow shadow="md">
            <Popover.Target>
              <button
                className={`flex items-center h-5 px-1.5 rounded bg-[var(--background-primary)] border border-[var(--border-subtle)] text-[9px] font-mono tracking-wider cursor-pointer transition-colors duration-200 hover:bg-[var(--interactive-hover)] hover:border-[var(--border-strong)] text-[var(--text-secondary)]
                  ${sessionTokens.input === 0 ? 'opacity-40 grayscale pointer-events-none' : ''}`}
                onClick={() => setShowTokenPopover(v => !v)}
                title="Ver desglose de tokens de la sesión"
              >
                <Activity size={10} className="mr-1 opacity-70 text-[var(--accent-primary)]" />
                <span className="text-[var(--accent-primary)]">{sessionTokens.input.toLocaleString()}</span>
                <span className="mx-1 opacity-30"><ChevronUp size={9} /></span>
                <span className="text-[var(--success)]">{sessionTokens.output.toLocaleString()}</span>
                <span className="mx-1 opacity-30"><ChevronDown size={9} /></span>
              </button>
            </Popover.Target>
            <Popover.Dropdown className="bg-[var(--background-secondary)] border border-[var(--border-subtle)] p-3 min-w-[220px]">
              <div className="flex justify-between items-center text-xs mb-2">
                <span className="text-[var(--text-secondary)] font-medium">Entrada</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-[var(--accent-primary)] font-mono tracking-wider">{sessionTokens.input.toLocaleString()}</span>
                  <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest font-semibold">tok</span>
                </div>
              </div>
              <div className="flex justify-between items-center text-xs mb-2">
                <span className="text-[var(--text-secondary)] font-medium">Salida</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-[var(--success)] font-mono tracking-wider">{sessionTokens.output.toLocaleString()}</span>
                  <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest font-semibold">tok</span>
                </div>
              </div>
              <div className="h-[1px] bg-[var(--border-subtle)] my-2" />
              <div className="flex justify-between items-center text-xs mb-2">
                <span className="text-[var(--text-secondary)] font-medium">Total</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-[var(--text-primary)] font-mono tracking-wider">{(sessionTokens.input + sessionTokens.output).toLocaleString()}</span>
                  <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest font-semibold">tok</span>
                </div>
              </div>
              <div className="h-[1px] bg-[var(--border-subtle)] my-2" />
              <div className="bg-[var(--background-tertiary)] rounded-lg p-2.5 mt-2 border border-[var(--border-subtle)]">
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="text-[var(--text-secondary)]/70 font-medium">Contexto ~</span>
                  <span className={`text-[10.5px] font-mono ${ctxUsagePct > 90 ? 'text-[var(--danger-text)]' : ctxUsagePct > 70 ? 'text-[var(--warning-text)]' : 'text-[var(--text-secondary)]/60'}`}>
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
        )}
      </div>
    </div>
  );
};

export default ChatInput;
