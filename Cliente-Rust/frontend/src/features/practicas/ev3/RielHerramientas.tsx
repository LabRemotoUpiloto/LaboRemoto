// features/practicas/ev3/RielHerramientas.tsx — riel vertical con las herramientas del robot en la práctica de EV3.
//
// Cada herramienta abre su cajón al lado del escenario (una a la vez). Las que el módulo no necesita llevan candado,
// pero se pueden abrir igual: el estudiante nunca queda sin acceso. Abajo, «Ver todo» pasa a la vista completa de
// siempre (terminal + Panel EV3).
import React from 'react';
import { Cog, LayoutGrid, Lock, Radar, SlidersHorizontal, SquareCode, type LucideIcon } from 'lucide-react';
import { RADIO } from '@/components/ui';
import {
  TITULO_HERRAMIENTA, herramientasVisibles, type HerramientaEv3, type NecesidadesModulo,
} from './necesidadesEv3';

const ICONO: Record<HerramientaEv3, LucideIcon> = {
  motores: Cog,
  sensores: Radar,
  consola: SquareCode,
  avanzado: SlidersHorizontal,
};

/** Nombre accesible: el título y, si aplica, por qué está marcada. */
export function etiquetaHerramienta(h: HerramientaEv3, n: NecesidadesModulo): string {
  const estado = n.herramientas[h];
  if (estado === 'paso') return `${TITULO_HERRAMIENTA[h]} (nueva en este módulo)`;
  if (estado === 'bloqueada') return `${TITULO_HERRAMIENTA[h]} (no hace falta en este módulo)`;
  return TITULO_HERRAMIENTA[h];
}

interface Props {
  necesidades: NecesidadesModulo;
  abierta: HerramientaEv3 | null;
  onAlternar: (h: HerramientaEv3) => void;
  /** Sin él no sale «Ver todo» (p. ej. en «Probar con mi robot», donde no hay vista completa). */
  onVerTodo?: () => void;
}

const BOTON = `relative inline-flex h-9 w-9 items-center justify-center ${RADIO} transition-colors`;

export const RielHerramientas: React.FC<Props> = ({ necesidades, abierta, onAlternar, onVerTodo }) => (
  <nav
    aria-label="Herramientas del robot"
    className="flex w-12 shrink-0 flex-col items-center gap-1.5 border-l border-ui-borde bg-ui-superficie py-2"
  >
    {herramientasVisibles(necesidades).map((h) => {
      const Icono = ICONO[h];
      const estado = necesidades.herramientas[h];
      const activa = abierta === h;
      const bloqueada = estado === 'bloqueada';
      const etiqueta = etiquetaHerramienta(h, necesidades);
      return (
        <button
          key={h}
          type="button"
          aria-label={etiqueta}
          title={etiqueta}
          aria-pressed={activa}
          data-herramienta={h}
          data-estado={estado}
          onClick={() => onAlternar(h)}
          className={[
            BOTON,
            activa
              ? 'bg-[color-mix(in_srgb,var(--color-ui-guia)_14%,transparent)] text-ui-tinta ring-2 ring-ui-guia'
              : bloqueada
                ? 'text-ui-fantasma hover:bg-ui-hover hover:text-ui-tinta-2'
                : 'text-ui-tinta-2 hover:bg-ui-hover hover:text-ui-tinta',
          ].join(' ')}
        >
          <Icono size={18} strokeWidth={1.8} aria-hidden />
          {bloqueada && (
            <span className="absolute -bottom-0.5 -right-0.5 grid h-3.5 w-3.5 place-items-center rounded-full border border-ui-borde bg-ui-superficie text-ui-apagado">
              <Lock size={8} strokeWidth={2.5} aria-hidden />
            </span>
          )}
          {estado === 'paso' && !activa && (
            <span aria-hidden className="absolute right-1 top-1 h-2 w-2 rounded-full bg-ui-guia ring-2 ring-ui-superficie" />
          )}
        </button>
      );
    })}
    {onVerTodo && (
      <>
        <span className="flex-1" />
        <button
          type="button"
          aria-label="Ver todo: terminal y panel completo del robot"
          title="Ver todo: terminal y panel completo del robot"
          onClick={onVerTodo}
          className={`${BOTON} border border-ui-borde text-ui-tinta-2 hover:border-ui-acento-texto hover:text-ui-acento-texto`}
        >
          <LayoutGrid size={16} strokeWidth={1.8} aria-hidden />
        </button>
      </>
    )}
  </nav>
);
