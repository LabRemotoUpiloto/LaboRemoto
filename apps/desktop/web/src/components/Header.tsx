import React from 'react';
import './Header.css';
import { useToasts } from '../contexts/ToastContext';

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
  const { push } = useToasts();
  
  // Debug: Log de las pestañas que recibe el Header
  console.log('🏷️ Header received tabs:', tabs.map(t => ({ id: t.id, type: t.type, label: t.label })));
  console.log('🎯 Active tab ID:', activeTabId);
  
  return (
    <header className="app-header">
      <div style={{display:'flex',alignItems:'center',gap:8}} />
      <div className="sidebar-toggle" onClick={toggleSidebar}>
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
      </div>
      <nav className="tabs">
        {tabs.map(t => (
          <div key={t.id} className={`tab ${activeTabId === t.id ? 'active' : ''}`} onClick={() => onTabClick(t.id)}>
            <span title={t.label}>{t.label}</span>
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
