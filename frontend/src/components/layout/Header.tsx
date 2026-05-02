import React from 'react';
import { ActionIcon, Tooltip, UnstyledButton } from '@mantine/core';
import type { ActiveView } from '../../hooks/useAppTabs';

// SVG icons for panel tabs (H1)
const PANEL_ICONS: Record<string, React.ReactNode> = {
  terminal: (
    <svg viewBox="0 0 12 12" fill="none" width="20" height="20"><rect x=".5" y="1.5" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M3 5l2 1.5L3 8M7 8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
  sftp: (
    <svg viewBox="0 0 12 12" fill="none" width="20" height="20"><path d="M2 10.5V4l2-2h5l1.5 1.5V10.5a1 1 0 01-1 1H3a1 1 0 01-1-1z" stroke="currentColor" strokeWidth="1.2"/><path d="M4 2v2.5H2" stroke="currentColor" strokeWidth="1.2"/><path d="M7 5v4M5.5 7.5L7 9l1.5-1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
  logs: (
    <svg viewBox="0 0 12 12" fill="none" width="20" height="20"><path d="M2 4h8M2 6.5h5M2 9h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
  ),
  pines: (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
      <rect x="6" y="3" width="8" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M2 6h4M2 9h4M2 12h4M2 15h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M14 6h4M14 9h4M14 12h4M14 15h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <circle cx="10" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.1"/>
    </svg>
  ),
  domotica: (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
      <path d="M3 9.5L10 4l7 5.5V16a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <circle cx="10" cy="11.5" r="1.4" fill="currentColor"/>
      <path d="M10 13v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  camara: (
    <svg viewBox="0 0 12 12" fill="none" width="20" height="20"><rect x="1" y="2.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.1"/><path d="M8 5l3-1.5v5L8 7V5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/></svg>
  ),
  escritorio: (
    <svg viewBox="0 0 12 12" fill="none" width="20" height="20"><rect x=".5" y="1" width="11" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M3.5 10.5h5M6 8.5v2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
  ),
  snippets: (
    <svg viewBox="0 0 12 12" fill="none" width="20" height="20"><polyline points="8 9 11 6 8 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><polyline points="4 3 1 6 4 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
  themes: (
    <svg viewBox="0 0 12 12" fill="none" width="20" height="20"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="5" cy="4.5" r=".6" fill="currentColor"/><circle cx="7.5" cy="5.5" r=".6" fill="currentColor"/><circle cx="4.5" cy="6.5" r=".6" fill="currentColor"/></svg>
  ),
  hosts: (
    <svg viewBox="0 0 12 12" fill="none" width="20" height="20"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2"/><polygon points="8.5 4 7 7 4 8.5 5 5 8.5 4" stroke="currentColor" strokeWidth="1" fill="none"/></svg>
  ),
  connect: (
    <svg viewBox="0 0 12 12" fill="none" width="20" height="20"><rect x=".5" y="1.5" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M3 5l2 1.5L3 8M7 8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
  landing: (
    <svg viewBox="0 0 12 12" fill="none" width="20" height="20"><path d="M1.5 4.5L6 1l4.5 3.5v6a1 1 0 01-1 1H2.5a1 1 0 01-1-1z" stroke="currentColor" strokeWidth="1.2"/><path d="M4.5 10.5v-4h3v4" stroke="currentColor" strokeWidth="1.1"/></svg>
  ),
};

const CloseIcon = () => (
  <svg viewBox="0 0 7 7" fill="none"><path d="M1 1l5 5M6 1L1 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
);

const PANEL_LABELS: Record<string, string> = {
  landing: 'Inicio',
  terminal: 'Terminal',
  sftp: 'SFTP',
  hosts: 'Hosts',
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
    <header className="fixed top-0 left-0 right-0 z-[2000] flex flex-col" role="banner" onMouseLeave={handleMouseLeave}>
      {/* ═══ H1: Panel Tabs ═══ */}
      <div className="flex items-stretch bg-secondary border-b border-subtle h-[34px] shrink-0 w-full pl-[50px] transition-[padding-left] duration-300" style={{ paddingLeft: isSidebarExpanded ? '160px' : '50px' }}>
        {openPanels.map(panelId => {
          const isActive = activePanel === panelId;
          const isDragOver = dragOver === panelId && dragRef.current !== `panel:${panelId}`;
          return (
            <div
              key={panelId}
              className={`
                group flex items-center gap-1.5 px-3.5 text-xs cursor-pointer border-r border-subtle border-b-2 select-none whitespace-nowrap shrink-0 transition-all duration-150
                ${isActive 
                  ? 'text-primary bg-[var(--interactive-selected)] border-b-transparent' 
                  : 'text-secondary border-b-transparent hover:text-primary hover:bg-tertiary/80'}
                ${isDragOver ? 'border-l-2 border-l-accent bg-accent/10' : ''}
              `}
              onClick={() => onPanelClick(panelId)}
              onMouseDown={(e) => handleMouseDown(e, panelId, 'panel')}
              onMouseEnter={() => handleMouseEnter(panelId)}
              onMouseUp={(e) => handleMouseUp(e, panelId, 'panel')}
            >
              <span className="flex items-center shrink-0 w-3.5 h-3.5 text-current pointer-events-none">
                {PANEL_ICONS[panelId] || null}
              </span>
              <span className="capitalize pointer-events-none">{PANEL_LABELS[panelId] || panelId}</span>
              {panelId !== 'landing' && (
                <button 
                  className={`
                    w-[13px] h-[13px] rounded-[3px] flex items-center justify-center ml-[3px] transition-all
                    ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                    hover:bg-border-subtle
                  `}
                  onMouseDown={(e) => e.stopPropagation()} 
                  onClick={(e) => { e.stopPropagation(); onPanelClose(panelId); }}
                >
                  <CloseIcon />
                </button>
              )}
            </div>
          );
        })}
        <div className="flex-1" />
      </div>

      {/* ═══ H2: Session Bar ═══ */}
      <div 
        className={`flex items-stretch bg-primary/85 backdrop-blur-sm border-b border-subtle h-[38px] shrink-0 transition-[padding-left] duration-300 ${activePanel === 'terminal' ? '' : 'hidden'}`}
        style={{ paddingLeft: isSidebarExpanded ? '160px' : '50px' }}
      >
        <div className="flex items-stretch flex-1 overflow-x-auto scrollbar-thin scrollbar-thumb-border-subtle hover:scrollbar-thumb-secondary scrollbar-track-transparent" ref={sessionsRef}>
          {tabs.filter(t => t.type === 'session').map(t => {
            const isActive = activeTabId === t.id;
            const isDragOver = dragOver === t.id && dragRef.current !== `tab:${t.id}`;
            return (
              <div
                key={t.id}
                className={`
                  group flex items-center gap-1.5 px-3 text-xs cursor-pointer border-r border-subtle border-b-2 select-none whitespace-nowrap shrink-0 relative transition-all duration-150
                  ${isActive 
                    ? 'bg-[var(--interactive-selected)] text-primary border-b-transparent' 
                    : 'bg-transparent text-secondary border-b-transparent hover:bg-secondary hover:text-primary'}
                  ${isDragOver ? 'border-l-2 border-l-accent bg-accent/10' : ''}
                `}
                onClick={() => onTabClick(t.id)}
                onMouseDown={(e) => handleMouseDown(e, t.id, 'tab')}
                onMouseEnter={() => handleMouseEnter(t.id)}
                onMouseUp={(e) => handleMouseUp(e, t.id, 'tab')}
              >
                <div className="w-[18px] h-[14px] rounded-sm flex items-center justify-center text-[8px] font-bold shrink-0 tracking-tighter bg-accent/20 text-accent pointer-events-none">SSH</div>
                <div className={`w-[7px] h-[7px] rounded-full shrink-0 pointer-events-none ${isActive ? 'bg-[#4ade80]' : 'bg-secondary opacity-50'}`} />
                <span className="text-xs overflow-hidden text-ellipsis max-w-[140px] pointer-events-none">{t.label}</span>
                <button 
                  className={`
                    w-4 h-4 rounded-[3px] flex items-center justify-center ml-0.5 shrink-0 transition-all
                    ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                    hover:bg-border-subtle
                  `}
                  onMouseDown={(e) => e.stopPropagation()} 
                  onClick={(e) => { e.stopPropagation(); onCloseTab(t.id); }}
                >
                  <svg viewBox="0 0 8 8" fill="none" className="w-2 h-2"><path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                </button>
              </div>
            );
          })}
          <UnstyledButton 
            className="flex items-center justify-center w-[30px] text-secondary hover:text-primary hover:bg-secondary transition-colors"
            onClick={onNewSession}
          >
            <svg viewBox="0 0 13 13" fill="none" className="w-3 h-3"><path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
          </UnstyledButton>
        </div>

        {showViewToggle && (
          <div className="flex items-center gap-0.5 px-2.5 border-l border-subtle shrink-0">
            <ActionIcon
              variant={activeView === 'escritorio' ? 'light' : 'subtle'}
              color={activeView === 'escritorio' ? 'teal' : 'gray'}
              size="lg"
              radius="md"
              onClick={() => onViewChange(activeView === 'terminal' ? 'escritorio' : 'terminal')}
              title={activeView === 'escritorio' ? 'Volver a terminal' : 'Abrir escritorio remoto'}
            >
              <div className="w-5 h-5">{activeView === 'escritorio' ? PANEL_ICONS['terminal'] : PANEL_ICONS['escritorio']}</div>
            </ActionIcon>
            
            <ActionIcon
              variant={isChatOpen ? 'light' : 'subtle'}
              color={isChatOpen ? 'teal' : 'gray'}
              size="lg"
              radius="md"
              onClick={onToggleChat}
              title="Chat de IA"
            >
              <svg className="w-5 h-5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 10.5a1.5 1.5 0 0 1-1.5 1.5H5L2 15V3a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 14 3z"/>
              </svg>
            </ActionIcon>

            <div className="w-[1px] h-3.5 bg-border-subtle mx-1 shrink-0" />

            <ActionIcon
              variant={isCameraActive ? 'light' : 'subtle'}
              color={isCameraActive ? 'teal' : 'gray'}
              size="lg"
              radius="md"
              onClick={onToggleCamera}
              title="Cámara"
            >
              <div className="w-5 h-5">{PANEL_ICONS['camara']}</div>
            </ActionIcon>
            <ActionIcon
              variant={isPinsActive ? 'light' : 'subtle'}
              color={isPinsActive ? 'teal' : 'gray'}
              size="lg"
              radius="md"
              onClick={onTogglePins}
              title="GPIO / Pines"
            >
              <div className="w-5 h-5">{PANEL_ICONS['pines']}</div>
            </ActionIcon>
            <ActionIcon
              variant={isDomoticaActive ? 'light' : 'subtle'}
              color={isDomoticaActive ? 'teal' : 'gray'}
              size="lg"
              radius="md"
              onClick={onToggleDomotica}
              title="Domótica (Arduino)"
            >
              <div className="w-5 h-5">{PANEL_ICONS['domotica']}</div>
            </ActionIcon>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
