import React from 'react';
import './Header.css';
import type { ActiveView } from '../../hooks/useAppTabs';

// SVG icons for panel tabs (H1)
const PANEL_ICONS: Record<string, React.ReactNode> = {
  terminal: (
    <svg viewBox="0 0 12 12" fill="none"><rect x=".5" y="1.5" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M3 5l2 1.5L3 8M7 8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
  sftp: (
    <svg viewBox="0 0 12 12" fill="none"><path d="M2 10.5V4l2-2h5l1.5 1.5V10.5a1 1 0 01-1 1H3a1 1 0 01-1-1z" stroke="currentColor" strokeWidth="1.2"/><path d="M4 2v2.5H2" stroke="currentColor" strokeWidth="1.2"/><path d="M7 5v4M5.5 7.5L7 9l1.5-1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
  logs: (
    <svg viewBox="0 0 12 12" fill="none"><path d="M2 4h8M2 6.5h5M2 9h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
  ),
  pines: (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
      <rect x="6" y="3" width="8" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M2 6h4M2 9h4M2 12h4M2 15h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M14 6h4M14 9h4M14 12h4M14 15h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <circle cx="10" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.1"/>
    </svg>
  ),
  camara: (
    <svg viewBox="0 0 12 12" fill="none"><rect x="1" y="2.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.1"/><path d="M8 5l3-1.5v5L8 7V5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/></svg>
  ),
  escritorio: (
    <svg viewBox="0 0 12 12" fill="none"><rect x=".5" y="1" width="11" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M3.5 10.5h5M6 8.5v2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
  ),
  snippets: (
    <svg viewBox="0 0 12 12" fill="none"><polyline points="8 9 11 6 8 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><polyline points="4 3 1 6 4 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
  themes: (
    <svg viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="5" cy="4.5" r=".6" fill="currentColor"/><circle cx="7.5" cy="5.5" r=".6" fill="currentColor"/><circle cx="4.5" cy="6.5" r=".6" fill="currentColor"/></svg>
  ),
  hosts: (
    <svg viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2"/><polygon points="8.5 4 7 7 4 8.5 5 5 8.5 4" stroke="currentColor" strokeWidth="1" fill="none"/></svg>
  ),
  connect: (
    <svg viewBox="0 0 12 12" fill="none"><rect x=".5" y="1.5" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M3 5l2 1.5L3 8M7 8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
  landing: (
    <svg viewBox="0 0 12 12" fill="none"><path d="M1.5 4.5L6 1l4.5 3.5v6a1 1 0 01-1 1H2.5a1 1 0 01-1-1z" stroke="currentColor" strokeWidth="1.2"/><path d="M4.5 10.5v-4h3v4" stroke="currentColor" strokeWidth="1.1"/></svg>
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
  // View toggle
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  showViewToggle?: boolean;
  // Chat toggle
  isChatOpen: boolean;
  onToggleChat: () => void;
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
}) => {
  return (
    <header className="dual-header" role="banner">
      {/* ═══ H1: Panel Tabs ═══ */}
      <div className="h1">
        {openPanels.map(panelId => (
          <div
            key={panelId}
            className={`h1-tab ${activePanel === panelId ? 'active' : ''}`}
            onClick={() => onPanelClick(panelId)}
          >
            <span className="h1-tab-icon">{PANEL_ICONS[panelId] || null}</span>
            <span className="h1-tab-label">{PANEL_LABELS[panelId] || panelId}</span>
            <div className="h1-tab-close" onClick={(e) => { e.stopPropagation(); onPanelClose(panelId); }}>
              <CloseIcon />
            </div>
          </div>
        ))}
        <div className="h1-empty" />
      </div>

      {/* ═══ H2: Session Bar ═══ */}
      {activePanel === 'terminal' && (
        <div className="h2">
          <div className="h2-sessions">
            {tabs.filter(t => t.type === 'session').map(t => (
              <div
                key={t.id}
                className={`h2-tab ${activeTabId === t.id ? 'active' : ''}`}
                onClick={() => onTabClick(t.id)}
              >
                <div className="h2-tab-ico">SSH</div>
                <div className={`h2-dot ${activeTabId === t.id ? 'on' : 'off'}`} />
                <span className="h2-tab-label">{t.label}</span>
                <div className="h2-tab-close" onClick={(e) => { e.stopPropagation(); onCloseTab(t.id); }}>
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
                className="h2-btn"
                onClick={() => onPanelClick('camara')}
                title="Cámara"
              >
                {PANEL_ICONS['camara']}
              </button>
              <button
                className="h2-btn"
                onClick={() => onPanelClick('pines')}
                title="GPIO / Pines"
              >
                {PANEL_ICONS['pines']}
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
};

export default Header;
