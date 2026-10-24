// components/ui/Paginador.tsx — listas paginadas: el cálculo de la página y el pie con las páginas.
import React from 'react';
import { NOTA, RADIO } from './estilos';

export interface PaginaDeLista<T> {
  filas: T[];
  /** Página mostrada (1 en adelante), ya ajustada si la pedida no existe. */
  pagina: number;
  paginas: number;
  total: number;
  /** Posición de la primera y la última fila mostradas (1 en adelante), para «1–15 de 214». */
  desde: number;
  hasta: number;
}

export function paginar<T>(items: T[], pagina: number, porPagina: number): PaginaDeLista<T> {
  const total = items.length;
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const p = Math.min(Math.max(1, Math.floor(pagina) || 1), paginas);
  const inicio = (p - 1) * porPagina;
  const filas = items.slice(inicio, inicio + porPagina);
  return { filas, pagina: p, paginas, total, desde: total ? inicio + 1 : 0, hasta: inicio + filas.length };
}

/** Números de página a mostrar: siempre la primera, la última y las vecinas de la actual; «…» en los saltos. */
export function paginasVisibles(actual: number, paginas: number): (number | '…')[] {
  const vistas = new Set([1, paginas, actual - 1, actual, actual + 1].filter((p) => p >= 1 && p <= paginas));
  if (actual <= 3) [2, 3].forEach((p) => p <= paginas && vistas.add(p));
  if (actual >= paginas - 2) [paginas - 1, paginas - 2].forEach((p) => p >= 1 && vistas.add(p));
  const orden = [...vistas].sort((a, b) => a - b);
  const salida: (number | '…')[] = [];
  orden.forEach((p, i) => {
    if (i && p - orden[i - 1] > 1) salida.push('…');
    salida.push(p);
  });
  return salida;
}

/** Pie de una lista paginada: «1–15 de 214 eventos» y las páginas. */
export function Paginador<T>({ pagina, onPagina, unidad, extra }: {
  pagina: PaginaDeLista<T>;
  onPagina: (p: number) => void;
  unidad: string;
  extra?: React.ReactNode;
}) {
  const boton = `inline-flex h-7 min-w-[30px] items-center justify-center ${RADIO} border-[length:var(--card-border-width,1px)] border-transparent font-ui-num text-[13px]`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ui-pista px-6 py-3">
      <span className={NOTA + ' text-xs'}>
        {pagina.total ? `${pagina.desde}–${pagina.hasta} de ${pagina.total} ${unidad}` : `0 ${unidad}`}
        {extra}
      </span>
      {pagina.paginas > 1 && (
        <nav aria-label="Páginas" className="flex gap-1">
          <button type="button" aria-label="Página anterior" disabled={pagina.pagina === 1} onClick={() => onPagina(pagina.pagina - 1)}
            className={`${boton} cursor-pointer text-ui-tinta-2 disabled:cursor-default disabled:text-ui-fantasma`}>‹</button>
          {paginasVisibles(pagina.pagina, pagina.paginas).map((p, i) =>
            p === '…' ? (
              <span key={`s${i}`} className={`${boton} text-ui-fantasma`}>…</span>
            ) : (
              <button key={p} type="button" aria-current={p === pagina.pagina ? 'page' : undefined} onClick={() => onPagina(p)}
                className={`${boton} cursor-pointer text-ui-tinta-2 aria-[current=page]:border-ui-borde aria-[current=page]:bg-ui-superficie aria-[current=page]:font-bold aria-[current=page]:text-ui-tinta`}>
                {p}
              </button>
            ),
          )}
          <button type="button" aria-label="Página siguiente" disabled={pagina.pagina === pagina.paginas} onClick={() => onPagina(pagina.pagina + 1)}
            className={`${boton} cursor-pointer text-ui-tinta-2 disabled:cursor-default disabled:text-ui-fantasma`}>›</button>
        </nav>
      )}
    </div>
  );
}
