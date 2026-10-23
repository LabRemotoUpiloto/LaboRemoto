// components/ui/estilos.ts — clases compartidas de la interfaz. Solo colores de tema (utilidades ui-*, ver
// @theme inline en styles/globals.css): el acento marca identidad e interacción; verde/ámbar/rojo, estados.

/** Nivel de un estado: decide el color del punto y de la palabra que lo acompaña. */
export type Nivel = 'bien' | 'alerta' | 'critico' | 'apagado';

/** Tarjeta con el borde, el radio y la superficie del tema (los temas «sharp» traen 2 px y 2 px). */
export const TARJETA =
  'overflow-hidden rounded-ui border-[length:var(--card-border-width,1px)] border-ui-borde bg-ui-superficie';
export const TARJETA_APAGADA =
  'overflow-hidden rounded-ui border-[length:var(--card-border-width,1px)] border-[color-mix(in_srgb,var(--card-border-color,var(--border-color))_55%,var(--background-secondary))] bg-ui-superficie';
/** Rótulo como los de la sidebar: 10 px, mayúsculas espaciadas. */
export const ETIQUETA = 'm-0 text-[10px] font-bold uppercase tracking-[0.08em] text-ui-apagado';
export const NOTA = 'font-ui-num text-[11px] text-ui-apagado';

/** Acento mezclado con transparente: funciona en todos los temas (no todos definen --accent-primary-subtle). */
export const SUAVE = 'bg-[color-mix(in_srgb,var(--accent-primary)_9%,transparent)]';
export const HOVER_SUAVE = 'hover:bg-[color-mix(in_srgb,var(--accent-primary)_6%,transparent)]';
/** Radio de botones y campos: un poco menor que el de la tarjeta que los contiene. */
export const RADIO = 'rounded-[max(2px,calc(var(--radius-md,8px)-2px))]';
/** Fila de tabla o lista: hover con un toque del acento. */
export const FILA = `text-[13px] text-ui-tinta-2 ${HOVER_SUAVE}`;

export const TEXTO_NIVEL: Record<Nivel, string> = {
  bien: 'text-ui-bien-texto',
  alerta: 'text-ui-alerta-texto',
  critico: 'text-ui-critico-texto',
  apagado: 'text-ui-apagado',
};
export const PUNTO_NIVEL: Record<Nivel, string> = {
  bien: 'bg-ui-bien',
  alerta: 'bg-ui-alerta',
  critico: 'bg-ui-critico',
  apagado: 'bg-ui-fantasma',
};
