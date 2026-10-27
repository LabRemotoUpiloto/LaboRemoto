// features/practicas/ev3/BarraMisionEv3.tsx — barra superior de la práctica de EV3: título, progreso por tramos (uno por
// paso del chat), estado del robot y «Detener», siempre a la vista porque el robot es real y compartido.
import React, { useState } from 'react';
import { Bot, OctagonX } from 'lucide-react';
import { NOTA, RADIO } from '@/components/ui';
import type { ProgresoPractica } from '@/features/practicas/linux/LinuxPracticeProgressBar';

/** Con más pasos que esto, los tramos quedan demasiado finos: se pinta una barra continua. */
const MAX_TRAMOS = 24;

export type EstadoTramo = 'hecho' | 'actual' | 'pendiente';

/** Estado de cada tramo de la barra. `completa`: la práctica ya pasó (todos hechos). */
export function tramosDe(progreso: ProgresoPractica | null, completa: boolean): EstadoTramo[] {
  const total = progreso?.total ?? 0;
  if (total <= 0) return [];
  if (completa) return Array.from({ length: total }, () => 'hecho');
  const actual = Math.min(Math.max(progreso?.numero ?? 1, 1), total);
  return Array.from({ length: total }, (_, i) => (i + 1 < actual ? 'hecho' : i + 1 === actual ? 'actual' : 'pendiente'));
}

const COLOR_TRAMO: Record<EstadoTramo, string> = {
  hecho: 'bg-ui-bien',
  actual: 'bg-ui-guia',
  pendiente: 'bg-ui-pista',
};

interface Props {
  progreso: ProgresoPractica | null;
  completa: boolean;
  robotConectado: boolean;
  onDetener: () => Promise<void>;
}

export const BarraMisionEv3: React.FC<Props> = ({ progreso, completa, robotConectado, onDetener }) => {
  const tramos = tramosDe(progreso, completa);
  const hechos = tramos.filter((t) => t === 'hecho').length;

  return (
    <div className="flex h-12 shrink-0 items-center gap-4 border-b border-ui-borde bg-ui-superficie px-4">
      <div className="flex min-w-0 items-center gap-2">
        <Bot size={16} className="shrink-0 text-ui-tinta-2" aria-hidden />
        <span className="truncate text-[13px] font-semibold text-ui-tinta">{progreso?.titulo ?? 'Práctica de robótica'}</span>
      </div>

      <div className="flex min-w-[120px] flex-1 items-center gap-3">
        {tramos.length > 0 && (
          <div
            role="progressbar"
            aria-label="Avance de la práctica"
            aria-valuemin={0}
            aria-valuemax={tramos.length}
            aria-valuenow={hechos}
            className="flex flex-1 items-center gap-[3px]"
          >
            {tramos.length <= MAX_TRAMOS
              ? tramos.map((t, i) => (
                <span key={i} data-tramo={t} className={`h-1.5 flex-1 rounded-full transition-colors duration-500 motion-reduce:transition-none ${COLOR_TRAMO[t]}`} />
              ))
              : (
                <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-ui-pista">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-ui-bien" style={{ width: `${(hechos / tramos.length) * 100}%` }} />
                </span>
              )}
          </div>
        )}
        <span className={`${NOTA} shrink-0`}>
          {completa ? 'Práctica completa' : progreso?.numero && progreso.total ? `Paso ${progreso.numero} de ${progreso.total}` : ''}
        </span>
      </div>

      <EstadoRobot conectado={robotConectado} />
      <BotonDetener onDetener={onDetener} />
    </div>
  );
};

/** Punto verde o rojo con el estado de la conexión con el robot. */
export const EstadoRobot: React.FC<{ conectado: boolean }> = ({ conectado }) => (
  <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-ui-tinta-2" role="status">
    <span aria-hidden className={`h-2 w-2 rounded-full ${conectado ? 'bg-ui-bien' : 'bg-ui-critico'}`} />
    {conectado ? 'Robot conectado' : 'Robot sin conexión'}
  </span>
);

/** «Detener»: frena todos los motores. Siempre a la vista mientras hay robot; avisa si el robot no confirmó. */
export const BotonDetener: React.FC<{ onDetener: () => Promise<void> }> = ({ onDetener }) => {
  const [deteniendo, setDeteniendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const detener = async () => {
    setDeteniendo(true);
    setAviso(null);
    try {
      await onDetener();
      setAviso('Motores detenidos');
    } catch {
      setAviso('No se pudo detener el robot. Revisa la conexión.');
    } finally {
      setDeteniendo(false);
      window.setTimeout(() => setAviso(null), 4000);
    }
  };

  return (
    <>
      {aviso && <span className="shrink-0 text-[12px] text-ui-tinta-2" role="status">{aviso}</span>}

      <button
        type="button"
        onClick={() => void detener()}
        disabled={deteniendo}
        title="Detiene todos los motores del robot"
        className={`inline-flex h-[34px] shrink-0 items-center gap-1.5 ${RADIO} border border-ui-critico bg-ui-superficie px-3 text-[13px] font-semibold text-ui-critico-texto transition-colors hover:enabled:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] disabled:cursor-wait`}
      >
        <OctagonX size={14} aria-hidden />
        {deteniendo ? 'Deteniendo…' : 'Detener'}
      </button>
    </>
  );
};
