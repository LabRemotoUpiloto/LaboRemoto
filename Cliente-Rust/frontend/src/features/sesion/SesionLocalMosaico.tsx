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
import { localTermShell } from '@/features/terminal/localTerminal.service';
import type { ShellLocal } from '@/bindings/ShellLocal';
import LocalTerminalGroup from '@/features/terminal/LocalTerminalGroup';
import ChatPane from '@/features/chat/ChatPane';
import { teclasDelComando } from '@/features/practicas/linux/ejecutarComando';
import { abrir, fijarArbol, marcarVisible, ocultar, sesionQueSeVe, useArbolSesion } from './herramientasSesion';

export const EVENTO_ESCRIBIR_LOCAL = 'local-term:escribir';
export interface DetalleEscribirLocal { tabId: string; teclas: string }

/** La shell que abre la terminal local, según el backend (pwsh, Windows PowerShell, bash…). */
function useShellLocal(): ShellLocal | null {
  const [shell, setShell] = useState<ShellLocal | null>(null);
  useEffect(() => { void localTermShell().then(setShell).catch(() => setShell(null)); }, []);
  return shell;
}

const escribir = (tabId: string, teclas: string) =>
  window.dispatchEvent(new CustomEvent<DetalleEscribirLocal>(EVENTO_ESCRIBIR_LOCAL, { detail: { tabId, teclas } }));

export default function SesionLocalMosaico({ tabId, isTabActive, onEmptyGroup }: {
  tabId: string;
  isTabActive: boolean;
  onEmptyGroup: () => void;
}) {
  const arbol = useArbolSesion(tabId);
  const shell = useShellLocal();
  const conShell = (t: string) => (shell ? `${t} (${shell.nombre})` : t);
  const [pedirComando, setPedirComando] = useState(0);
  const [chatMontado, setChatMontado] = useState(false);
  const visibleChat = hojas(arbol).includes('chat');
  useEffect(() => { if (visibleChat) setChatMontado(true); }, [visibleChat]);
  useEffect(() => {
    if (isTabActive) marcarVisible(tabId);
    else if (sesionQueSeVe() === tabId) marcarVisible(null);
  }, [isTabActive, tabId]);

  const herramientas: Record<string, Herramienta> = {
    terminal: { titulo: conShell('Terminal local'), contenido: <LocalTerminalGroup tabId={tabId} onEmptyGroup={onEmptyGroup} /> },
  };
  if (chatMontado || visibleChat) {
    herramientas.chat = {
      titulo: conShell('Chat'),
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
        <PanelComandos terminal={(shell?.tipo as TipoTerminal | undefined)} pedirNuevo={pedirComando}
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
