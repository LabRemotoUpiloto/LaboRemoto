// pages/rendimiento/Piezas.tsx — lo propio de Monitoreo. Las piezas generales (tarjeta, rótulos, Punto, Selector,
// Barra, botones…) viven en components/ui.
import React from 'react';
import { NOTA, RADIO } from '../../components/ui';
import { paginasVisibles, type Pagina } from './monitoreo';

/** Pie de una lista paginada: «1–15 de 214 eventos» y las páginas. */
export function Paginador<T>({ pagina, onPagina, unidad, extra }: {
  pagina: Pagina<T>;
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
