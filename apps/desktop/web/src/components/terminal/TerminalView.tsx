import React, { useEffect, useState, useRef } from 'react';
import './TerminalView.css';
import TerminalPane from './TerminalPane';
import ChatPane from '../ChatPane';
import DesktopPane from '../desktop/DesktopPane';
import { invoke } from '@tauri-apps/api/core';


interface TerminalViewProps {
  sessionId: string;
  activeView?: 'terminal' | 'escritorio';
  isCameraOpen?: boolean;
  isChatOpen?: boolean;
  onCloseChat?: () => void;
}

const TerminalView: React.FC<TerminalViewProps> = ({ sessionId, activeView = 'terminal', isCameraOpen = false, isChatOpen = false, onCloseChat = () => {} }) => {
  const [paneWidth, setPaneWidth] = useState(420);
  const [isResizing, setIsResizing] = useState(false);
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
    <div className={`terminal-view ${isResizing ? 'is-resizing' : ''}`} ref={containerRef} style={{ display: 'flex', width: '100%', height: '100%', minHeight: 0 }}>
      <div className="terminal-stack" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        
        {/* Utilizamos un contenedor envolvente flex y Grid para apilar perfectamente 
            el Terminal y el VNC uno encima de otro sin aplicar "display: none". 
            xterm.js pierde totalmente sus columnas/filas si su padre es display: none. */}
        <div style={{ flex: 1, display: 'grid', minHeight: 0, position: 'relative' }}>
          
          {/* Capa 1: Terminal. Se oculta con visibility para preservar dimensiones en el DOM */}
          <div style={{ 
            gridArea: '1 / 1', 
            display: 'flex', 
            flexDirection: 'column', 
            visibility: activeView === 'escritorio' ? 'hidden' : 'visible',
            zIndex: activeView === 'escritorio' ? 0 : 1,
            minWidth: 0,
            minHeight: 0
          }}>
            <TerminalPane sessionId={sessionId} />
          </div>

          {/* Capa 2: Escritorio Remoto VNC */}
          <div style={{ 
            gridArea: '1 / 1', 
            display: 'flex', 
            flexDirection: 'column', 
            visibility: activeView === 'escritorio' ? 'visible' : 'hidden',
            zIndex: activeView === 'escritorio' ? 1 : 0,
            minWidth: 0,
            minHeight: 0
          }}>
            <DesktopPane sessionId={sessionId} isActive={activeView === 'escritorio'} />
          </div>

        </div>
      </div>
      
      {isChatOpen && (
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
          <div style={{ width: paneWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <ChatPane sessionId={sessionId} onClose={onCloseChat} />
          </div>
        </>
      )}
    </div>
  );
};

export default TerminalView;
