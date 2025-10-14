import React, { useEffect, useState, useRef } from 'react';
import './TerminalView.css';
import TerminalPane from './TerminalPane';
import ChatPane from './ChatPane';
import BottomBar from './BottomBar';
import { invoke } from '@tauri-apps/api/core';


interface TerminalViewProps {
  sessionId: string;
  isCameraOpen?: boolean;
}

const TerminalView: React.FC<TerminalViewProps> = ({ sessionId, isCameraOpen = false }) => {
  const [enableBottomBar, setEnableBottomBar] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

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
    <div className="terminal-view" ref={containerRef}>
      <div className="terminal-stack">
        <TerminalPane sessionId={sessionId} />
        {enableBottomBar && (
          <div className="bottom-bar-slot">
            <BottomBar isOpen={isCameraOpen} onToggle={() => {}} sessionId={sessionId} />
          </div>
        )}
      </div>
      <ChatPane sessionId={sessionId} />
    </div>
  );
};

export default TerminalView;
