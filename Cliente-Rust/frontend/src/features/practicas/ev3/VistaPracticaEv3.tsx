// features/practicas/ev3/VistaPracticaEv3.tsx — vista guiada de una práctica de EV3 (rediseño, fase 1).
//
// La pantalla la dominan dos cosas: el escenario del robot (cámara en vivo o gemelo 3D, grande y al centro) y la guía
// (el chat de la práctica, a la derecha como en Linux). Las herramientas del robot esperan en un riel y se abren de a
// una en un cajón, según lo que necesita cada módulo (necesidadesEv3.ts). «Ver todo» vuelve a la vista completa de
// siempre (VistaPractica en sesion/TerminalView.tsx): terminal, cámara arriba y Panel EV3.
//
// La terminal SSH de la sesión sigue montada debajo del escenario, invisible: así no se reinicia al pasar a «Ver todo»
// y xterm conserva su tamaño.
import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Selector, type Opcion } from '@/components/ui';
import ChatPane from '@/features/chat/ChatPane';
import CameraGrid from '@/features/camaras/CameraGrid';
import { Ev3Twin } from '@/app/diferidos';
import { useEv3Estado } from '@/features/hardware/ev3/useEv3Estado';
import type { LinuxPracticeSessionApi } from '@/features/practicas/useLinuxPracticeSession';
import type { ProgresoPractica } from '@/features/practicas/linux/LinuxPracticeProgressBar';
import { necesidadesDe, type HerramientaEv3, type VistaEscenario } from './necesidadesEv3';
import { RielHerramientas } from './RielHerramientas';
import { ANCHO_CAJON, CajonEv3 } from './CajonEv3';
import { BarraMisionEv3 } from './BarraMisionEv3';
import { ANCHO_GUIA, repartoAncho } from './repartoAncho';

const OPCIONES_ESCENARIO: Opcion<VistaEscenario>[] = [
  { valor: 'camara', etiqueta: 'Robot real' },
  { valor: 'gemelo', etiqueta: 'Gemelo 3D' },
];

interface Props {
  sessionId: string;
  practiceId: string;
  terminalHost: HTMLElement;
  isTabActive: boolean;
  isChatOpen: boolean;
  onCloseChat: () => void;
  linuxSession?: LinuxPracticeSessionApi;
  escenario: VistaEscenario;
  onCambiarEscenario: (v: VistaEscenario) => void;
  onVerTodo: () => void;
}

