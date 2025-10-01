import React, { useEffect, useState, useRef } from 'react';
import './TerminalView.css';
import TerminalPane from './TerminalPane';
import ChatPane from './ChatPane';
import BottomBar from './BottomBar';


interface TerminalViewProps {
  sessionId: string;
}

const TerminalView: React.FC<TerminalViewProps> = ({ sessionId }) => {
  const [isBottomBarOpen, setBottomBarOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Ajustar la altura disponible del contenedor del terminal cuando la barra se abre/cierra
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const bbH = isBottomBarOpen ? 240 : 0; // sincrónico con --bb-height
    el.style.setProperty('--bb-offset', bbH + 'px');
  }, [isBottomBarOpen]);

  return (
    <div className="terminal-view" ref={containerRef}>
      <div className="terminal-stack">
        <TerminalPane sessionId={sessionId} />
        <div className="bottom-bar-slot">
          <BottomBar isOpen={isBottomBarOpen} onToggle={() => setBottomBarOpen(v => !v)} />
        </div>
      </div>
      <ChatPane sessionId={sessionId} />
    </div>
  );
};

export default TerminalView;
