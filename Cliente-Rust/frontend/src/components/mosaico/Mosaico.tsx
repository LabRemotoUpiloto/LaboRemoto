// components/mosaico/Mosaico.tsx — paneles que se abren, se ocultan, se mueven arrastrando su barra y se redimensionan con
// los separadores (react-resizable-panels, como la terminal local).
//
// Montaje estable: cada panel vive en un <div> «host» creado una sola vez; el árbol solo lo cambia de lugar con appendChild.
// Así mover u ocultar un panel no lo desmonta: la terminal, el chat o el escritorio remoto siguen vivos con su estado.
// Un panel oculto queda con su host fuera del documento; quien lo usa decide si pausa algo (ver `visibles` en la sesión).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { GripVertical, X } from 'lucide-react';
import { RADIO } from '@/components/ui/estilos';
import { conTamanos, mover, quitar, type Lado, type Nodo } from './arbol';

export interface Herramienta {
  titulo: string;
  /** Botones de la barra del panel, a la derecha del título. */
  acciones?: React.ReactNode;
  /** Lo que se dibuja dentro (se monta una vez, con un portal). */
  contenido?: React.ReactNode;
  /** O un elemento ya montado por quien llama (p. ej. la terminal, que también usa la vista de práctica). */
  elemento?: HTMLElement;
  /** Clase del cuerpo del panel (p. ej. `terminal-stack`, que busca el recorrido guiado). */
  claseCuerpo?: string;
}

interface Arrastre { id: string; destino: string | null; lado: Lado | null }

const LADOS: Record<Lado, { pos: string; texto: string }> = {
  izquierda: { pos: 'inset-y-0 left-0 w-1/2', texto: 'Soltar a la izquierda' },
  derecha: { pos: 'inset-y-0 right-0 w-1/2', texto: 'Soltar a la derecha' },
  arriba: { pos: 'inset-x-0 top-0 h-1/2', texto: 'Soltar arriba' },
  abajo: { pos: 'inset-x-0 bottom-0 h-1/2', texto: 'Soltar abajo' },
  centro: { pos: 'inset-0', texto: 'Intercambiar' },
};

/** El lado de un panel según dónde está el puntero: los bordes (un cuarto) eligen el lado, el centro intercambia. */
export function ladoBajo(x: number, y: number): Lado {
  return x < 0.25 ? 'izquierda' : x > 0.75 ? 'derecha' : y < 0.25 ? 'arriba' : y > 0.75 ? 'abajo' : 'centro';
}

const BOTON_BARRA = `flex h-6 w-6 items-center justify-center ${RADIO} text-ui-apagado hover:bg-[color-mix(in_srgb,var(--accent-primary)_9%,transparent)] hover:text-ui-acento-texto`;

