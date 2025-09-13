import React, { useState } from 'react';
import './Header.css';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
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
  const [checking, setChecking] = useState(false)
  const onCheckUpdate = async () => {
    try {
      setChecking(true)
      push({ type: 'info', message: 'Buscando actualización…' }, 2500);
      const update = await check();
      if (update) {
        push({ type: 'info', message: `Actualización ${update.version} disponible. Descargando…` }, 4000);
        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case 'Started':
              console.log(`Update download started: ${event.data.contentLength} bytes`);
              break;
            case 'Progress':
              console.log(`Downloaded ${event.data.chunkLength} bytes chunk`);
              break;
            case 'Finished':
              console.log('Update download finished');
              break;
          }
        });
        push({ type: 'success', message: 'Actualización instalada. Reiniciando…' }, 3000);
        await relaunch();
      } else {
        console.log('No updates available');
        push({ type: 'info', message: 'No hay actualizaciones disponibles' }, 3500);
      }
    } catch (e) {
      console.error('Updater error', e);
      push({ type: 'error', message: 'Error al buscar/instalar actualización. Revisa tu conexión o inténtalo más tarde.' }, 5000);
    }
    finally { setChecking(false) }
  }
  return (
    <header className="app-header">
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <img src="/descarga.png" alt="App" width={20} height={20} style={{borderRadius:4,boxShadow:'0 0 0 1px rgba(255,255,255,0.08)'}} />
      </div>
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
        <button onClick={onCheckUpdate} className={`btn-update ${checking ? 'loading':''}`} disabled={checking}>
          {checking ? (
            <span className="spinner" aria-label="Cargando" />
          ) : (
            <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          )}
          <span>{checking ? 'Buscando…' : 'Buscar actualización'}</span>
        </button>
      </nav>
    </header>
  );
};

export default Header;
