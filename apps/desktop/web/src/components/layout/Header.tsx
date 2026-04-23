import React from 'react';
import './Header.css';
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

type Tab = { id: string; type: 'home' | 'session' | 'log'; label: string }

interface HeaderProps {
  // H1 - Panel tabs
  openPanels: string[];
  activePanel: string;
  onPanelClick: (panelId: string) => void;
  onPanelClose: (panelId: string) => void;
  // H2 - Session tabs
  tabs: Tab[];
  activeTabId: string;
  onTabClick: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewSession: () => void;
  onReorderTabs: (dragID: string, dropID: string) => void;
  onReorderPanels: (dragID: string, dropID: string) => void;
  // View toggle
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  showViewToggle?: boolean;
  // Chat toggle
  isChatOpen: boolean;
  onToggleChat: () => void;
  // Camera & Pins toggle
  onToggleCamera?: () => void;
  onTogglePins?: () => void;
  onToggleDomotica?: () => void;
  isCameraActive?: boolean;
  isPinsActive?: boolean;
  isDomoticaActive?: boolean;
  // Sidebar state for positioning
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

  // Scroll horizontal con rueda del ratón (Shift+wheel o wheel directo)
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
    if ((e.target as HTMLElement).closest('.h1-tab-close, .h2-tab-close')) return;
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

  // Limpiar estilos inline de GSAP que pudieran persistir
  const headerRef = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    const el = headerRef.current;
    if (el) {
      el.style.marginLeft = '';
      el.style.paddingLeft = '';
      el.style.left = '';
    }
  }, []);

  return (
    <header ref={headerRef} className="dual-header" role="banner" onMouseLeave={handleMouseLeave}>
      {/* ═══ H1: Panel Tabs ═══ */}
      <div className="h1">
        {openPanels.map(panelId => (
          <div
            key={panelId}
            className={`h1-tab ${activePanel === panelId ? 'active' : ''} ${dragOver === panelId && dragRef.current !== `panel:${panelId}` ? 'drag-over' : ''}`}
            onClick={() => onPanelClick(panelId)}
            onMouseDown={(e) => handleMouseDown(e, panelId, 'panel')}
            onMouseEnter={() => handleMouseEnter(panelId)}
            onMouseUp={(e) => handleMouseUp(e, panelId, 'panel')}
          >
            <span className="h1-tab-icon">{PANEL_ICONS[panelId] || null}</span>
            <span className="h1-tab-label">{PANEL_LABELS[panelId] || panelId}</span>
            {panelId !== 'landing' && (
              <div 
                className="h1-tab-close" 
                onMouseDown={(e) => e.stopPropagation()} 
                onClick={(e) => { e.stopPropagation(); onPanelClose(panelId); }}
              >
                <CloseIcon />
              </div>
            )}
          </div>
        ))}
        <div className="h1-empty" />
      </div>

      {/* ═══ H2: Session Bar ═══ */}
      <div className={`h2 ${activePanel === 'terminal' ? '' : 'hidden'}`}>
        <div className="h2-sessions" ref={sessionsRef}>
          {tabs.filter(t => t.type === 'session').map(t => (
              <div
                key={t.id}
                className={`h2-tab ${activeTabId === t.id ? 'active' : ''} ${dragOver === t.id && dragRef.current !== `tab:${t.id}` ? 'drag-over' : ''}`}
                onClick={() => onTabClick(t.id)}
                onMouseDown={(e) => handleMouseDown(e, t.id, 'tab')}
                onMouseEnter={() => handleMouseEnter(t.id)}
                onMouseUp={(e) => handleMouseUp(e, t.id, 'tab')}
              >
                <div className="h2-tab-ico">SSH</div>
                <div className={`h2-dot ${activeTabId === t.id ? 'on' : 'off'}`} />
                <span className="h2-tab-label">{t.label}</span>
                <div 
                  className="h2-tab-close" 
                  onMouseDown={(e) => e.stopPropagation()} 
                  onClick={(e) => { e.stopPropagation(); onCloseTab(t.id); }}
                >
                  <svg viewBox="0 0 8 8" fill="none"><path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                </div>
              </div>
            ))}
            <div className="h2-new" onClick={onNewSession}>
              <svg viewBox="0 0 13 13" fill="none"><path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            </div>
          </div>
          {showViewToggle && (
            <div className="h2-actions">
              <button
                className={`h2-btn ${activeView === 'escritorio' ? 'active-btn' : ''}`}
                onClick={() => onViewChange(activeView === 'terminal' ? 'escritorio' : 'terminal')}
                title={activeView === 'escritorio' ? 'Volver a terminal' : 'Abrir escritorio remoto'}
              >
                {activeView === 'escritorio' ? PANEL_ICONS['terminal'] : PANEL_ICONS['escritorio']}
              </button>
              <button
                className={`h2-btn ${isChatOpen ? 'active-btn' : ''}`}
                onClick={onToggleChat}
                title="Chat de IA"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 10.5a1.5 1.5 0 0 1-1.5 1.5H5L2 15V3a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 14 3z"/>
                </svg>
              </button>

              <div className="h2-divider" />

              <button
                className={`h2-btn ${isCameraActive ? 'active-btn' : ''}`}
                onClick={onToggleCamera}
                title="Cámara"
              >
                {PANEL_ICONS['camara']}
              </button>
              <button
                className={`h2-btn ${isPinsActive ? 'active-btn' : ''}`}
                onClick={onTogglePins}
                title="GPIO / Pines"
              >
                {PANEL_ICONS['pines']}
              </button>
              <button
                className={`h2-btn ${isDomoticaActive ? 'active-btn' : ''}`}
                onClick={onToggleDomotica}
                title="Domótica (Arduino)"
              >
                {PANEL_ICONS['domotica']}
              </button>
            </div>
          )}
      </div>
    </header>
  );
};

export default Header;
