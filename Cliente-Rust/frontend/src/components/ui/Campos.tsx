// components/ui/Campos.tsx — buscador, campo de formulario y desplegable. Borde que se ve (≥ 3:1) y foco en el acento.
import React from 'react';
import { ChevronDown } from 'lucide-react';
import { RADIO } from './estilos';

const BORDE = 'border-[length:var(--card-border-width,1px)] border-ui-borde-campo bg-ui-superficie transition-colors hover:border-ui-tinta-2';

/** Buscador con ícono adentro: el anillo de foco rodea la caja completa (data-anillo, ver globals.css); el input no dibuja el suyo. */
export function Buscador({ valor, onCambio, placeholder, ancho = 'w-[220px]', icono: Icono, etiqueta }: {
  valor: string;
  onCambio: (v: string) => void;
  placeholder: string;
  ancho?: string;
  icono: React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>;
  /** Lo que lee el lector de pantalla; por defecto, el placeholder. */
  etiqueta?: string;
}) {
  return (
    <label data-anillo className={`flex h-8 items-center gap-2 ${RADIO} ${BORDE} px-2.5`}>
      <Icono size={14} className="shrink-0 text-ui-apagado" aria-hidden />
      <input
        type="text"
        aria-label={etiqueta ?? placeholder}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder={placeholder}
        className={`${ancho} bg-transparent text-[13px] text-ui-tinta outline-none placeholder:text-ui-apagado`}
      />
    </label>
  );
}

type PropsCampo = {
  etiqueta: string;
  /** Monoespaciado: hosts, puertos, usuarios, comandos. */
  mono?: boolean;
  /** Algo dentro del campo, a la derecha (p. ej. mostrar la contraseña). */
  derecha?: React.ReactNode;
  className?: string;
};

/** Campo de formulario: rótulo arriba (asociado al campo), borde neutro y foco en el acento. Con `filas`, es un textarea. */
export function Campo({ etiqueta, mono, derecha, className = '', filas, ...props }: PropsCampo & { filas?: number } &
  React.InputHTMLAttributes<HTMLInputElement> & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  // sin outline-none: el anillo de foco (globals.css, capa base) es el único indicador
  const base = `w-full ${RADIO} ${BORDE} px-3 text-[13px] text-ui-tinta placeholder:text-ui-apagado ${mono ? 'font-ui-num' : ''}`;
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-[12px] font-semibold text-ui-tinta-2">{etiqueta}</span>
      <span className="relative flex items-center">
        {filas
          ? <textarea rows={filas} {...(props as React.TextareaHTMLAttributes<HTMLTextAreaElement>)} className={`${base} resize-none py-2`} />
          : <input {...(props as React.InputHTMLAttributes<HTMLInputElement>)} className={`${base} h-9 ${derecha ? 'pr-10' : ''}`} />}
        {derecha && <span className="absolute right-2 flex">{derecha}</span>}
      </span>
    </label>
  );
}

/** Desplegable nativo con la forma de los campos: teclado y lector de pantalla sin piezas extra. */
export function Desplegable<T extends string>({ etiqueta, valor, onCambio, opciones, className = '' }: {
  /** Lo que lee el lector de pantalla. */
  etiqueta: string;
  valor: T;
  onCambio: (v: T) => void;
  opciones: { valor: T; etiqueta: string; deshabilitada?: boolean }[];
  className?: string;
}) {
  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <select
        aria-label={etiqueta}
        value={valor}
        onChange={(e) => onCambio(e.target.value as T)}
        className={`h-8 w-full cursor-pointer appearance-none ${RADIO} border-[length:var(--card-border-width,1px)] border-ui-borde-campo bg-ui-superficie pl-3 pr-8 text-[13px] text-ui-tinta transition-colors hover:border-ui-acento-texto [&>option]:bg-ui-superficie [&>option]:text-ui-tinta`}
      >
        {opciones.map((o) => <option key={o.valor} value={o.valor} disabled={o.deshabilitada}>{o.etiqueta}</option>)}
      </select>
      <ChevronDown size={14} aria-hidden className="pointer-events-none absolute right-2.5 text-ui-apagado" />
    </span>
  );
}
