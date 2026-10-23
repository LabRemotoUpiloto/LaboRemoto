import React from 'react';
import { fmtTime, HistoryEntry } from './chatPane.constants';
import { ActionIcon, TextInput, Button, Badge } from '@mantine/core';
import { X, Search, Clock, Trash2 } from 'lucide-react';

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
    <div className="absolute inset-0 z-[100] flex justify-end overflow-hidden">
      {/* Overlay */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px] animate-in fade-in duration-200" 
        onClick={close}
      />
      
      {/* Panel */}
      <div
        className="relative w-[320px] max-w-full h-full flex flex-col shadow-2xl animate-in slide-in-from-right-8 duration-300"
        style={{ backgroundColor: 'var(--background-secondary)', borderLeft: '1px solid var(--border-subtle)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--background-tertiary)' }}>
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>Historial de chats</span>
            {hostKey !== 'default' && (
              <span className="text-accent text-[10px] font-mono tracking-wide uppercase opacity-80">{hostKey}</span>
            )}
          </div>
          <ActionIcon variant="subtle" color="gray" onClick={close}>
            <X size={16} />
          </ActionIcon>
        </div>

        <div className="p-3 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--background-primary)' }}>
          <TextInput
            placeholder="Filtrar conversaciones…"
            value={historySearch}
            onChange={e => setHistorySearch(e.target.value)}
            leftSection={<Search size={14} />}
            rightSection={historySearch ? (
              <ActionIcon size="sm" variant="transparent" color="gray" onClick={() => setHistorySearch('')}>
                <X size={12} />
              </ActionIcon>
            ) : null}
            size="xs"
            variant="filled"
          />
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
          {historyEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center" style={{ color: 'var(--text-muted)' }}>
              <Clock size={32} strokeWidth={1.5} className="opacity-50" />
              <p className="text-sm font-medium">Sin conversaciones guardadas</p>
              <span className="text-xs opacity-70">Se guardan al hacer "Nuevo chat"</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-xs" style={{ color: 'var(--text-muted)' }}>
              Sin resultados para "{historySearch}"
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {filtered.map(entry => (
                <div
                  key={entry.id}
                  className="group relative flex flex-col gap-1.5 p-3 rounded-md cursor-pointer transition-colors"
                  style={{ backgroundColor: 'var(--interactive-bg)', border: '1px solid var(--border-subtle)' }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--interactive-hover)' }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--interactive-bg)' }}
                  onClick={() => handleLoadHistory(entry)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium tabular-nums" style={{ color: 'var(--text-muted)' }}>{fmtTime(entry.date)}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{entry.messageCount} msgs</span>
                      {entry.mode && (
                        <Badge
                          size="xs"
                          variant="light"
                          color={entry.mode === 'agente' ? 'yellow' : entry.mode === 'plan' ? 'green' : 'blue'}
                        >
                          {entry.mode}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <p className="text-xs line-clamp-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {entry.preview || 'Sin mensajes'}
                  </p>

                  {pendingDeleteId === entry.id ? (
                    <div
                      className="absolute inset-0 backdrop-blur-sm rounded-md flex items-center justify-center gap-3"
                      style={{ backgroundColor: 'var(--background-secondary)', border: '1px solid var(--danger-border)' }}
                      onClick={ev => ev.stopPropagation()}
                    >
                      <span className="text-xs font-medium" style={{ color: 'var(--danger-text)' }}>¿Eliminar?</span>
                      <div className="flex items-center gap-1">
                        <Button size="compact-xs" color="red" variant="light" onClick={ev => confirmDeleteHistoryEntry(entry.id, ev)}>Sí</Button>
                        <Button size="compact-xs" color="gray" variant="subtle" onClick={cancelDeleteHistoryEntry}>No</Button>
                      </div>
                    </div>
                  ) : (
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={ev => handleDeleteHistoryEntry(entry.id, ev)}
                      title="Eliminar"
                      size="sm"
                    >
                      <Trash2 size={13} />
                    </ActionIcon>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatHistoryPanel;
