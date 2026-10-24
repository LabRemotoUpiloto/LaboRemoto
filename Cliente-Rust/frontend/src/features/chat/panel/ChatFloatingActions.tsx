import React from 'react';
import { ActionIcon } from '@mantine/core';
import { History, Search, SquarePen } from 'lucide-react';

type Props = {
  hasMessages: boolean;
  showHistory: boolean;
  searchOpen: boolean;
  onNewChat: () => void;
  onToggleHistory: () => void;
  onToggleSearch: () => void;
};

/** Acciones del chat sin barra de header (esquina superior derecha). */
const ChatFloatingActions: React.FC<Props> = ({
  hasMessages,
  showHistory,
  searchOpen,
  onNewChat,
  onToggleHistory,
  onToggleSearch,
}) => {
  if (!hasMessages) return null;

  return (
    <div 
      className="fixed top-5 right-5 z-[150] max-w-[calc(100vw-var(--sidebar-width)-80px)] flex items-center gap-1 p-[4px_6px] rounded-lg bg-[color-mix(in_srgb,var(--background-secondary)_92%,transparent)] border border-[var(--border-subtle)] backdrop-blur-[10px] shadow-[0_4px_16px_rgba(0,0,0,0.12)] pointer-events-auto"
      data-no-window-drag
    >
      <ActionIcon
        variant="subtle"
        color={searchOpen ? 'teal' : 'gray'}
        size="md"
        onClick={(e) => { e.stopPropagation(); onToggleSearch(); }}
        title="Buscar en el chat (Ctrl+F)"
        aria-label="Buscar en el chat"
      >
        <Search size={16} />
      </ActionIcon>
      <ActionIcon
        variant="subtle"
        color={showHistory ? 'teal' : 'gray'}
        size="md"
        onClick={(e) => { e.stopPropagation(); onToggleHistory(); }}
        title="Historial de chats"
        aria-label="Historial de chats"
      >
        <History size={16} />
      </ActionIcon>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 ml-0.5 px-2.5 py-1.25 border-none rounded bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--interactive-hover)] text-xs font-medium cursor-pointer transition-colors duration-150"
        onClick={(e) => { e.stopPropagation(); onNewChat(); }}
        title="Nuevo chat (Ctrl+N)"
      >
        <SquarePen size={14} strokeWidth={2} />
        Nuevo chat
      </button>
    </div>
  );
};

export default ChatFloatingActions;
