import React from 'react';
import { ActionIcon, Text, UnstyledButton } from '@mantine/core';
import type { Tab } from '../../hooks/useAppTabs';
import { CloseIcon } from './header/HeaderConstants';

type Props = {
  tabs: Tab[];
  activeTabId: string;
  onTabClick: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewSession: () => void;
  onNewLocalTerminal: () => void;
};

const sectionLabelStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  fontSize: '10px',
};

const TabRow: React.FC<{
  tab: Tab;
  isActive: boolean;
  onTabClick: (id: string) => void;
  onCloseTab: (id: string) => void;
}> = ({ tab, isActive, onTabClick, onCloseTab }) => (
  <div
    className="group flex items-center gap-1 rounded-md transition-colors"
    style={{ backgroundColor: isActive ? 'var(--accent-primary-subtle)' : 'transparent' }}
  >
    <UnstyledButton
      data-no-window-drag
      onClick={() => onTabClick(tab.id)}
      className="flex-1 flex items-center gap-2 min-w-0 px-2 py-1.5 text-left"
      style={{ color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: isActive ? 'var(--success)' : 'var(--text-muted)' }}
      />
      <Text size="xs" fw={isActive ? 600 : 400} truncate style={{ fontSize: '12px' }}>
        {tab.label}
      </Text>
    </UnstyledButton>
    <ActionIcon
      data-no-window-drag
      variant="subtle"
      color="gray"
      size="xs"
      className="opacity-0 group-hover:opacity-100 mr-0.5 shrink-0"
      onClick={() => onCloseTab(tab.id)}
      title="Cerrar"
    >
      <CloseIcon size={10} />
    </ActionIcon>
  </div>
);

/** Sesiones SSH y terminales locales activas en el sidebar (sin barra superior). */
const SidebarSessions: React.FC<Props> = ({
  tabs,
  activeTabId,
  onTabClick,
  onCloseTab,
  onNewSession,
  onNewLocalTerminal,
}) => {
  const sessions = tabs.filter(t => t.type === 'session');
  const localTerminals = tabs.filter(t => t.type === 'local-terminal');

  if (sessions.length === 0 && localTerminals.length === 0) return null;

  return (
    <div className="px-2 pb-2 mb-1 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
      {sessions.length > 0 && (
        <>
          <Text size="xs" fw={600} px={8} mb={4} style={sectionLabelStyle}>
            Sesiones
          </Text>
          <div className="flex flex-col gap-0.5 mb-2">
            {sessions.map(t => (
              <TabRow key={t.id} tab={t} isActive={activeTabId === t.id} onTabClick={onTabClick} onCloseTab={onCloseTab} />
            ))}
            <UnstyledButton
              data-no-window-drag
              onClick={onNewSession}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md mt-0.5"
              style={{ color: 'var(--text-muted)' }}
            >
              <span className="text-sm leading-none">+</span>
              <Text size="xs" style={{ fontSize: '12px' }}>
                Nueva conexión
              </Text>
            </UnstyledButton>
          </div>
        </>
      )}

      {localTerminals.length > 0 && (
        <>
          <Text size="xs" fw={600} px={8} mb={4} style={sectionLabelStyle}>
            Terminal local
          </Text>
          <div className="flex flex-col gap-0.5">
            {localTerminals.map(t => (
              <TabRow key={t.id} tab={t} isActive={activeTabId === t.id} onTabClick={onTabClick} onCloseTab={onCloseTab} />
            ))}
            <UnstyledButton
              data-no-window-drag
              onClick={onNewLocalTerminal}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md mt-0.5"
              style={{ color: 'var(--text-muted)' }}
            >
              <span className="text-sm leading-none">+</span>
              <Text size="xs" style={{ fontSize: '12px' }}>
                Nueva terminal local
              </Text>
            </UnstyledButton>
          </div>
        </>
      )}
    </div>
  );
};

export default SidebarSessions;
