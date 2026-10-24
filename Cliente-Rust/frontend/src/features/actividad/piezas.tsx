// features/actividad/piezas.tsx — lo que comparten las pestañas de Actividad.
export const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const hora = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
/** «21 oct 20:55» */
export const fechaCorta = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${MESES[d.getMonth()]} ${hora(d)}`; };

export interface PropsPestana {
  dias: number;
  /** Cambia cuando se pide «Actualizar» en el encabezado. */
  recarga: number;
  /** Hora de la última respuesta, para «actualizado HH:MM». */
  onActualizado: (ms: number) => void;
  /** Vuelve a pedir los datos (el mismo «Actualizar» del encabezado). */
  reintentar: () => void;
}

/** Nombre que abre o cierra el historial de la persona. */
export function PersonaBoton({ nombre, usuario, abierta, enCurso, onClick }: {
  nombre: string; usuario: string; abierta: boolean; enCurso?: string; onClick: () => void;
}) {
  return (
    <button type="button" aria-expanded={abierta} onClick={onClick} title={abierta ? 'Ocultar el historial' : 'Ver el historial'}
      className="group flex min-w-0 flex-col text-left">
      <span className="truncate font-semibold text-ui-tinta group-hover:text-ui-acento-texto group-aria-expanded:text-ui-acento-texto">
        {nombre}{enCurso && <span className="ml-2 text-[11px] font-normal text-ui-bien-texto">{enCurso}</span>}
      </span>
      {nombre !== usuario && <span className="truncate font-ui-num text-[11px] text-ui-apagado">{usuario}</span>}
    </button>
  );
}
