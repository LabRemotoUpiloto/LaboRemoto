import React from 'react';
import { Group, ActionIcon, Text } from '@mantine/core';
import type { ActiveView } from '../../hooks/useAppTabs';
import { PANEL_ICONS } from './header/HeaderConstants';

type Props = {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  isChatOpen: boolean;
  onToggleChat: () => void;
  onToggleCamera?: () => void;
  onTogglePins?: () => void;
  isCameraActive: boolean;
  isPinsActive: boolean;
};

/** Acciones de sesión en el sidebar (sustituye la barra superior). */
const SidebarSessionActions: React.FC<Props> = ({
  activeView,
  onViewChange,
  isChatOpen,
  onToggleChat,
  onToggleCamera,
  onTogglePins,
  isCameraActive,
  isPinsActive,
}) => (
  <div className="px-2 pb-2 mb-1 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
    <Text
      size="xs"
      fw={600}
      px={8}
      mb={4}
      style={{
        color: 'var(--text-muted)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontSize: '10px',
      }}
    >
      Vista
    </Text>
    <Group gap={4} px={4} wrap="nowrap">
      <ActionIcon
        data-no-window-drag
        size="md"
        onClick={() => onViewChange(activeView === 'terminal' ? 'escritorio' : 'terminal')}
        title={activeView === 'escritorio' ? 'Volver a terminal' : 'Escritorio remoto'}
        style={{
          backgroundColor: activeView === 'escritorio' ? 'var(--interactive-selected)' : 'transparent',
          color: activeView === 'escritorio' ? 'var(--accent-primary)' : 'var(--text-secondary)',
          border: activeView === 'escritorio' ? '1px solid var(--accent-primary)' : '1px solid transparent',
        }}
        className="hover:bg-[var(--interactive-hover)] hover:text-[var(--text-primary)] transition-colors duration-150"
      >
        <div className="w-4 h-4">{activeView === 'escritorio' ? PANEL_ICONS['terminal'] : PANEL_ICONS['escritorio']}</div>
      </ActionIcon>
      <ActionIcon
        data-no-window-drag
        size="md"
        onClick={onToggleChat}
        title="Chat de IA"
        style={{
          backgroundColor: isChatOpen ? 'var(--interactive-selected)' : 'transparent',
          color: isChatOpen ? 'var(--accent-primary)' : 'var(--text-secondary)',
          border: isChatOpen ? '1px solid var(--accent-primary)' : '1px solid transparent',
        }}
        className="hover:bg-[var(--interactive-hover)] hover:text-[var(--text-primary)] transition-colors duration-150"
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 10.5a1.5 1.5 0 0 1-1.5 1.5H5L2 15V3a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 14 3z" />
        </svg>
      </ActionIcon>
      <ActionIcon
        data-no-window-drag
        size="md"
        onClick={onToggleCamera}
        title="Cámara"
        style={{
          backgroundColor: isCameraActive ? 'var(--interactive-selected)' : 'transparent',
          color: isCameraActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
          border: isCameraActive ? '1px solid var(--accent-primary)' : '1px solid transparent',
        }}
        className="hover:bg-[var(--interactive-hover)] hover:text-[var(--text-primary)] transition-colors duration-150"
      >
        <div className="w-4 h-4">{PANEL_ICONS['camara']}</div>
      </ActionIcon>
      <ActionIcon
        data-no-window-drag
        size="md"
        onClick={onTogglePins}
        title="GPIO / Pines"
        style={{
          backgroundColor: isPinsActive ? 'var(--interactive-selected)' : 'transparent',
          color: isPinsActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
          border: isPinsActive ? '1px solid var(--accent-primary)' : '1px solid transparent',
        }}
        className="hover:bg-[var(--interactive-hover)] hover:text-[var(--text-primary)] transition-colors duration-150"
      >
        <div className="w-4 h-4">{PANEL_ICONS['pines']}</div>
      </ActionIcon>
    </Group>
  </div>
);

export default SidebarSessionActions;
