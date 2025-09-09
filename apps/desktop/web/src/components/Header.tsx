import React from 'react';
import './Header.css';

type Tab = { id: string; type: 'home' | 'session'; label: string }
interface HeaderProps {
  tabs: Tab[];
  activeTabId: string;
  onTabClick: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewSession: () => void;
  toggleSidebar: () => void;
}

const Header: React.FC<HeaderProps> = ({ tabs, activeTabId, onTabClick, onCloseTab, onNewSession, toggleSidebar }) => {
  return (
    <header className="app-header">
      <div className="sidebar-toggle" onClick={toggleSidebar}>
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
      </div>
      <nav className="tabs">
        {tabs.map(t => (
          <div key={t.id} className={`tab ${activeTabId === t.id ? 'active' : ''}`} onClick={() => onTabClick(t.id)}>
            <span>{t.label}</span>
            {t.type === 'session' && (
              <button className="close-tab" onClick={(e) => { e.stopPropagation(); onCloseTab(t.id); }}>×</button>
            )}
          </div>
        ))}
        <button className="new-tab" onClick={onNewSession}>+</button>
      </nav>
    </header>
  );
};

export default Header;
