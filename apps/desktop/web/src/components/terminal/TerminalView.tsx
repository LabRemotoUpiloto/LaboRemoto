import React, { useEffect, useState, useRef } from 'react';
import './TerminalView.css';
import TerminalPane from './TerminalPane';
import ChatPane from '../ChatPane';
import { invoke } from '@tauri-apps/api/core';


interface TerminalViewProps {
  sessionId: string;
  isCameraOpen?: boolean;
}

const TerminalView: React.FC<TerminalViewProps> = ({ sessionId, isCameraOpen = false }) => {
  const [paneWidth, setPaneWidth] = useState(420);
  const [isResizing, setIsResizing] = useState(false);
  const [isChatVisible, setIsChatVisible] = useState(true);
  const [enableBottomBar, setEnableBottomBar] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const onMouseDown = () => { setIsResizing(true); };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizing) return;
      // el panel está a la derecha, calculamos desde el borde derecho 
      const newW = window.innerWidth - e.clientX;
      setPaneWidth(Math.max(300, Math.min(650, newW)));
    };
    const onUp = () => { setIsResizing(false); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isResizing]);

  // Ajustar la altura disponible del contenedor del terminal cuando la barra se abre/cierra
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const bbH = (isCameraOpen && enableBottomBar) ? 240 : 0; // sincrónico con --bb-height
    el.style.setProperty('--bb-offset', bbH + 'px');
  }, [isCameraOpen, enableBottomBar]);

  // Consultar backend para saber IP real y habilitar bottom bar sólo si coincide
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const info = await invoke<{ host: string; port: number; user: string; resolved_ip: string }>('ssh_session_info', { id: sessionId });
        if (!mounted) return;
        setEnableBottomBar(info?.resolved_ip === '200.115.181.211');
      } catch (_) {
        if (!mounted) return;
        setEnableBottomBar(false);
      }
    })();
    return () => { mounted = false; };
  }, [sessionId]);

  return (
    <div className={`terminal-view ${isResizing ? 'is-resizing' : ''}`} ref={containerRef} style={{ display: 'flex', width: '100%', height: '100%' }}>
      <div className="terminal-stack" style={{ flex: 1, minWidth: 0 }}>
        <TerminalPane sessionId={sessionId} />
      </div>
      
      {isChatVisible && (
        <>
          {/* Handle de resize */}
          <div
            onMouseDown={onMouseDown}
            style={{
              width: '4px',
              cursor: 'col-resize',
              background: 'rgba(255,255,255,0.04)',
              transition: 'background 0.15s',
              flexShrink: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-primary)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
          />
          <div style={{ width: paneWidth, flexShrink: 0 }}>
            <ChatPane sessionId={sessionId} onClose={() => setIsChatVisible(false)} />
          </div>
        </>
      )}
      
      {!isChatVisible && (
        <button 
          className="chat-toggle-btn" 
          onClick={() => setIsChatVisible(true)}
          title="Abrir chat"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
      )}
    </div>
  );
};

export default TerminalView;
