// pages/rendimiento/Piezas.tsx — piezas de Monitoreo. Solo colores de tema (utilidades mon-*, ver
// @theme inline en styles/globals.css): el color aparece solo cuando algo se sale de lo normal.
import React from 'react';
import { paginasVisibles, type Nivel, type Pagina } from './monitoreo';

export type { Nivel };

/** Tarjeta con el borde, el radio y la superficie del tema (los temas «sharp» traen 2 px y 2 px). */
export const TARJETA =
  'overflow-hidden rounded-mon border-[length:var(--card-border-width,1px)] border-mon-borde bg-mon-superficie';
export const TARJETA_APAGADA =
  'overflow-hidden rounded-mon border-[length:var(--card-border-width,1px)] border-[color-mix(in_srgb,var(--card-border-color,var(--border-color))_55%,var(--background-secondary))] bg-mon-superficie';
/** Rótulo como los de la sidebar: 10 px, mayúsculas espaciadas. */
export const ETIQUETA = 'm-0 text-[10px] font-bold uppercase tracking-[0.08em] text-mon-apagado';
export const NOTA = 'font-mon-num text-[11px] text-mon-apagado';

export const TEXTO_NIVEL: Record<Nivel, string> = {
  bien: 'text-mon-bien-texto',
  alerta: 'text-mon-alerta-texto',
  critico: 'text-mon-critico-texto',
  apagado: 'text-mon-apagado',
};
const PUNTO_NIVEL: Record<Nivel, string> = {
  bien: 'bg-mon-bien',
  alerta: 'bg-mon-alerta',
  critico: 'bg-mon-critico',
  apagado: 'bg-mon-fantasma',
};

export function Seccion({ titulo, derecha, children }: { titulo: string; derecha?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className={ETIQUETA}>{titulo}</h3>
        {derecha}
      </div>
      {children}
    </section>
  );
}

/** Punto + palabra en el color del nivel; el resto de la línea en texto normal. */
export function Punto({ nivel, fuerte, resto }: { nivel: Nivel; fuerte: string; resto?: React.ReactNode }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-[13px] text-mon-tinta-2">
      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${PUNTO_NIVEL[nivel]}`} />
      <b className={`font-bold ${TEXTO_NIVEL[nivel]}`}>{fuerte}</b>
      {resto && <span>{resto}</span>}
    </span>
  );
}

/** Botón neutro: el acento del tema queda para la navegación y no compite con «crítico». */
export function Boton({ className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex h-[34px] items-center justify-center gap-1.5 whitespace-nowrap rounded-[max(2px,calc(var(--radius-md,8px)-2px))] border-[length:var(--card-border-width,1px)] border-mon-borde bg-mon-superficie px-4 text-[13px] font-semibold text-mon-tinta transition-colors hover:enabled:bg-mon-hover disabled:cursor-not-allowed disabled:text-mon-fantasma ${className}`}
    />
  );
}

export interface Opcion<T extends string> {
  valor: T;
  etiqueta: string;
  deshabilitada?: boolean;
}

export function Selector<T extends string>({ opciones, valor, onCambio, nombre }: {
  opciones: Opcion<T>[];
  valor: T;
  onCambio: (v: T) => void;
  nombre: string;
}) {
  return (
    <div role="group" aria-label={nombre} className="inline-flex flex-wrap gap-1">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={o.valor === valor}
          disabled={o.deshabilitada}
          onClick={() => onCambio(o.valor)}
          className="h-7 rounded-[max(2px,calc(var(--radius-md,8px)-2px))] border-[length:var(--card-border-width,1px)] border-transparent px-3 text-[13px] text-mon-tinta-2 disabled:cursor-not-allowed disabled:text-mon-fantasma aria-pressed:border-mon-borde aria-pressed:bg-mon-superficie aria-pressed:font-bold aria-pressed:text-mon-tinta"
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}

/** Barra de una lectura: valor neutro (o del color del estado) y marcas donde empiezan alerta y crítico. */
export function Barra({ frac, alerta, critico, nivel, className = '' }: {
  /** 0 a 1; null = sin dato (solo la pista y las marcas). */
  frac: number | null;
  alerta?: number | null;
  critico?: number | null;
  nivel?: Nivel | null;
  className?: string;
}) {
  const relleno = nivel === 'critico' ? 'bg-mon-critico' : nivel === 'alerta' ? 'bg-mon-alerta' : 'bg-mon-tinta';
  return (
    <div className={`relative h-[3px] rounded-sm bg-mon-pista ${className}`}>
      {frac != null && (
        <i className={`absolute inset-y-0 left-0 rounded-sm ${relleno}`} style={{ width: `${Math.max(0.8, Math.min(1, frac) * 100)}%` }} />
      )}
      {alerta != null && alerta < 1 && (
        <b aria-hidden className="absolute -top-1 -ml-px h-[11px] w-0.5 bg-mon-alerta" style={{ left: `${alerta * 100}%` }} />
      )}
      {critico != null && critico < 1 && (
        <b aria-hidden className="absolute -top-1 -ml-px h-[11px] w-0.5 bg-mon-critico" style={{ left: `${critico * 100}%` }} />
      )}
    </div>
  );
}

/** Pie de una lista paginada: «1–15 de 214 eventos» y las páginas. */
export function Paginador<T>({ pagina, onPagina, unidad, extra }: {
  pagina: Pagina<T>;
  onPagina: (p: number) => void;
  unidad: string;
  extra?: React.ReactNode;
}) {
  const boton = 'inline-flex h-7 min-w-[30px] items-center justify-center rounded-[max(2px,calc(var(--radius-md,8px)-2px))] border-[length:var(--card-border-width,1px)] border-transparent font-mon-num text-[13px]';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-mon-pista px-6 py-3">
      <span className={NOTA + ' text-xs'}>
        {pagina.total ? `${pagina.desde}–${pagina.hasta} de ${pagina.total} ${unidad}` : `0 ${unidad}`}
        {extra}
      </span>
      {pagina.paginas > 1 && (
        <nav aria-label="Páginas" className="flex gap-1">
          <button type="button" aria-label="Página anterior" disabled={pagina.pagina === 1} onClick={() => onPagina(pagina.pagina - 1)}
            className={`${boton} cursor-pointer text-mon-tinta-2 disabled:cursor-default disabled:text-mon-fantasma`}>‹</button>
          {paginasVisibles(pagina.pagina, pagina.paginas).map((p, i) =>
            p === '…' ? (
              <span key={`s${i}`} className={`${boton} text-mon-fantasma`}>…</span>
            ) : (
              <button key={p} type="button" aria-current={p === pagina.pagina ? 'page' : undefined} onClick={() => onPagina(p)}
                className={`${boton} cursor-pointer text-mon-tinta-2 aria-[current=page]:border-mon-borde aria-[current=page]:bg-mon-superficie aria-[current=page]:font-bold aria-[current=page]:text-mon-tinta`}>
                {p}
              </button>
            ),
          )}
          <button type="button" aria-label="Página siguiente" disabled={pagina.pagina === pagina.paginas} onClick={() => onPagina(pagina.pagina + 1)}
            className={`${boton} cursor-pointer text-mon-tinta-2 disabled:cursor-default disabled:text-mon-fantasma`}>›</button>
        </nav>
      )}
    </div>
  );
}
