// features/sesion/SesionMosaico.tsx — una sesión SSH de uso normal como mosaico de herramientas: terminal, chat, cámara,
// escritorio remoto y pines, que se abren y ocultan desde «Esta sesión» y se acomodan arrastrando. Las prácticas no lo usan
// (ver TerminalView). Ocultar la terminal no cierra la sesión.
import { useEffect, useMemo, useState } from 'react';
import { Plus, SquareTerminal } from 'lucide-react';
import { Boton, BotonIcono } from '@/components/ui';
import { Mosaico, type Herramienta } from '@/components/mosaico/Mosaico';
import { hojas } from '@/components/mosaico/arbol';
import ChatPane from '@/features/chat/ChatPane';
import CameraGrid from '@/features/camaras/CameraGrid';
import DesktopPane from '@/features/escritorio/DesktopPane';
import PinsPanel from '@/features/hardware/gpio/PinsPanel';
import PanelComandos from '@/features/comandos/PanelComandos';
import ArchivosSftp from '@/features/sftp/ArchivosSftp';
import { ejecutarEnTerminal, pegarEnTerminal } from './escribirEnTerminal';
import { abrir, fijarArbol, marcarVisible, ocultar, sesionQueSeVe, TITULOS, useArbolSesion } from './herramientasSesion';

export default function SesionMosaico({ sessionId, isTabActive, terminalHost }: {
  sessionId: string;
  isTabActive: boolean;
  /** La terminal ya montada por TerminalView (la comparte con la vista de práctica). */
  terminalHost: HTMLElement;
}) {
  const arbol = useArbolSesion(sessionId);
  const visibles = useMemo(() => new Set(hojas(arbol)), [arbol]);

  useEffect(() => {
    if (isTabActive) marcarVisible(sessionId);
    else if (sesionQueSeVe() === sessionId) marcarVisible(null);
  }, [isTabActive, sessionId]);

  // El chat y Archivos, una vez abiertos, quedan montados aunque se oculten (no se pierde la conversación ni la carpeta).
  // Cámara, escritorio y pines se montan solo mientras se ven: así no quedan transmitiendo video o consultando los pines.
  const [chatMontado, setChatMontado] = useState(false);
  const [archivosMontado, setArchivosMontado] = useState(false);
  const [pedirComando, setPedirComando] = useState(0);
  const [rutaArchivos, setRutaArchivos] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (visibles.has('chat')) setChatMontado(true);
    if (visibles.has('archivos')) setArchivosMontado(true);
  }, [visibles]);

  const herramientas: Record<string, Herramienta> = {
    terminal: { titulo: TITULOS.terminal, elemento: terminalHost, claseCuerpo: 'terminal-stack' },
  };
  if (chatMontado || visibles.has('chat')) {
    herramientas.chat = {
      titulo: TITULOS.chat,
      contenido: (
        <div className="chat-pane-host flex min-h-0 flex-1 flex-col" data-tour="practica-chat">
          <ChatPane sessionId={sessionId} onClose={() => ocultar(sessionId, 'chat')} />
        </div>
      ),
    };
  }
  if (visibles.has('camara')) {
    herramientas.camara = { titulo: TITULOS.camara, contenido: <CameraGrid sessionId={sessionId} isActive={isTabActive} /> };
  }
  if (visibles.has('escritorio')) {
    herramientas.escritorio = { titulo: TITULOS.escritorio, contenido: <DesktopPane sessionId={sessionId} isActive={isTabActive} /> };
  }
  if (archivosMontado || visibles.has('archivos')) {
    herramientas.archivos = {
      titulo: TITULOS.archivos,
      contenido: (
        // Las dos vistas de siempre (este equipo y el servidor) con sus transferencias; se acomodan al ancho del panel
        <div className="flex min-h-0 flex-1 flex-col">
          <ArchivosSftp sessions={[sessionId]} activeSessionId={sessionId} initialPath={rutaArchivos} onPathChange={setRutaArchivos} />
        </div>
      ),
    };
  }
  if (visibles.has('comandos')) {
    herramientas.comandos = {
      titulo: TITULOS.comandos,
      acciones: <BotonIcono etiqueta="Nuevo comando" onClick={() => setPedirComando((n) => n + 1)}><Plus size={15} /></BotonIcono>,
      contenido: (
        <PanelComandos terminal="linux" pedirNuevo={pedirComando}
          onEjecutar={(c) => ejecutarEnTerminal(sessionId, c)} onPegar={(c) => pegarEnTerminal(sessionId, c)} />
      ),
    };
  }
  if (visibles.has('pines')) {
    herramientas.pines = { titulo: TITULOS.pines, contenido: <div className="min-h-0 flex-1 overflow-auto"><PinsPanel sessionId={sessionId} /></div> };
  }

  return (
    <div className="terminal-view h-full w-full bg-ui-fondo">
      <Mosaico arbol={arbol} onArbol={(n) => fijarArbol(sessionId, n)} herramientas={herramientas}
        vacio={
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="m-0 text-[14px] font-semibold text-ui-tinta">Todo está oculto en esta sesión</p>
            <p className="m-0 max-w-[420px] text-[13px] text-ui-tinta-2">
              La sesión sigue abierta. Abre la terminal u otra herramienta desde «Esta sesión», en la barra lateral.
            </p>
            <Boton onClick={() => abrir(sessionId, 'terminal')}><SquareTerminal size={14} aria-hidden /> Mostrar la terminal</Boton>
          </div>
        } />
    </div>
  );
}
