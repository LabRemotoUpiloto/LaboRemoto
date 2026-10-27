// components/ui/Botones.tsx — cuatro botones para toda la app: secundario, principal (uno por pantalla),
// de ícono (acciones de una fila) y de peligro (lo que no se deshace).
import React from 'react';
import { RADIO } from './estilos';

type PropsBoton = React.ButtonHTMLAttributes<HTMLButtonElement>;
const BASE = `inline-flex h-[34px] items-center justify-center gap-1.5 whitespace-nowrap ${RADIO} border-[length:var(--card-border-width,1px)] px-4 text-[13px] font-semibold transition-colors`;

/** Secundario: borde neutro; con el mouse encima, borde y texto en el acento. */
export function Boton({ className = '', ...props }: PropsBoton) {
  return (
    <button type="button" {...props}
      className={`${BASE} border-ui-borde bg-ui-superficie text-ui-tinta hover:enabled:border-ui-acento-texto hover:enabled:text-ui-acento-texto disabled:cursor-not-allowed disabled:text-ui-fantasma ${className}`} />
  );
}

/** Principal: uno por pantalla como mucho, relleno con el acento del tema. */
export function BotonPrincipal({ className = '', ...props }: PropsBoton) {
  return (
    <button type="button" {...props}
      className={`${BASE} border-ui-acento bg-ui-acento text-[var(--accent-contrast,var(--text-inverse,#fff))] hover:enabled:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 ${className}`} />
  );
}

/** Peligro: para acciones que no se deshacen (borrar). */
export function BotonPeligro({ className = '', ...props }: PropsBoton) {
  return (
    <button type="button" {...props}
      className={`${BASE} border-ui-critico bg-ui-critico text-white hover:enabled:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 ${className}`} />
  );
}

/** De ícono: apagado; con el mouse encima, en el acento. `etiqueta` es obligatoria: es lo que lee el lector de pantalla. */
export function BotonIcono({ etiqueta, children, className = '', ...props }: PropsBoton & { etiqueta: string }) {
  return (
    <button type="button" aria-label={etiqueta} title={etiqueta} {...props}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center ${RADIO} text-ui-apagado transition-colors hover:bg-[color-mix(in_srgb,var(--accent-primary)_9%,transparent)] hover:text-ui-acento-texto ${className}`}>
      {children}
    </button>
  );
}
