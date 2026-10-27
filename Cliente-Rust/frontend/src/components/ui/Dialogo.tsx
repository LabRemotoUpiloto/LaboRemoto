// components/ui/Dialogo.tsx — diálogo accesible: atrapa el foco, Esc lo cierra y al cerrar el foco vuelve a donde estaba.
import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { BotonIcono } from './Botones';
import { TARJETA } from './estilos';

const ENFOCABLES = 'button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])';

export function Dialogo({ titulo, descripcion, children, acciones, ancho = 'w-[480px]', onCerrar }: {
  titulo: string;
  descripcion?: React.ReactNode;
  children?: React.ReactNode;
  /** Botones de abajo a la derecha; el primero (Cancelar) recibe el foco si no hay campos. */
  acciones: React.ReactNode;
  ancho?: string;
  onCerrar: () => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  // la función puede cambiar en cada render del padre: el efecto no debe reiniciarse por eso
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;

  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    const enfocables = () => [...(caja.current?.querySelectorAll<HTMLElement>(ENFOCABLES) ?? [])].filter((e) => !e.hasAttribute('disabled'));
    // primer campo si hay formulario; si no, la primera acción (Cancelar), nunca la que borra
    (caja.current?.querySelector<HTMLElement>('input, textarea, select')
      ?? enfocables().find((e) => e.closest('[data-acciones]')))?.focus();
    // con dos diálogos abiertos, el de arriba es el último en el documento: solo ese atiende el teclado
    const esElDeArriba = () => {
      const todos = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      return todos[todos.length - 1] === caja.current;
    };
    const tecla = (ev: KeyboardEvent) => {
      if (!esElDeArriba()) return;
      if (ev.key === 'Escape') {
        // si un menú o select de adentro ya usó el Esc, no se cierra el diálogo
        if (ev.defaultPrevented || ev.isComposing) return;
        ev.preventDefault();
        cerrar.current();
        return;
      }
      if (ev.key !== 'Tab') return;
      const lista = enfocables();
      if (!lista.length) return;
      const primero = lista[0], ultimo = lista[lista.length - 1];
      const dentro = caja.current?.contains(document.activeElement) ?? false;
      // si el foco quedó afuera (clic en el fondo o en un área no enfocable), vuelve al diálogo
      if (!dentro) { ev.preventDefault(); (ev.shiftKey ? ultimo : primero).focus(); }
      else if (ev.shiftKey && document.activeElement === primero) { ev.preventDefault(); ultimo.focus(); }
      else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primero.focus(); }
    };
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('keydown', tecla); antes?.focus(); };
  }, []);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[color-mix(in_srgb,var(--text-primary)_38%,transparent)]">
      <div ref={caja} role="dialog" aria-modal="true" aria-labelledby={idTitulo}
        className={`${TARJETA} ${ancho} flex max-w-[calc(100vw-32px)] flex-col shadow-[0_12px_40px_rgba(0,0,0,0.22)]`}>
        <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-5">
          <div className="flex flex-col gap-1">
            <h2 id={idTitulo} className="m-0 font-ui-titulo text-[17px] font-bold text-ui-tinta">{titulo}</h2>
            {descripcion && <p className="m-0 text-[13px] text-ui-tinta-2">{descripcion}</p>}
          </div>
          <BotonIcono etiqueta="Cerrar" onClick={() => cerrar.current()}><X size={16} /></BotonIcono>
        </div>
        {children && <div className="flex flex-col gap-4 px-6 py-3">{children}</div>}
        <div data-acciones className="flex justify-end gap-2 px-6 pb-5 pt-3">{acciones}</div>
      </div>
    </div>
  );
}
