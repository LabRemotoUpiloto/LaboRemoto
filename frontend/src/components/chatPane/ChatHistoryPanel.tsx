import React from 'react';
import { fmtTime, HistoryEntry } from './chatPane.constants';

interface Props {
  showHistory: boolean;
  setShowHistory: (v: boolean) => void;
  historySearch: string;
  setHistorySearch: (v: string) => void;
  historyEntries: HistoryEntry[];
  pendingDeleteId: string | null;
  hostKey: string;
  handleLoadHistory: (entry: HistoryEntry) => void;
  handleDeleteHistoryEntry: (id: string, ev: React.MouseEvent) => void;
  confirmDeleteHistoryEntry: (id: string, ev: React.MouseEvent) => void;
  cancelDeleteHistoryEntry: (ev: React.MouseEvent) => void;
}

const ChatHistoryPanel: React.FC<Props> = ({
  showHistory, setShowHistory,
  historySearch, setHistorySearch,
  historyEntries, pendingDeleteId, hostKey,
  handleLoadHistory, handleDeleteHistoryEntry,
  confirmDeleteHistoryEntry, cancelDeleteHistoryEntry,
}) => {
  if (!showHistory) return null;

  const close = () => { setShowHistory(false); setHistorySearch(''); };

  const q = historySearch.toLowerCase().trim();
  const filtered = q
    ? historyEntries.filter(e =>
        e.preview.toLowerCase().includes(q) ||
        (e.mode ?? '').toLowerCase().includes(q)
      )
    : historyEntries;

  return (
    <div className="chat-history-overlay" onClick={close}>
      <div className="chat-history-panel" onClick={e => e.stopPropagation()}>
        <div className="chat-history-header">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span>Historial de chats</span>
            {hostKey !== 'default' && <span className="chat-history-device">{hostKey}</span>}
          </div>
          <button className="shortcuts-close" onClick={close}>×</button>
        </div>

        <div className="chat-history-search">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.4 }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="chat-history-search-input"
            placeholder="Filtrar conversaciones…"
            value={historySearch}
            onChange={e => setHistorySearch(e.target.value)}
            autoComplete="off"
          />
          {historySearch && (
            <button className="chat-history-search-clear" onClick={() => setHistorySearch('')}>×</button>
          )}
        </div>

        {historyEntries.length === 0 ? (
          <div className="chat-history-empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <p>Sin conversaciones guardadas</p>
            <span>Se guardan al hacer "Nuevo chat"</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="chat-history-empty">
            <p style={{ fontSize: 12 }}>Sin resultados para "{historySearch}"</p>
          </div>
        ) : (
          <ul className="chat-history-list">
            {filtered.map(entry => (
              <li key={entry.id} className="chat-history-item" onClick={() => handleLoadHistory(entry)}>
                <div className="chat-history-item-meta">
                  <span className="chat-history-date">{fmtTime(entry.date)}</span>
                  <span className="chat-history-count">{entry.messageCount} msgs</span>
                  {entry.mode && <span className="chat-history-mode" data-mode={entry.mode}>{entry.mode}</span>}
                </div>
                <p className="chat-history-preview">{entry.preview || 'Sin mensajes'}</p>
                {pendingDeleteId === entry.id ? (
                  <div className="chat-history-confirm" onClick={ev => ev.stopPropagation()}>
                    <span>¿Eliminar?</span>
                    <button className="chat-history-confirm-yes" onClick={ev => confirmDeleteHistoryEntry(entry.id, ev)}>Sí</button>
                    <button className="chat-history-confirm-no" onClick={cancelDeleteHistoryEntry}>No</button>
                  </div>
                ) : (
                  <button
                    className="chat-history-delete"
                    onClick={ev => handleDeleteHistoryEntry(entry.id, ev)}
                    title="Eliminar"
                  >×</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ChatHistoryPanel;
