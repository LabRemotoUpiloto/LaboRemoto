import React, { useState, useRef, useEffect } from 'react';
import { ChatMode } from '../chatModes/types';
import { ModelSelection } from '../chatModes/types';
import ModeSelect from './ModeSelect';
import ModelSelect from './ModelSelect';
import { MODE_DESCRIPTIONS } from './chatPane.constants';

interface Props {
  mode: ChatMode;
  onModeSwitch: (m: ChatMode) => void;
  sessionId: string | null;
  selectedModel: ModelSelection;
  onModelChange: (m: ModelSelection) => void;
  showHistory: boolean;
  onToggleHistory: () => void;
  searchOpen: boolean;
  onToggleSearch: () => void;
  onExportMd: () => void;
  onExportHtml: () => void;
  messagesEmpty: boolean;
  showShortcuts: boolean;
  onToggleShortcuts: () => void;
  onNewChat: () => void;
  onClose?: () => void;
}

const ChatHeader: React.FC<Props> = ({
  mode, onModeSwitch, sessionId, selectedModel, onModelChange,
  showHistory, onToggleHistory, searchOpen, onToggleSearch,
  onExportMd, onExportHtml, messagesEmpty, showShortcuts, onToggleShortcuts,
  onNewChat, onClose,
}) => {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!overflowOpen) return;
    const handler = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node))
        setOverflowOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [overflowOpen]);

  const runAndClose = (fn: () => void) => { fn(); setOverflowOpen(false); };

  return (
    <div className="chat-header">
      <div className="chat-titlebar">
        <div className="chat-tb-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="var(--accent-primary)" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 17 10 11 4 5"/>
            <line x1="12" y1="19" x2="20" y2="19"/>
          </svg>
        </div>
        <span className="chat-tb-title">Asistente SSH</span>
        <div className="chat-tb-status" title="Activo"/>
        <div className="chat-tb-actions">
          {/* Historial */}
          <button className="chat-tb-btn"
            onClick={onToggleHistory}
            title="Historial de chats"
            style={{ opacity: showHistory ? 1 : undefined, color: showHistory ? 'var(--accent-primary)' : undefined }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </button>

          {/* Buscar */}
          <button className="chat-tb-btn"
            onClick={onToggleSearch}
            title="Buscar en este chat (Ctrl+F)"
            style={{ opacity: searchOpen ? 1 : undefined, color: searchOpen ? 'var(--accent-primary)' : undefined }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>

          {/* Menú ⋮ — acciones secundarias */}
          <div className="chat-overflow-wrap" ref={overflowRef}>
            <button
              className={`chat-tb-btn${overflowOpen ? ' is-active' : ''}`}
              onClick={() => setOverflowOpen(o => !o)}
              title="Más acciones"
              style={{ opacity: overflowOpen ? 1 : undefined, color: overflowOpen ? 'var(--accent-primary)' : undefined }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="5" r="1.2" fill="currentColor" stroke="none"/>
                <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>
                <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none"/>
              </svg>
            </button>

            {overflowOpen && (
              <div className="chat-overflow-menu">
                <button
                  className="chat-overflow-item"
                  onClick={() => runAndClose(onExportMd)}
                  disabled={messagesEmpty}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Exportar como .md
                </button>
                <button
                  className="chat-overflow-item"
                  onClick={() => runAndClose(onExportHtml)}
                  disabled={messagesEmpty}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                  </svg>
                  Exportar como .html
                </button>
                <div className="chat-overflow-separator"/>
                <button
                  className={`chat-overflow-item${showShortcuts ? ' is-checked' : ''}`}
                  onClick={() => runAndClose(onToggleShortcuts)}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  Atajos de teclado
                  <kbd>Shift+?</kbd>
                </button>
              </div>
            )}
          </div>

          {/* Nuevo chat */}
          <button className="chat-tb-btn is-new" onClick={onNewChat} title="Nuevo chat">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>

          {/* Cerrar */}
          <button className="chat-tb-btn is-close" onClick={onClose} title="Cerrar panel">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="chat-toolbar">
        <ModeSelect value={mode} onChange={onModeSwitch} sessionId={sessionId} />
        <ModelSelect value={selectedModel} onChange={onModelChange} />
      </div>
      <div className="chat-mode-desc">
        <span className="chat-mode-desc__dot" data-mode={mode}/>
        {MODE_DESCRIPTIONS[mode]}
      </div>
    </div>
  );
};

export default ChatHeader;
