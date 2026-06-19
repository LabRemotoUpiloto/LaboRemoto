import React from 'react';
import { Group, ActionIcon } from '@mantine/core';
import { PANEL_ICONS } from './HeaderConstants';

interface HeaderActionsProps {
  showViewToggle: boolean;
  activeView: 'terminal' | 'escritorio';
  onViewChange: (view: 'terminal' | 'escritorio') => void;
  isChatOpen: boolean;
  onToggleChat: () => void;
  onToggleCamera?: () => void;
  onTogglePins?: () => void;
  isCameraActive: boolean;
  isPinsActive: boolean;
}

const HeaderActions: React.FC<HeaderActionsProps> = ({
  showViewToggle,
  activeView,
  onViewChange,
  isChatOpen,
  onToggleChat,
  onToggleCamera,
  onTogglePins,
  isCameraActive,
  isPinsActive,
}) => {
  if (!showViewToggle) return null;

  return (
    <Group gap={2} wrap="nowrap" className="hidden lg:flex">
      <ActionIcon
        variant={activeView === 'escritorio' ? 'light' : 'subtle'}
        color={activeView === 'escritorio' ? 'teal' : 'gray'}
        size="md"
        onClick={() => onViewChange(activeView === 'terminal' ? 'escritorio' : 'terminal')}
        title={activeView === 'escritorio' ? 'Volver a terminal' : 'Abrir escritorio remoto'}
      >
        <div className="w-4 h-4">{activeView === 'escritorio' ? PANEL_ICONS['terminal'] : PANEL_ICONS['escritorio']}</div>
      </ActionIcon>

      <ActionIcon
        variant={isChatOpen ? 'light' : 'subtle'}
        color={isChatOpen ? 'teal' : 'gray'}
        size="md"
        onClick={onToggleChat}
        title="Chat de IA"
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 10.5a1.5 1.5 0 0 1-1.5 1.5H5L2 15V3a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 14 3z" />
        </svg>
      </ActionIcon>

      <div className="w-[1px] h-3 bg-border-subtle mx-1" />

      <ActionIcon
        variant={isCameraActive ? 'light' : 'subtle'}
        color={isCameraActive ? 'teal' : 'gray'}
        size="md"
        onClick={onToggleCamera}
        title="Cámara"
      >
        <div className="w-4 h-4">{PANEL_ICONS['camara']}</div>
      </ActionIcon>
      <ActionIcon
        variant={isPinsActive ? 'light' : 'subtle'}
        color={isPinsActive ? 'teal' : 'gray'}
        size="md"
        onClick={onTogglePins}
        title="GPIO / Pines"
      >
        <div className="w-4 h-4">{PANEL_ICONS['pines']}</div>
      </ActionIcon>
    </Group>
  );
};

export default HeaderActions;
