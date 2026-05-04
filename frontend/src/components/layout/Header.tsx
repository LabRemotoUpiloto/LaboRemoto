import React from 'react';
import { ActionIcon, Tooltip, UnstyledButton, Group, Text, Box, Tabs, Avatar, Menu, rem } from '@mantine/core';
import { gsap } from 'gsap';
import type { ActiveView } from '../../hooks/useAppTabs';

// SVG icons for panel tabs (H1)
const PANEL_ICONS: Record<string, React.ReactNode> = {
  terminal: (
    <svg viewBox="0 0 12 12" fill="none" width="20" height="20"><rect x=".5" y="1.5" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" /><path d="M3 5l2 1.5L3 8M7 8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  sftp: (
    <svg viewBox="0 0 12 12" fill="none" width="20" height="20"><path d="M2 10.5V4l2-2h5l1.5 1.5V10.5a1 1 0 01-1 1H3a1 1 0 01-1-1z" stroke="currentColor" strokeWidth="1.2" /><path d="M4 2v2.5H2" stroke="currentColor" strokeWidth="1.2" /><path d="M7 5v4M5.5 7.5L7 9l1.5-1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  logs: (
    <svg viewBox="0 0 12 12" fill="none" width="20" height="20"><path d="M2 4h8M2 6.5h5M2 9h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
  ),
  pines: (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
      <rect x="6" y="3" width="8" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 6h4M2 9h4M2 12h4M2 15h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M14 6h4M14 9h4M14 12h4M14 15h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="10" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  ),
  domotica: (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
      <path d="M3 9.5L10 4l7 5.5V16a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="10" cy="11.5" r="1.4" fill="currentColor" />
      <path d="M10 13v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  camara: (
    <svg viewBox="0 0 12 12" fill="none" width="20" height="20"><rect x="1" y="2.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.1" /><path d="M8 5l3-1.5v5L8 7V5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" /></svg>
  ),
  escritorio: (
    <svg viewBox="0 0 12 12" fill="none" width="20" height="20"><rect x=".5" y="1" width="11" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.2" /><path d="M3.5 10.5h5M6 8.5v2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" /></svg>
  ),
  snippets: (
    <svg viewBox="0 0 12 12" fill="none" width="20" height="20"><polyline points="8 9 11 6 8 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /><polyline points="4 3 1 6 4 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  themes: (
    <svg viewBox="0 0 12 12" fill="none" width="20" height="20"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" /><circle cx="5" cy="4.5" r=".6" fill="currentColor" /><circle cx="7.5" cy="5.5" r=".6" fill="currentColor" /><circle cx="4.5" cy="6.5" r=".6" fill="currentColor" /></svg>
  ),
  hosts: (
    <svg viewBox="0 0 12 12" fill="none" width="20" height="20"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" /><polygon points="8.5 4 7 7 4 8.5 5 5 8.5 4" stroke="currentColor" strokeWidth="1" fill="none" /></svg>
  ),
  connect: (
    <svg viewBox="0 0 12 12" fill="none" width="20" height="20"><rect x=".5" y="1.5" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" /><path d="M3 5l2 1.5L3 8M7 8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ),
  practices: (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
      <path d="M7.5 2.5v6L5 14a1 1 0 0 0 .9 1.5h8.2a1 1 0 0 0 .9-1.5L12.5 8.5v-6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7.5 2.5h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M5.5 11h9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <circle cx="9" cy="13" r=".75" fill="currentColor"/>
      <circle cx="12" cy="14.2" r=".75" fill="currentColor"/>
    </svg>
  ),
  landing: (
    <svg viewBox="0 0 12 12" fill="none" width="20" height="20"><path d="M1.5 4.5L6 1l4.5 3.5v6a1 1 0 01-1 1H2.5a1 1 0 01-1-1z" stroke="currentColor" strokeWidth="1.2" /><path d="M4.5 10.5v-4h3v4" stroke="currentColor" strokeWidth="1.1" /></svg>
  ),
};

const CloseIcon = () => (
  <svg viewBox="0 0 7 7" fill="none"><path d="M1 1l5 5M6 1L1 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
);

const PANEL_LABELS: Record<string, string> = {
  landing: 'Inicio',
  terminal: 'Terminal',
  sftp: 'SFTP',
  hosts: 'Hosts',
  practices: 'Prácticas',
  connect: 'Connect',
  logs: 'Logs',
  themes: 'Temas',
  snippets: 'Snippets',
  pines: 'Pines',
  camara: 'Cámara',
  escritorio: 'Escritorio'
};

type Tab = { id: string; type: 'home' | 'session' | 'log'; label: string };

interface HeaderProps {
  openPanels: string[];
  activePanel: string;
  onPanelClick: (panelId: string) => void;
  onPanelClose: (panelId: string) => void;
  tabs: Tab[];
  activeTabId: string;
  onTabClick: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewSession: () => void;
  onReorderTabs: (dragID: string, dropID: string) => void;
  onReorderPanels: (dragID: string, dropID: string) => void;
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  showViewToggle?: boolean;
  isChatOpen: boolean;
  onToggleChat: () => void;
  onToggleCamera?: () => void;
  onTogglePins?: () => void;
  onToggleDomotica?: () => void;
  isCameraActive?: boolean;
  isPinsActive?: boolean;
  isDomoticaActive?: boolean;
  isSidebarExpanded?: boolean;
}

const Header: React.FC<HeaderProps> = ({
  openPanels,
  activePanel,
  onPanelClick,
  onPanelClose,
  tabs,
  activeTabId,
  onTabClick,
  onCloseTab,
  onNewSession,
  activeView,
  onViewChange,
  showViewToggle = false,
  isChatOpen,
  onToggleChat,
  onReorderTabs,
  onReorderPanels,
  onToggleCamera,
  onTogglePins,
  onToggleDomotica,
  isCameraActive = false,
  isPinsActive = false,
  isDomoticaActive = false,
  isSidebarExpanded = false,
}) => {
  const dragRef = React.useRef<string | null>(null);
  const [dragOver, setDragOver] = React.useState<string | null>(null);
  const sessionsRef = React.useRef<HTMLDivElement | null>(null);
  const panelsRef = React.useRef<HTMLDivElement | null>(null);

  const animateClose = (e: React.MouseEvent, callback: () => void) => {
    e.stopPropagation();
    const tabEl = (e.currentTarget as HTMLElement).closest('[role="tab"]');
    if (tabEl) {
      gsap.to(tabEl, {
        scale: 0.85,
        opacity: 0,
        x: -20,
        duration: 0.35,
        ease: "power3.inOut",
        onComplete: callback
      });
    } else {
      callback();
    }
  };

  // Scroll horizontal con rueda del ratón
  React.useEffect(() => {
    const el = sessionsRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Animación de entrada para nuevas pestañas
  React.useLayoutEffect(() => {
    const panels = panelsRef.current?.querySelectorAll('[role="tab"]');
    if (panels && panels.length > 0) {
      const lastPanel = panels[panels.length - 1];
      // Solo animamos si se acaba de añadir (basado en el length)
      gsap.fromTo(lastPanel, 
        { scale: 0.8, opacity: 0, y: 8 },
        { scale: 1, opacity: 1, y: 0, duration: 0.4, ease: "back.out(1.7)" }
      );
    }
  }, [openPanels.length]);

  React.useLayoutEffect(() => {
    const sessions = sessionsRef.current?.querySelectorAll('[role="tab"]');
    if (sessions && sessions.length > 0) {
      const lastSession = sessions[sessions.length - 1];
      gsap.fromTo(lastSession,
        { scale: 0.8, opacity: 0, x: 15 },
        { scale: 1, opacity: 1, x: 0, duration: 0.4, ease: "back.out(1.5)" }
      );
    }
  }, [tabs.length]);

  const handleMouseDown = (e: React.MouseEvent, id: string, type: 'panel' | 'tab') => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragRef.current = `${type}:${id}`;
  };

  const handleMouseEnter = (id: string) => {
    if (dragRef.current) setDragOver(id);
  };

  const handleMouseUp = (e: React.MouseEvent, dropId: string, type: 'panel' | 'tab') => {
    if (!dragRef.current) return;
    const [dragType, dragId] = dragRef.current.split(':');
    if (dragId && dragId !== dropId && dragType === type) {
      if (type === 'panel') onReorderPanels(dragId, dropId);
      if (type === 'tab') onReorderTabs(dragId, dropId);
    }
    dragRef.current = null;
    setDragOver(null);
  };

  const handleMouseLeave = () => {
    dragRef.current = null;
    setDragOver(null);
  };

  return (
    <header
      className="fixed top-0 right-0 z-[2000] flex items-center bg-secondary border-b border-subtle transition-[left] duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
      style={{ left: 'var(--sidebar-width)', height: '44px' }}
      role="banner"
      onMouseLeave={handleMouseLeave}
    >
      <Group h={44} px={0} justify="space-between" className="w-full" wrap="nowrap" gap="xs">
        {/* Unified Navigation Area */}
        <div className="flex-1 flex items-center overflow-hidden h-full">
          {/* Panel Tabs */}
          <div ref={panelsRef} className="h-full">
            <Tabs
            value={activePanel}
            onChange={(val) => val && onPanelClick(val)}
            variant="outline"
            classNames={{
              root: '!border-0',
              tabsList: '!border-0 !border-b-0',
            }}
            styles={{
              root: { border: 0, borderBottom: 0, height: '100%' },
              tabsList: { border: 0, borderBottom: 0, height: '100%', paddingLeft: rem(12), flexWrap: 'nowrap' },
              tab: {
                height: rem(44),
                fontSize: rem(12),
                padding: `0 ${rem(16)}`,
                border: 0,
                borderBottom: '2px solid transparent',
                borderRadius: 0,
                transition: 'all 0.2s ease',
                '&[data-active]': {
                  borderBottomColor: 'var(--accent-primary)',
                  backgroundColor: 'var(--interactive-selected)',
                  color: 'var(--accent-primary)',
                },
                '&:hover': {
                  backgroundColor: 'var(--interactive-hover)',
                  borderBottomColor: 'var(--border-subtle)',
                },
                '&.tab-closing': {
                   pointerEvents: 'none',
                   opacity: 0,
                   transform: 'scale(0.9) translateX(-10px)',
                   transition: 'all 0.3s ease'
                }
              }
            }}
          >
            <Tabs.List>
              {openPanels.map(panelId => {
                const isDragOver = dragOver === panelId && dragRef.current !== `panel:${panelId}`;
                return (
                  <Tabs.Tab
                    key={panelId}
                    value={panelId}
                    leftSection={
                      <span className="flex items-center shrink-0 w-3.5 h-3.5 text-current">
                        {PANEL_ICONS[panelId] || null}
                      </span>
                    }
                    rightSection={
                      panelId !== 'landing' && (
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          size="xs"
                          onClick={(e) => animateClose(e, () => onPanelClose(panelId))}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <CloseIcon />
                        </ActionIcon>
                      )
                    }
                    style={panelId === activePanel ? {
                      borderBottom: '2px solid var(--accent-primary)',
                      backgroundColor: 'var(--interactive-selected)',
                      color: 'var(--accent-primary)',
                    } : { borderBottom: '2px solid transparent' }}
                    className={`group capitalize ${isDragOver ? 'border-l-2 border-l-accent bg-accent/10' : ''}`}
                    onMouseDown={(e) => handleMouseDown(e, panelId, 'panel')}
                    onMouseEnter={() => handleMouseEnter(panelId)}
                    onMouseUp={(e) => handleMouseUp(e, panelId, 'panel')}
                  >
                    <span className="hidden sm:inline">{PANEL_LABELS[panelId] || panelId}</span>
                  </Tabs.Tab>
                );
              })}
            </Tabs.List>
          </Tabs>
        </div>

          {/* Terminal Session Tabs - Always visible if sessions exist */}
          {(tabs.some(t => t.type === 'session') || activePanel === 'terminal') && (
            <div className="flex items-center h-full px-2 gap-2 border-l border-subtle ml-2 bg-primary/30">
              <div className="flex items-center overflow-x-auto scrollbar-none" ref={sessionsRef}>
                <Tabs
                  value={activeTabId}
                  onChange={(val) => val && onTabClick(val)}
                  variant="pills"
                  styles={{
                    root: { height: '100%' },
                    tabsList: { height: '100%', gap: rem(6), padding: `0 ${rem(4)}`, border: 0, flexWrap: 'nowrap' },
                    tab: {
                      height: rem(28),
                      alignSelf: 'center',
                      fontSize: rem(11),
                      padding: `0 ${rem(12)}`,
                      borderRadius: rem(6),
                      border: '1px solid transparent',
                      '&[data-active]': {
                        backgroundColor: 'var(--interactive-selected)',
                        borderColor: 'var(--accent-primary)',
                        color: 'var(--accent-primary)',
                      },
                      '&.tab-closing': {
                        pointerEvents: 'none',
                        opacity: 0,
                        transform: 'scale(0.8) translateX(-5px)',
                        transition: 'all 0.3s ease'
                      }
                    }
                  }}
                >
                  <Tabs.List>
                    {tabs.filter(t => t.type === 'session').map(t => {
                      const isActive = activeTabId === t.id;
                      const isDragOver = dragOver === t.id && dragRef.current !== `tab:${t.id}`;
                      return (
                        <Tabs.Tab
                          key={t.id}
                          value={t.id}
                          leftSection={
                            <div className={`w-[6px] h-[6px] rounded-full shrink-0 ${isActive ? 'bg-[#4ade80]' : 'bg-secondary opacity-50'}`} />
                          }
                          rightSection={
                            <ActionIcon
                              variant="subtle"
                              color="gray"
                              size={14}
                              onClick={(e) => animateClose(e, () => onCloseTab(t.id))}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <CloseIcon />
                            </ActionIcon>
                          }
                          style={isActive ? {
                            backgroundColor: 'var(--interactive-selected)',
                            border: '1px solid var(--accent-primary)',
                            color: 'var(--accent-primary)',
                          } : {}}
                          className={`group ${isDragOver ? 'border-l-2 border-l-accent bg-accent/10' : ''}`}
                          onMouseDown={(e) => handleMouseDown(e, t.id, 'tab')}
                          onMouseEnter={() => handleMouseEnter(t.id)}
                          onMouseUp={(e) => handleMouseUp(e, t.id, 'tab')}
                        >
                          {t.label}
                        </Tabs.Tab>
                      );
                    })}
                  </Tabs.List>
                </Tabs>
                <UnstyledButton
                  className="flex items-center justify-center w-[24px] h-[24px] rounded-md text-secondary hover:text-primary hover:bg-secondary transition-colors shrink-0"
                  onClick={onNewSession}
                >
                  <svg viewBox="0 0 13 13" fill="none" className="w-3 h-3"><path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
                </UnstyledButton>
              </div>
            </div>
          )}
        </div>

        {/* Actions & User */}
        <Group gap={4} wrap="nowrap" shrink={0} pr="md">
          {showViewToggle && (
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
          )}

          <div className="w-[1px] h-4 bg-border-subtle mx-1" />

          <Menu shadow="md" width={200} position="bottom-end">
            <Menu.Target>
              <Tooltip label="Pendiente de implementar" withArrow position="bottom-end">
                <UnstyledButton className="hover:bg-secondary/50 p-1 rounded-md transition-colors">
                  <Group gap={6} wrap="nowrap">
                    <Avatar
                      size={24}
                      radius="xl"
                      color="blue"
                    >
                      AI
                    </Avatar>
                    <div className="hidden xl:block">
                      <Text size="xs" fw={500} c="dimmed">
                        Invitado
                      </Text>
                    </div>
                  </Group>
                </UnstyledButton>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Usuario</Menu.Label>
              <Menu.Item disabled>Perfil (Próximamente)</Menu.Item>
              <Menu.Item disabled>Ajustes (Próximamente)</Menu.Item>
              <Menu.Divider />
              <Menu.Item color="red" disabled>Cerrar Sesión</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
    </header>
  );
};

export default Header;