export function Mosaico({ arbol, onArbol, herramientas, vacio }: {
  /** null = no hay ningún panel abierto. */
  arbol: Nodo | null;
  onArbol: (n: Nodo | null) => void;
  /** Todas las herramientas que se mantienen montadas, abiertas u ocultas. */
  herramientas: Record<string, Herramienta>;
  /** Lo que se ve cuando no hay ningún panel abierto. */
  vacio: React.ReactNode;
}) {
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const hostsRef = useRef(new Map<string, HTMLElement>());
  const host = useCallback((id: string) => {
    const propio = herramientas[id]?.elemento;
    if (propio) return propio;
    let el = hostsRef.current.get(id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'flex h-full min-h-0 w-full min-w-0 flex-col';
      hostsRef.current.set(id, el);
    }
    return el;
  }, [herramientas]);

  // Al cambiar el acomodo, xterm y los videos tienen que volver a medir su caja (mismo truco que la cámara de antes).
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
    return () => clearTimeout(t);
  }, [arbol]);

  // Arrastre con el puntero: el agarre de la barra lo inicia; el panel y el lado bajo el puntero dicen dónde cae.
  useEffect(() => {
    if (!arrastre) return;
    const mueve = (e: PointerEvent) => {
      const bajo = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-panel-mosaico]');
      if (!bajo) { setArrastre((a) => a && { ...a, destino: null, lado: null }); return; }
      const r = bajo.getBoundingClientRect();
      setArrastre((a) => a && { ...a, destino: bajo.dataset.panelMosaico!, lado: ladoBajo((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height) });
    };
    const suelta = () => {
      if (arbol && arrastre.destino && arrastre.lado && arrastre.destino !== arrastre.id) {
        onArbol(mover(arbol, arrastre.id, arrastre.destino, arrastre.lado));
      }
      setArrastre(null);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setArrastre(null); };
    window.addEventListener('pointermove', mueve);
    window.addEventListener('pointerup', suelta);
    window.addEventListener('keydown', tecla);
    return () => {
      window.removeEventListener('pointermove', mueve);
      window.removeEventListener('pointerup', suelta);
      window.removeEventListener('keydown', tecla);
    };
  }, [arrastre, arbol, onArbol]);

  const dibujar = (n: Nodo): React.ReactNode => {
    if (n.tipo === 'hoja') {
      const h = herramientas[n.id];
      const soy = arrastre?.id === n.id;
      const lado = arrastre && arrastre.destino === n.id && !soy ? arrastre.lado : null;
      return (
        <section data-panel-mosaico={n.id} aria-label={h?.titulo}
          className={`relative flex h-full w-full min-w-0 flex-col overflow-hidden ${RADIO} border-[length:var(--card-border-width,1px)] border-ui-borde bg-ui-superficie ${soy ? 'opacity-50' : ''}`}>
          <header className="flex h-8 shrink-0 items-center gap-1.5 border-b border-ui-pista pl-1.5 pr-1">
            <button type="button" aria-label={`Mover ${h?.titulo ?? ''}`} title="Arrastra para mover"
              onPointerDown={(e) => { e.preventDefault(); setArrastre({ id: n.id, destino: null, lado: null }); }}
              className="flex h-6 w-5 cursor-grab items-center justify-center text-ui-apagado hover:text-ui-tinta active:cursor-grabbing">
              <GripVertical size={14} aria-hidden />
            </button>
            <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ui-tinta">{h?.titulo}</span>
            {h?.acciones}
            {/* Ocultar: sale del mosaico pero sigue montado (la terminal no cierra la sesión) */}
            <button type="button" aria-label={`Ocultar ${h?.titulo ?? ''}`} title="Ocultar"
              onClick={() => onArbol(quitar(arbol, n.id))} className={BOTON_BARRA}>
              <X size={14} aria-hidden />
            </button>
          </header>
          <div className={`relative flex min-h-0 flex-1 flex-col ${h?.claseCuerpo ?? ''}`}
            ref={(el) => { if (el) { const hh = host(n.id); if (hh.parentElement !== el) el.appendChild(hh); } }} />
          {lado && (
            <div className={`pointer-events-none absolute ${LADOS[lado].pos} z-10 flex items-center justify-center ${RADIO} border-2 border-dashed border-ui-acento bg-[color-mix(in_srgb,var(--accent-primary)_14%,transparent)]`}>
              <span className={`${RADIO} bg-ui-superficie px-2.5 py-1 text-[12px] font-semibold text-ui-acento-texto shadow-sm`}>{LADOS[lado].texto}</span>
            </div>
          )}
        </section>
      );
    }
    return (
      <Group orientation={n.direccion} className="h-full w-full"
        onLayoutChanged={(layout, meta) => {
          if (!meta.isUserInteraction || !arbol) return;
          onArbol(conTamanos(arbol, n.id, n.hijos.map((h) => layout[h.id] ?? 0)));
        }}>
        {n.hijos.map((hijo, i) => (
          <React.Fragment key={hijo.id}>
            {i > 0 && (
              <Separator className={`group relative flex shrink-0 items-center justify-center ${n.direccion === 'horizontal' ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize'}`}>
                <span className={`rounded-full transition-colors group-hover:bg-ui-acento group-data-[drag]:bg-ui-acento ${n.direccion === 'horizontal' ? 'h-10 w-[3px]' : 'h-[3px] w-10'}`} />
              </Separator>
            )}
            <Panel id={hijo.id} defaultSize={n.tamanos?.[i] != null ? `${n.tamanos[i]}%` : undefined} minSize={160} className="flex min-h-0 min-w-0">
              {dibujar(hijo)}
            </Panel>
          </React.Fragment>
        ))}
      </Group>
    );
  };

  return (
    <div className={`flex h-full w-full min-h-0 min-w-0 p-2 ${arrastre ? 'select-none' : ''}`}>
      {arbol ? dibujar(arbol) : vacio}
      {Object.entries(herramientas).map(([id, h]) => (h.contenido && !h.elemento ? createPortal(h.contenido, host(id), id) : null))}
    </div>
  );
}
