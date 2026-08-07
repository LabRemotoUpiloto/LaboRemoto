import React from 'react';
import { WindowDragZone } from '../window/WindowDragZone';
import { ChatMode } from '../chatModes/types';
import { ModelSelection } from '../chatModes/types';
import ModeSelect from './ModeSelect';
import ModelSelect from './ModelSelect';
import { MODE_DESCRIPTIONS } from './chatPane.constants';
import { ActionIcon, Menu, Kbd } from '@mantine/core';
import { History, Search, MoreVertical, Download, Keyboard, SquarePen, X, Terminal } from 'lucide-react';

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
  return (
    <div className="flex flex-col border-b border-subtle bg-secondary w-full shrink-0 z-10 sticky top-0">
      {/* Top Title Bar */}
      <WindowDragZone
        className="flex items-center justify-between h-10 px-3"
        style={{ backgroundColor: 'var(--background-tertiary)' }}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="flex items-center justify-center w-5 h-5 rounded bg-accent/10 text-accent shrink-0">
            <Terminal size={12} strokeWidth={2.5} />
          </div>
          <span className="font-semibold text-[13px] tracking-wide text-primary truncate">Asistente SSH</span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <ActionIcon
            variant="subtle"
            color={showHistory ? 'teal' : 'gray'}
            onClick={onToggleHistory}
            title="Historial de chats"
            size="sm"
          >
            <History size={15} />
          </ActionIcon>

          <ActionIcon
            variant="subtle"
            color={searchOpen ? 'teal' : 'gray'}
            onClick={onToggleSearch}
            title="Buscar en este chat (Ctrl+F)"
            size="sm"
          >
            <Search size={15} />
          </ActionIcon>

          <Menu shadow="md" width={220} position="bottom-end">
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                color="gray"
                title="Más acciones"
                size="sm"
              >
                <MoreVertical size={16} />
              </ActionIcon>
            </Menu.Target>

            <Menu.Dropdown>
              <Menu.Item
                leftSection={<Download size={14} />}
                onClick={onExportMd}
                disabled={messagesEmpty}
                fz="xs"
              >
                Exportar como .md
              </Menu.Item>
              <Menu.Item
                leftSection={<Download size={14} />}
                onClick={onExportHtml}
                disabled={messagesEmpty}
                fz="xs"
              >
                Exportar como .html
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                leftSection={<Keyboard size={14} />}
                onClick={onToggleShortcuts}
                rightSection={<Kbd>Shift+?</Kbd>}
                fz="xs"
              >
                Atajos de teclado
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>

          <div className="w-[1px] h-4 bg-white/10 mx-1" />

          <ActionIcon
            variant="subtle"
            color="blue"
            className="hover:bg-blue-500/10 text-blue-400"
            onClick={onNewChat}
            title="Nuevo chat"
            size="sm"
          >
            <SquarePen size={15} />
          </ActionIcon>

          {onClose && (
            <ActionIcon
              variant="subtle"
              color="red"
              className="hover:bg-red-500/10 text-red-400 ml-0.5"
              onClick={onClose}
              title="Cerrar panel"
              size="sm"
            >
              <X size={16} />
            </ActionIcon>
          )}
        </div>
      </WindowDragZone>

      {/* Selectors Bar */}
      <div className="flex items-center gap-2 p-2 bg-secondary border-b border-subtle relative z-[5]">
        <ModeSelect value={mode} onChange={onModeSwitch} sessionId={sessionId} />
        <ModelSelect value={selectedModel} onChange={onModelChange} />
      </div>

      {/* Mode Description */}
      <div className="py-1 px-3 bg-secondary text-[10px] text-white/40 border-b border-subtle flex items-center gap-2 h-[22px]">
        <span className="truncate">{MODE_DESCRIPTIONS[mode]}</span>
      </div>
    </div>
  );
};

export default ChatHeader;
