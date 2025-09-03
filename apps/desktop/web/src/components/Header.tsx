import React from 'react';
import './Header.css';

interface HeaderProps {
  sessions: string[];
  activeSession: string | null;
  onTabClick: (sessionId: string | null) => void;
  onCloseTab: (sessionId: string) => void;
  onNewSession: () => void;
  toggleSidebar: () => void;
}

const Header: React.FC<HeaderProps> = ({ sessions, activeSession, onTabClick, onCloseTab, onNewSession, toggleSidebar }) => {
  return (
    <header className="app-header">
      <div className="sidebar-toggle" onClick={toggleSidebar}>
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
      </div>
      <nav className="tabs">
        <div className={`tab ${activeSession === null ? 'active' : ''}`} onClick={() => onTabClick(null)}>
          Home
        </div>
        {sessions.map(session => (
          <div key={session} className={`tab ${activeSession === session ? 'active' : ''}`} onClick={() => onTabClick(session)}>
            <span>{session}</span>
            <button className="close-tab" onClick={(e) => { e.stopPropagation(); onCloseTab(session); }}>×</button>
          </div>
        ))}
        <button className="new-tab" onClick={onNewSession}>+</button>
      </nav>
    </header>
  );
};

export default Header;
