import React, { useEffect, useState, useRef } from 'react';
import './TerminalView.css';
import TerminalPane from './TerminalPane';
import ChatPane from '../ChatPane';
import DesktopPane from '../desktop/DesktopPane';
import CameraGrid from '../raspberry/CameraGrid';

interface TerminalViewProps {
  sessionId: string;
  activeView?: 'terminal' | 'escritorio';
  isCameraOpen?: boolean;
  isChatOpen?: boolean;
  onCloseChat?: () => void;
  isTabActive?: boolean;
}

const TerminalView: React.FC<TerminalViewProps> = ({ sessionId, activeView = 'terminal', isCameraOpen = false, isChatOpen = false, onCloseChat = () => {}, isTabActive = true }) => {
  const [chatWidth, setChatWidth] = useState(420);
  const [cameraHeight, setCameraHeight] = useState(450);
  const [isResizingChat, setIsResizingChat] = useState(false);
  const [isResizingCamera, setIsResizingCamera] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // When camera panel opens/closes, xterm must re-fit to the new height
  useEffect(() => {
    // Small double-fire: once immediately after layout change, once after transition settles
    const t1 = setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    const t2 = setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [isCameraOpen]);


  // Resize handlers
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (isResizingChat) {
        const newW = window.innerWidth - e.clientX;
        setChatWidth(Math.max(300, Math.min(650, newW)));
      }
      if (isResizingCamera) {
        // Camera is at the top, so we calculate height from top (or just use clientY offset)
        // Adjusting roughly based on a standard top header height (~60px)
        const newH = e.clientY - 60;
        setCameraHeight(Math.max(150, Math.min(window.innerHeight - 200, newH)));
      }
    };
    const onUp = () => { setIsResizingChat(false); setIsResizingCamera(false); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isResizingChat, isResizingCamera]);

  const isResizing = isResizingChat || isResizingCamera;

  return (
    <div className={`terminal-view ${isResizing ? 'is-resizing' : ''}`} ref={containerRef} style={{ display: 'flex', width: '100%', height: '100%', minHeight: 0 }}>
      
      {/* ── Main Stack (Camera Top, Terminal/VNC Bottom) ── */}
      <div className="terminal-stack" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        
        {/* ── Top: Camera Panel ── */}
        {isCameraOpen && (
          <>
            <div className="camera-top-panel" style={{ height: cameraHeight }}>
              <CameraGrid sessionId={sessionId} isActive={isCameraOpen} />
            </div>
            {/* Horizontal Resize handle */}
            <div
              className="bottom-resizer"
              onMouseDown={() => setIsResizingCamera(true)}
              style={{ cursor: 'ns-resize' }}
            />
          </>
        )}

        {/* ── Bottom: Terminal / VNC ── */}
        <div style={{ flex: 1, display: 'grid', minHeight: 0, position: 'relative' }}>
          
          {/* Capa 1: Terminal */}
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
            <DesktopPane sessionId={sessionId} isActive={activeView === 'escritorio' && isTabActive} />
          </div>

        </div>
      </div>

      {/* ── Right: Chat Side Panel ── */}
      {isChatOpen && (
        <>
          <div
            className="side-resizer"
            onMouseDown={() => setIsResizingChat(true)}
          />
          <div style={{ width: chatWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <ChatPane sessionId={sessionId} onClose={onCloseChat} />
          </div>
        </>
      )}
    </div>
  );
};

export default TerminalView;
