import React, { useEffect, useState, useRef } from 'react';
import './TerminalView.css';
import TerminalPane from '@/features/terminal/TerminalPane';
import ChatPane from '@/features/chat/ChatPane';
import DesktopPane from '@/features/escritorio/DesktopPane';
import CameraGrid from '@/components/raspberry/CameraGrid';
import Ev3Panel from '@/features/hardware/ev3/Ev3Panel';
import { LinuxPracticeProgressBar, type ProgresoPractica } from '@/features/practicas/linux/LinuxPracticeProgressBar';
import { useCommandHistory } from '@/features/terminal/useCommandHistory';
import { EVENTO_GUIA_TERMINAL, type DetalleGuiaTerminal } from '@/features/practicas/linux/ritmo';
import { EVENTO_EJECUTAR_COMANDO, teclasDelComando, type DetalleEjecutarComando } from '@/features/practicas/linux/ejecutarComando';
import { sshStdin } from '@/features/conexion/ssh.service';
import type { LinuxPracticeSessionApi } from '@/features/practicas/useLinuxPracticeSession';

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
  /** true si la práctica activa trae panel de control de robot (Eve3 vía API) — ver usePracticeSession. */
  robotDashboardEnabled?: boolean;
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
  robotDashboardEnabled = false,
  linuxSession,
}) => {
  // La práctica arranca mostrando el dashboard del robot (si aplica); el
  // estudiante puede alternar a la terminal SSH cruda sin perder la sesión.
  const [showEv3Panel, setShowEv3Panel] = useState(robotDashboardEnabled);
  const [chatWidth, setChatWidth] = useState(420);
  // Lo reporta el chat: nombre de la práctica y el paso en que va (el mismo que muestra la guía).
  const [progresoPractica, setProgresoPractica] = useState<ProgresoPractica | null>(null);
  const [cameraHeight, setCameraHeight] = useState(450);
  const [isResizingChat, setIsResizingChat] = useState(false);
  const [isResizingCamera, setIsResizingCamera] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { commandHistory, processTerminalData, processTerminalInput, clearHistory } = useCommandHistory();

  useEffect(() => {
    clearHistory();
  }, [sessionId, clearHistory]);

  // Reporta el historial de comandos en vivo (capturado por
  // useCommandHistory sin tocar disco) hacia useLinuxPracticeSession, que lo
  // lee en revalidate() -- reemplaza a extractSessionCommands, que leía
  // savedLogs/<id>.html, un archivo que nunca existe mientras la sesión
  // sigue abierta. Depende de `reportCommandHistory` (estable, useCallback) y
  // no del objeto `linuxSession`, que es nuevo en cada render de App: con el
  // objeto entero, cualquier re-render de la app volvía a reportar y a validar.
  const reportCommandHistory = linuxSession?.reportCommandHistory;
  useEffect(() => {
    if (practiceId && reportCommandHistory) {
      reportCommandHistory(sessionId, commandHistory);
    }
  }, [practiceId, reportCommandHistory, sessionId, commandHistory]);

  // Botón «Ejecutar comando» de un paso (ver practicas/linux/ejecutarComando.ts): se escribe por
  // el mismo camino que el teclado -- historial (para validar el paso) y SSH.
  useEffect(() => {
    if (!practiceId) return;
    const alPedir = (e: Event) => {
      const detalle = (e as CustomEvent<DetalleEjecutarComando>).detail;
      if (!detalle || detalle.practiceId !== practiceId) return;
      const teclas = teclasDelComando(detalle.comando);
      processTerminalInput(teclas);
      sshStdin(sessionId, teclas).catch((err) => console.warn('[practica] no se pudo ejecutar el comando del paso', err));
    };
    window.addEventListener(EVENTO_EJECUTAR_COMANDO, alPedir);
    return () => window.removeEventListener(EVENTO_EJECUTAR_COMANDO, alPedir);
  }, [practiceId, sessionId, processTerminalInput]);

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

  // Guía de la práctica (ver ritmo.ts): mientras un paso pide escribir un
  // comando, la terminal se marca para que quien nunca la vio sepa cuál es; y
  // «Ir a la terminal» le pone el cursor sin tener que adivinar dónde hacer clic.
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const [pedidosGuia, setPedidosGuia] = useState<Set<string>>(() => new Set());
  const [destello, setDestello] = useState(0);
  useEffect(() => {
    const onGuia = (ev: Event) => {
      const d = (ev as CustomEvent<DetalleGuiaTerminal>).detail;
      if (!d || d.sessionId !== sessionId) return;
      if (d.resaltar !== undefined) {
        setPedidosGuia((prev) => {
          if (prev.has(d.origen) === d.resaltar) return prev;
          const next = new Set(prev);
          if (d.resaltar) next.add(d.origen); else next.delete(d.origen);
          return next;
        });
      }
      if (d.enfocar) {
        // xterm recibe el teclado por su textarea oculto.
        terminalRef.current?.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea')?.focus();
        setDestello((n) => n + 1);
      }
    };
    window.addEventListener(EVENTO_GUIA_TERMINAL, onGuia);
    return () => window.removeEventListener(EVENTO_GUIA_TERMINAL, onGuia);
  }, [sessionId]);
  const terminalGuiada = pedidosGuia.size > 0 && activeView !== 'escritorio';

  // La etiqueta «Escribe aquí» va pegada al cursor, donde de verdad se escribe.
  // xterm mueve su textarea oculto a la celda del cursor en cada movimiento
  // (Terminal._syncTextArea): se sigue su posición en vez de adivinarla.
  const [cursor, setCursor] = useState<{ x: number; y: number; alto: number } | null>(null);
  useEffect(() => {
    if (!terminalGuiada) { setCursor(null); return; }
    let soltar = () => {};
    let reintento: number | undefined;
    const enganchar = () => {
      const textarea = terminalRef.current?.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea');
      if (!textarea) { reintento = window.setTimeout(enganchar, 300); return; }
      const medir = () => {
        const caja = terminalRef.current?.getBoundingClientRect();
        const t = textarea.getBoundingClientRect();
        if (!caja || t.height === 0) return;
        setCursor({ x: t.left - caja.left + t.width, y: t.top - caja.top, alto: t.height });
      };
      medir();
      const observador = new MutationObserver(medir);
      observador.observe(textarea, { attributes: true, attributeFilter: ['style'] });
      window.addEventListener('resize', medir);
      soltar = () => { observador.disconnect(); window.removeEventListener('resize', medir); };
    };
    enganchar();
    return () => { window.clearTimeout(reintento); soltar(); };
  }, [terminalGuiada]);
  const anchoTerminal = terminalRef.current?.clientWidth ?? 0;
  // Si el cursor está muy a la derecha, la etiqueta pasa abajo para no salirse.
  const etiquetaAbajo = !!cursor && cursor.x + 260 > anchoTerminal;

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
          <LinuxPracticeProgressBar result={linuxResult} progreso={progresoPractica} />
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
            <div
              ref={terminalRef}
              data-tour="practica-terminal"
              className={terminalGuiada ? 'terminal-guiada' : undefined}
              style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}
            >
              <TerminalPane
                sessionId={sessionId}
                onTerminalOutput={processTerminalData}
                onTerminalInput={processTerminalInput}
                bloquearTab={!!practiceId}
              />
              {terminalGuiada && cursor && (
                <div
                  key={destello}
                  className={`terminal-guiada-etiqueta${etiquetaAbajo ? ' terminal-guiada-etiqueta--abajo' : ''}${destello ? ' terminal-guiada-etiqueta--destello' : ''}`}
                  style={etiquetaAbajo
                    ? { left: Math.max(8, Math.min(cursor.x - 24, anchoTerminal - 248)), top: cursor.y + cursor.alto + 8 }
                    : { left: cursor.x + 10, top: cursor.y + cursor.alto / 2 }}
                  aria-hidden
                >
                  Escribe aquí y presiona Enter
                </div>
              )}
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

          {/* Capa 3: Panel de control EV3 (práctica Eve3 vía API) — se superpone
              a terminal/VNC, no depende de `activeView` sino de su propio toggle. */}
          {robotDashboardEnabled && (
            <div style={{
              gridArea: '1 / 1',
              display: 'flex',
              flexDirection: 'column',
              visibility: showEv3Panel ? 'visible' : 'hidden',
              zIndex: showEv3Panel ? 2 : 0,
              minWidth: 0,
              minHeight: 0,
            }}>
              <Ev3Panel sessionId={sessionId} />
            </div>
          )}

        </div>

      </div>

      {robotDashboardEnabled && (
        <button
          type="button"
          onClick={() => setShowEv3Panel(v => !v)}
          className="ev3-view-toggle"
          title={showEv3Panel ? 'Ver terminal SSH' : 'Ver panel de control EV3'}
        >
          {showEv3Panel ? 'Terminal' : 'Panel EV3'}
        </button>
      )}

      {/* ── Right: Chat Side Panel ── */}
      {isChatOpen && (
        <>
          <div
            className="side-resizer"
            onMouseDown={() => setIsResizingChat(true)}
          />
          <div data-tour="practica-chat" style={{ width: chatWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <ChatPane sessionId={sessionId} onClose={onCloseChat} practiceId={practiceId} practiceResult={linuxResult} linuxSession={linuxSession} onProgresoPractica={setProgresoPractica} />
          </div>
        </>
      )}
    </div>
  );
};

export default TerminalView;
