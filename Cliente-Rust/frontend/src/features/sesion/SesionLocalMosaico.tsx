// features/sesion/SesionLocalMosaico.tsx — la terminal local como mosaico: la terminal (con sus propias divisiones), el
// chat (sabe qué shell es y ve lo último del panel activo) y Comandos; lo que ejecutan va al panel de terminal activo. Como
// en las sesiones SSH, ocultar la terminal no la cierra.
import { useEffect, useState } from 'react';
import { Plus, SquareTerminal } from 'lucide-react';
import { Boton, BotonIcono } from '@/components/ui';
import { Mosaico, type Herramienta } from '@/components/mosaico/Mosaico';
import { hojas } from '@/components/mosaico/arbol';
import PanelComandos from '@/features/comandos/PanelComandos';
import type { TipoTerminal } from '@/features/comandos/comandos';
import LocalTerminalGroup from '@/features/terminal/LocalTerminalGroup';
import ChatPane from '@/features/chat/ChatPane';
import { teclasDelComando } from '@/features/practicas/linux/ejecutarComando';
import { abrir, fijarArbol, marcarVisible, ocultar, sesionQueSeVe, useArbolSesion } from './herramientasSesion';

export const EVENTO_ESCRIBIR_LOCAL = 'local-term:escribir';
export interface DetalleEscribirLocal { tabId: string; teclas: string }

/** En Windows la terminal local es PowerShell (pwsh si está); en los demás, la shell de la persona. */
export const TERMINAL_LOCAL: TipoTerminal = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent) ? 'powershell' : 'linux';
export const TITULO_TERMINAL_LOCAL = TERMINAL_LOCAL === 'powershell' ? 'Terminal local (PowerShell)' : 'Terminal local';

const escribir = (tabId: string, teclas: string) =>
  window.dispatchEvent(new CustomEvent<DetalleEscribirLocal>(EVENTO_ESCRIBIR_LOCAL, { detail: { tabId, teclas } }));

export default function SesionLocalMosaico({ tabId, isTabActive, onEmptyGroup }: {
  tabId: string;
  isTabActive: boolean;
  onEmptyGroup: () => void;
}) {
  const arbol = useArbolSesion(tabId);
  const [pedirComando, setPedirComando] = useState(0);
  const [chatMontado, setChatMontado] = useState(false);
  const visibleChat = hojas(arbol).includes('chat');
  useEffect(() => { if (visibleChat) setChatMontado(true); }, [visibleChat]);
  useEffect(() => {
    if (isTabActive) marcarVisible(tabId);
    else if (sesionQueSeVe() === tabId) marcarVisible(null);
  }, [isTabActive, tabId]);

  const herramientas: Record<string, Herramienta> = {
    terminal: { titulo: TITULO_TERMINAL_LOCAL, contenido: <LocalTerminalGroup tabId={tabId} onEmptyGroup={onEmptyGroup} /> },
  };
  if (chatMontado || visibleChat) {
    herramientas.chat = {
      titulo: TERMINAL_LOCAL === 'powershell' ? 'Chat (PowerShell)' : 'Chat',
      contenido: (
        <div className="chat-pane-host flex min-h-0 flex-1 flex-col">
          <ChatPane onClose={() => ocultar(tabId, 'chat')}
            terminalLocal={{ tabId, ejecutar: (c) => escribir(tabId, teclasDelComando(c)) }} />
        </div>
      ),
    };
  }
  if (hojas(arbol).includes('comandos')) {
    herramientas.comandos = {
      titulo: 'Comandos',
      acciones: <BotonIcono etiqueta="Nuevo comando" onClick={() => setPedirComando((n) => n + 1)}><Plus size={15} /></BotonIcono>,
      contenido: (
        <PanelComandos terminal={TERMINAL_LOCAL} pedirNuevo={pedirComando}
          onEjecutar={(c) => escribir(tabId, teclasDelComando(c))} onPegar={(c) => escribir(tabId, `\x15${c}`)} />
      ),
    };
  }

  return (
    <div className="h-full w-full bg-ui-fondo">
      <Mosaico arbol={arbol} onArbol={(n) => fijarArbol(tabId, n)} herramientas={herramientas}
        vacio={
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="m-0 text-[14px] font-semibold text-ui-tinta">Todo está oculto en esta terminal</p>
            <p className="m-0 max-w-[420px] text-[13px] text-ui-tinta-2">La terminal sigue abierta. Muéstrala desde «Esta sesión», en la barra lateral.</p>
            <Boton onClick={() => abrir(tabId, 'terminal')}><SquareTerminal size={14} aria-hidden /> Mostrar la terminal</Boton>
          </div>
        } />
    </div>
  );
}