export const VistaPracticaEv3: React.FC<Props> = ({
  sessionId, practiceId, terminalHost, isTabActive, isChatOpen, onCloseChat, linuxSession,
  escenario, onCambiarEscenario, onVerTodo,
}) => {
  const { status, setSpeed, stopAll } = useEv3Estado(sessionId);
  const herramientasDeclaradas = linuxSession?.sessionPanels[sessionId]?.tools;
  const necesidades = useMemo(
    () => necesidadesDe(practiceId, herramientasDeclaradas),
    [practiceId, herramientasDeclaradas],
  );

  // Al entrar solo se abre la herramienta principal del módulo, si tiene una.
  const [abierta, setAbierta] = useState<HerramientaEv3 | null>(necesidades.abierta);
  useEffect(() => { setAbierta(necesidades.abierta); }, [practiceId, necesidades.abierta]);
  const alternar = (h: HerramientaEv3) => setAbierta((actual) => (actual === h ? null : h));

  // Lo reporta el chat: título de la práctica y el paso en que va (el mismo conteo que la guía).
  const [progreso, setProgreso] = useState<ProgresoPractica | null>(null);
  const resultado = linuxSession?.results[practiceId] ?? null;

  // Guía redimensionable, como en la vista de Linux.
  const [anchoGuia, setAnchoGuia] = useState(ANCHO_GUIA.inicial);
  const [redimensionando, setRedimensionando] = useState(false);
  useEffect(() => {
    if (!redimensionando) return;
    const mover = (e: MouseEvent) => {
      setAnchoGuia(Math.max(ANCHO_GUIA.min, Math.min(ANCHO_GUIA.max, window.innerWidth - e.clientX)));
    };
    const soltar = () => setRedimensionando(false);
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', soltar);
    return () => { window.removeEventListener('mousemove', mover); window.removeEventListener('mouseup', soltar); };
  }, [redimensionando]);

  // Ancho disponible de la fila (escenario + cajón + riel + guía), para decidir el reparto.
  const filaRef = useRef<HTMLDivElement | null>(null);
  const [anchoFila, setAnchoFila] = useState(Number.POSITIVE_INFINITY);
  useLayoutEffect(() => {
    const el = filaRef.current;
    if (!el) return;
    // Se mide al montar y con cada cambio de la ventana; el observador cubre lo demás (la barra lateral que se pliega).
    const medir = () => setAnchoFila(el.getBoundingClientRect().width);
    medir();
    window.addEventListener('resize', medir);
    const obs = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(medir);
    obs?.observe(el);
    return () => { window.removeEventListener('resize', medir); obs?.disconnect(); };
  }, []);
  const reparto = repartoAncho(anchoFila, anchoGuia, isChatOpen, abierta ? ANCHO_CAJON[abierta] : 0);

  // Abrir o cerrar el cajón o la guía cambia el ancho del escenario: la cámara, el gemelo y xterm se reajustan.
  useEffect(() => {
    const t = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    return () => window.clearTimeout(t);
  }, [abierta, isChatOpen]);

  return (
    <div className={`flex h-full w-full min-h-0 flex-col ${redimensionando ? 'cursor-col-resize select-none' : ''}`}>
      <BarraMisionEv3
        progreso={progreso}
        completa={!!resultado?.passed}
        robotConectado={!!status?.connected}
        onDetener={stopAll}
      />

      <div ref={filaRef} className="relative flex min-h-0 flex-1">
        {/* ── Escenario ── */}
        <section aria-label="Escenario del robot" className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-ui-fondo">
          <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
            <Selector opciones={OPCIONES_ESCENARIO} valor={escenario} onCambio={onCambiarEscenario} nombre="Vista del escenario" />
          </div>
          <div className="relative mx-3 mb-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-ui border border-ui-borde bg-ui-superficie">
            {/* Terminal de la sesión: montada pero invisible (ver encabezado). */}
            <div
              aria-hidden
              className="pointer-events-none invisible absolute inset-0 flex flex-col"
              ref={(el) => { if (el && terminalHost.parentElement !== el) el.prepend(terminalHost); }}
            />
            {escenario === 'camara' ? (
              <div className="relative flex min-h-0 flex-1 flex-col">
                {/* El robot es lo central de la pantalla: la cámara se conecta sola, sin pedir un clic. */}
                <CameraGrid sessionId={sessionId} isActive={isTabActive} autoStart />
              </div>
            ) : (
              <div className="relative flex min-h-0 flex-1 flex-col">
                <Suspense fallback={<p className="m-0 p-4 text-[13px] text-ui-apagado" role="status">Cargando el modelo 3D…</p>}>
                  <Ev3Twin status={status} />
                </Suspense>
              </div>
            )}
          </div>
        </section>

        <CajonEv3
          sessionId={sessionId}
          abierta={abierta}
          superpuesto={reparto.cajonFlota ? { derecha: reparto.derecha } : null}
          estado={abierta ? necesidades.herramientas[abierta] : null}
          conConsola={necesidades.herramientas.consola !== 'oculta'}
          status={status}
          onSetSpeed={setSpeed}
          onCerrar={() => setAbierta(null)}
        />

        <RielHerramientas necesidades={necesidades} abierta={abierta} onAlternar={alternar} onVerTodo={onVerTodo} />

        {/* ── Guía: el chat de la práctica ── */}
        {isChatOpen && (
          <>
            <div className="side-resizer" onMouseDown={() => setRedimensionando(true)} />
            <div data-tour="practica-chat" className="flex min-h-0 shrink-0 flex-col" style={{ width: reparto.guia }}>
              <ChatPane
                sessionId={sessionId}
                onClose={onCloseChat}
                practiceId={practiceId}
                practiceResult={resultado}
                linuxSession={linuxSession}
                onProgresoPractica={setProgreso}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
