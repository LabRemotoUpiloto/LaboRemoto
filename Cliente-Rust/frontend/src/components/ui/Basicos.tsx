// components/ui/Basicos.tsx — piezas de lectura: sección con rótulo, estado con punto, selector, barras y cifras.
import React from 'react';
import { ETIQUETA, PUNTO_NIVEL, RADIO, TEXTO_NIVEL, type Nivel } from './estilos';

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
    <span className="inline-flex flex-wrap items-center gap-2 text-[13px] text-ui-tinta-2">
      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${PUNTO_NIVEL[nivel]}`} />
      <b className={`font-bold ${TEXTO_NIVEL[nivel]}`}>{fuerte}</b>
      {resto && <span>{resto}</span>}
    </span>
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
          className={`h-7 ${RADIO} border-[length:var(--card-border-width,1px)] border-transparent px-3 text-[13px] text-ui-tinta-2 hover:enabled:bg-ui-hover disabled:cursor-not-allowed disabled:text-ui-fantasma aria-pressed:border-ui-borde aria-pressed:bg-ui-superficie aria-pressed:font-bold aria-pressed:text-ui-tinta`}
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
  const relleno = nivel === 'critico' ? 'bg-ui-critico' : nivel === 'alerta' ? 'bg-ui-alerta' : 'bg-ui-tinta';
  return (
    <div className={`relative h-[3px] rounded-sm bg-ui-pista ${className}`}>
      {frac != null && (
        <i className={`absolute inset-y-0 left-0 rounded-sm ${relleno}`} style={{ width: `${Math.max(0.8, Math.min(1, frac) * 100)}%` }} />
      )}
      {alerta != null && alerta < 1 && (
        <b aria-hidden className="absolute -top-1 -ml-px h-[11px] w-0.5 bg-ui-alerta" style={{ left: `${alerta * 100}%` }} />
      )}
      {critico != null && critico < 1 && (
        <b aria-hidden className="absolute -top-1 -ml-px h-[11px] w-0.5 bg-ui-critico" style={{ left: `${critico * 100}%` }} />
      )}
    </div>
  );
}

/** Barra de proporción en el acento: para comparar cantidades entre sí (no es un estado). */
export function BarraAcento({ frac }: { frac: number }) {
  return (
    <div className="relative h-1 rounded-sm bg-ui-pista">
      <i className="absolute inset-y-0 left-0 rounded-sm bg-ui-acento-texto" style={{ width: `${Math.max(1.5, Math.min(1, frac) * 100)}%` }} />
    </div>
  );
}

/** Número o dato de máquina (IP, duración, hora) en el monoespaciado del tema. «acento» para la cifra que importa. */
export function Num({ children, fuerte, acento }: { children: React.ReactNode; fuerte?: boolean; acento?: boolean }) {
  return (
    <span className={`font-ui-num tabular-nums ${acento ? 'font-bold text-ui-acento-texto' : fuerte ? 'font-bold text-ui-tinta' : ''}`}>
      {children}
    </span>
  );
}
