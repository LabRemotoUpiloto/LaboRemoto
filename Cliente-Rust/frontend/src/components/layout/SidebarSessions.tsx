import React, { useEffect, useRef, useState } from 'react';
import { ActionIcon, Menu, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { Monitor, Pencil, SquareTerminal } from 'lucide-react';
import type { Tab } from '../../hooks/useAppTabs';
import { CloseIcon } from './header/HeaderConstants';

type Props = {
  tabs: Tab[];
  activeTabId: string;
  onTabClick: (id: string) => void;
  onCloseTab: (id: string) => void;
  onRenameTab: (id: string, label: string) => void;
  /** Rail de íconos: muestra cada sesión como un ícono con tooltip. */
  collapsed?: boolean;
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
  onRenameTab: (id: string, label: string) => void;
}> = ({ tab, isActive, onTabClick, onCloseTab, onRenameTab }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(tab.label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const startEditing = (e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    setDraft(tab.label);
    setIsEditing(true);
  };

  const commit = () => {
    setIsEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== tab.label) onRenameTab(tab.id, trimmed);
  };

  const cancel = () => {
    setIsEditing(false);
    setDraft(tab.label);
  };

  return (
    <div
      className="group flex items-center gap-1 rounded-md transition-colors"
      style={{ backgroundColor: isActive ? 'var(--accent-primary-subtle)' : 'transparent' }}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          data-no-window-drag
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          }}
          className="flex-1 min-w-0 mx-2 my-1 px-1.5 py-0.5 rounded outline-none"
          style={{
            fontSize: '12px',
            color: 'var(--text-primary)',
            backgroundColor: 'var(--background-primary)',
            border: '1px solid var(--accent-primary)',
          }}
        />
      ) : (
        <UnstyledButton
          data-no-window-drag
          onClick={() => onTabClick(tab.id)}
          onDoubleClick={startEditing}
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
      )}
      {!isEditing && (
        <>
          <ActionIcon
            data-no-window-drag
            variant="subtle"
            color="gray"
            size="xs"
            className="opacity-0 group-hover:opacity-100 shrink-0"
            onClick={startEditing}
            title="Renombrar"
          >
            <Pencil size={10} />
          </ActionIcon>
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
        </>
      )}
    </div>
  );
};

/** Botón de grupo para el rail colapsado: un solo ícono por tipo (sesiones
 *  SSH / terminales locales). Con un único tab abre esa sesión directo; con
 *  varios, despliega un menú para elegir cuál — así no se apilan N íconos
 *  por cada sesión abierta. */
const GroupButton: React.FC<{
  icon: React.ElementType;
  activeTab?: Tab;
  isGroupActive: boolean;
  tabsInGroup: Tab[];
  onTabClick: (id: string) => void;
}> = ({ icon: Icon, activeTab, isGroupActive, tabsInGroup, onTabClick }) => {
  const single = tabsInGroup.length === 1;
  const label = activeTab ? activeTab.label : tabsInGroup[0]?.label ?? '';

  const button = (
    <UnstyledButton
      data-no-window-drag
      onClick={single ? () => onTabClick(tabsInGroup[0].id) : undefined}
      aria-label={label}
      className="relative flex items-center justify-center transition-colors"
      style={{
        height: '34px',
        width: 'calc(100% - 12px)',
        margin: '1px 6px',
        borderRadius: '6px',
        color: isGroupActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
        backgroundColor: isGroupActive ? 'var(--accent-primary-subtle)' : 'transparent',
      }}
      onMouseEnter={e => { if (!isGroupActive) { e.currentTarget.style.backgroundColor = 'var(--interactive-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
      onMouseLeave={e => { if (!isGroupActive) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; } }}
    >
      {isGroupActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-[3px]" style={{ height: '16px', backgroundColor: 'var(--accent-primary)' }} />
      )}
      <Icon size={15} />
    </UnstyledButton>
  );

  if (single) {
    return (
      <Tooltip label={label} position="right" withArrow openDelay={200}>
        {button}
      </Tooltip>
    );
  }

  // Sin Tooltip envolviendo el Menu.Target: Mantine no reenvía el onClick
  // que el Menu inyecta a través del Tooltip, así que el click no abría
  // nada. El propio dropdown ya comunica cuántas sesiones hay.
  return (
    <Menu shadow="md" width={200} position="right-start" withinPortal offset={8}>
      <Menu.Target>
        {button}
      </Menu.Target>
      <Menu.Dropdown>
        {tabsInGroup.map(t => {
          const isTabActive = t.id === activeTab?.id;
          return (
            <Menu.Item
              key={t.id}
              fw={isTabActive ? 600 : 400}
              c={isTabActive ? 'var(--accent-primary)' : undefined}
              bg={isTabActive ? 'var(--accent-primary-subtle)' : undefined}
              rightSection={isTabActive ? (
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--accent-primary)', display: 'inline-block' }} />
              ) : undefined}
              onClick={() => onTabClick(t.id)}
            >
              {t.label}
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
};

/** Sesiones SSH y terminales locales activas en el sidebar (sin barra superior). */
const SidebarSessions: React.FC<Props> = ({
  tabs,
  activeTabId,
  onTabClick,
  onCloseTab,
  onRenameTab,
  collapsed = false,
}) => {
  const sessions = tabs.filter(t => t.type === 'session');
  const localTerminals = tabs.filter(t => t.type === 'local-terminal');

  if (sessions.length === 0 && localTerminals.length === 0) return null;

  // ── Rail colapsado: un ícono por grupo (sesiones / terminales locales),
  //    con menú desplegable si hay más de una — no un ícono por sesión. ──
  if (collapsed) {
    const activeSession = sessions.find(t => t.id === activeTabId);
    const activeLocalTerm = localTerminals.find(t => t.id === activeTabId);
    return (
      <div className="pb-2 mb-1 border-b flex flex-col" style={{ borderColor: 'var(--border-subtle)' }}>
        {sessions.length > 0 && (
          <GroupButton
            icon={Monitor}
            activeTab={activeSession}
            isGroupActive={!!activeSession}
            tabsInGroup={sessions}
            onTabClick={onTabClick}
          />
        )}
        {localTerminals.length > 0 && (
          <GroupButton
            icon={SquareTerminal}
            activeTab={activeLocalTerm}
            isGroupActive={!!activeLocalTerm}
            tabsInGroup={localTerminals}
            onTabClick={onTabClick}
          />
        )}
      </div>
    );
  }

  return (
    <div className="px-2 pb-2 mb-1 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
      {sessions.length > 0 && (
        <>
          <Text size="xs" fw={600} px={8} mb={4} style={sectionLabelStyle}>
            Sesiones
          </Text>
          <div className="flex flex-col gap-0.5 mb-2">
            {sessions.map(t => (
              <TabRow key={t.id} tab={t} isActive={activeTabId === t.id} onTabClick={onTabClick} onCloseTab={onCloseTab} onRenameTab={onRenameTab} />
            ))}
          </div>
        </>
      )}

      {localTerminals.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {localTerminals.map(t => (
            <TabRow key={t.id} tab={t} isActive={activeTabId === t.id} onTabClick={onTabClick} onCloseTab={onCloseTab} onRenameTab={onRenameTab} />
          ))}
        </div>
      )}
    </div>
  );
};

export default SidebarSessions;
