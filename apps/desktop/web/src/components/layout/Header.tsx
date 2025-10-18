import React, { useEffect } from 'react';
import './Header.css';
import { useToasts } from '../../contexts/ToastContext';

type Tab = { id: string; type: 'home' | 'session'; label: string }
interface HeaderProps {
  tabs: Tab[];
  activeTabId: string;
  onTabClick: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewSession: () => void;
}

const Header: React.FC<HeaderProps> = ({ tabs, activeTabId, onTabClick, onCloseTab, onNewSession }) => {
  const { push } = useToasts();
  
  // Keyboard shortcuts for tab navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Tab: Next tab
      if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        const currentIndex = tabs.findIndex(t => t.id === activeTabId);
        const nextIndex = (currentIndex + 1) % tabs.length;
        onTabClick(tabs[nextIndex].id);
      }
      
      // Ctrl+Shift+Tab: Previous tab
      if (e.ctrlKey && e.shiftKey && e.key === 'Tab') {
        e.preventDefault();
        const currentIndex = tabs.findIndex(t => t.id === activeTabId);
        const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        onTabClick(tabs[prevIndex].id);
      }
      
      // Ctrl+W: Close current tab (if not home)
      if (e.ctrlKey && e.key === 'w') {
        const activeTab = tabs.find(t => t.id === activeTabId);
        if (activeTab && activeTab.type === 'session') {
          e.preventDefault();
          onCloseTab(activeTabId);
        }
      }
      
      // Ctrl+T: New session
      if (e.ctrlKey && e.key === 't') {
        e.preventDefault();
        onNewSession();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tabs, activeTabId, onTabClick, onCloseTab, onNewSession]);
  
  return (
    <header className="app-header" role="banner">
      <nav className="tabs" role="tablist" aria-label="Pestañas de navegación">
        {tabs.map(t => (
          <div 
            key={t.id} 
            className={`tab ${activeTabId === t.id ? 'active' : ''}`} 
            onClick={() => onTabClick(t.id)}
            role="tab"
            aria-selected={activeTabId === t.id}
            aria-label={t.label}
            tabIndex={activeTabId === t.id ? 0 : -1}
          >
            <span title={t.label}>{t.label}</span>
            {t.type === 'session' && (
              <button 
                className="close-tab" 
                onClick={(e) => { e.stopPropagation(); onCloseTab(t.id); }}
                aria-label={`Cerrar ${t.label}`}
                title="Cerrar pestaña (Ctrl+W)"
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button 
          className="new-tab" 
          onClick={onNewSession}
          aria-label="Nueva sesión"
          title="Nueva sesión (Ctrl+T)"
        >
          +
        </button>
      </nav>
    </header>
  );
};

export default Header;
