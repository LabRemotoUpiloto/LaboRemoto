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
    <div className="chat-floating-actions" data-no-window-drag>
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
        className="chat-floating-actions__new"
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
