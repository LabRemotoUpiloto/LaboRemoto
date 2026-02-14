import React, { useState } from 'react';
import './Header.css';
import { useToasts } from '../../contexts/ToastContext';

type Tab = { id: string; type: 'home' | 'session' | 'log'; label: string }
interface HeaderProps {
  tabs: Tab[];
  activeTabId: string;
  onTabClick: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewSession: () => void;
}

const Header: React.FC<HeaderProps> = ({ tabs, activeTabId, onTabClick, onCloseTab, onNewSession }) => {
  const { push } = useToasts();

  // Sin perfil ni logout: no hay autenticación
  
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
            {(t.type === 'session' || t.type === 'log') && (
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

      {/* Sin menú de perfil */}
    </header>
  );
};

export default Header;
