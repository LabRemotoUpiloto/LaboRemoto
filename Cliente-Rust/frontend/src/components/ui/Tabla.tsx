// components/ui/Tabla.tsx — tabla de lectura y su versión «cargando».
import React from 'react';
import { ETIQUETA, FILA, TARJETA } from './estilos';

export interface Columna {
  titulo: string;
  /** Números y fechas van alineados a la derecha. */
  derecha?: boolean;
}

/** Tabla de lectura: cabecera como rótulo, filas separadas por línea, sin cajas dentro de cajas. */
export function Tabla({ columnas, filas, plantilla, claves }: {
  columnas: Columna[];
  filas: React.ReactNode[][];
  /** grid-template-columns de Tailwind, p. ej. 'grid-cols-[1fr_90px_120px]'. */
  plantilla: string;
  /** Clave estable de cada fila (si no, se usa la posición). */
  claves?: string[];
}) {
  return (
    <div className={TARJETA} role="table">
      <div role="row" className={`grid ${plantilla} gap-4 border-b border-ui-borde px-5 py-2.5`}>
        {columnas.map((c, k) => (
          <span key={k} role="columnheader" className={`${ETIQUETA} ${c.derecha ? 'text-right' : ''}`}>{c.titulo}</span>
        ))}
      </div>
      {filas.map((f, i) => (
        <div key={claves?.[i] ?? i} role="row" className={`grid ${plantilla} items-center gap-4 px-5 py-2.5 ${FILA} ${i ? 'border-t border-ui-pista' : ''}`}>
          {f.map((celda, j) => (
            <span key={j} role="cell" className={`min-w-0 ${columnas[j]?.derecha ? 'text-right' : ''}`}>{celda}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

const ANCHOS = ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/12', 'w-7/12'];

/** Mientras carga: la misma forma de la tabla con barras quietas (sin brillo animado) y aviso para lectores de pantalla. */
export function FilasCargando({ plantilla, columnas, filas = 6 }: { plantilla: string; columnas: number; filas?: number }) {
  return (
    <div className={TARJETA} role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div aria-hidden className={`grid ${plantilla} gap-4 border-b border-ui-borde px-5 py-3`}>
        {Array.from({ length: columnas }, (_, j) => <span key={j} className="h-2 w-12 rounded-sm bg-ui-pista" />)}
      </div>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} aria-hidden className={`grid ${plantilla} items-center gap-4 px-5 py-3.5 ${i ? 'border-t border-ui-pista' : ''}`}>
          {Array.from({ length: columnas }, (_, j) => <span key={j} className={`h-2.5 rounded-sm bg-ui-pista ${ANCHOS[(i + j) % ANCHOS.length]}`} />)}
        </div>
      ))}
    </div>
  );
}
