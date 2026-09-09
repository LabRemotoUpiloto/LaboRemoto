import React, { useEffect, useState, useRef } from 'react';
import './TerminalView.css';
import TerminalPane from './TerminalPane';
import ChatPane from '../ChatPane';
import DesktopPane from '../desktop/DesktopPane';
import CameraGrid from '../raspberry/CameraGrid';
import LinuxPracticeProgressBar from '../practicas/linux/LinuxPracticeProgressBar';
import { useCommandHistory } from '../../hooks/useCommandHistory';
import type { LinuxPracticeSessionApi } from '../../hooks/useLinuxPracticeSession';

interface TerminalViewProps {
  sessionId: string;
  activeView?: 'terminal' | 'escritorio';
  isCameraOpen?: boolean;
  isChatOpen?: boolean;
  onCloseChat?: () => void;
  isTabActive?: boolean;
  practiceId?: string | null;
  assignmentId?: number;
  student?: { id: number; username: string; fullname: string; email: string } | null;
  /** Instancia única de useLinuxPracticeSession (ver App.tsx), para leer progreso/conexión de la práctica Linux activa. */
  linuxSession?: LinuxPracticeSessionApi;
}

const TerminalView: React.FC<TerminalViewProps> = ({
  sessionId,
  activeView = 'terminal',
  isCameraOpen = false,
  isChatOpen = false,
  onCloseChat = () => {},
  isTabActive = true,
  practiceId = null,
  assignmentId,
  student = null,
  linuxSession,
}) => {
  const [chatWidth, setChatWidth] = useState(420);
  const [cameraHeight, setCameraHeight] = useState(450);
  const [isResizingChat, setIsResizingChat] = useState(false);
  const [isResizingCamera, setIsResizingCamera] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { commandHistory, commandEntries, processTerminalData, processTerminalInput, clearHistory } = useCommandHistory();

  useEffect(() => {
    clearHistory();
  }, [sessionId, clearHistory]);

  // Reporta el historial de comandos en vivo (capturado por
  // useCommandHistory sin tocar disco) hacia useLinuxPracticeSession, que lo
  // lee en revalidate() -- reemplaza a extractSessionCommands, que leía
  // savedLogs/<id>.html, un archivo que nunca existe mientras la sesión
  // sigue abierta.
  useEffect(() => {
    if (practiceId && linuxSession) {
      linuxSession.reportCommandHistory(sessionId, commandHistory);
    }
  }, [practiceId, linuxSession, sessionId, commandHistory]);

  // When camera panel opens/closes, xterm must re-fit to the new height
  useEffect(() => {
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

  // Progreso/estado de conexión de la práctica de Linux activa en esta
  // pestaña (si la hay) — derivado de la instancia única de
  // useLinuxPracticeSession que vive en App.tsx. `null`/`false` para
  // sesiones SSH normales (practiceId nulo) o prácticas que no son Linux.
  const linuxResult = practiceId ? linuxSession?.results[practiceId] ?? null : null;
  const linuxConnected = practiceId ? !!linuxSession?.connectedModules[practiceId] : false;
  const showProgressBar = !!(practiceId && linuxConnected && linuxResult);

  // La barra de progreso de la práctica de Linux aparece/desaparece de forma
  // asíncrona (linuxResult pasa de null a un objeto real) y cambia la altura
  // disponible para el terminal sin pasar por un resize de ventana -- mismo
  // caso que el panel de cámara arriba, mismo fix: forzar un resize sintético
  // para que xterm vuelva a hacer fit() contra el contenedor ya redimensionado.
  useEffect(() => {
    const t1 = setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    const t2 = setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [showProgressBar]);

  return (
    <div className={`terminal-view ${isResizing ? 'is-resizing' : ''}`} ref={containerRef} style={{ display: 'flex', width: '100%', height: '100%', minHeight: 0 }}>
      
      {/* ── Main Stack (Camera Top, Terminal/VNC Bottom) ── */}
      <div className="terminal-stack" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>

        {/* ── Barra de progreso de la práctica de Linux — nunca en sesiones SSH normales (practiceId siempre null ahí) ── */}
        {showProgressBar && linuxResult && (
          <LinuxPracticeProgressBar result={linuxResult} />
        )}

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
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <TerminalPane
                sessionId={sessionId}
                onTerminalOutput={processTerminalData}
                onTerminalInput={processTerminalInput}
              />
            </div>
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
            <ChatPane sessionId={sessionId} onClose={onCloseChat} practiceId={practiceId} practiceResult={linuxResult} linuxSession={linuxSession} />
          </div>
        </>
      )}
    </div>
  );
};

export default TerminalView;
