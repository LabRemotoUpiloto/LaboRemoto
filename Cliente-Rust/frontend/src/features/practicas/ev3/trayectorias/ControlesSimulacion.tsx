// features/practicas/ev3/trayectorias/ControlesSimulacion.tsx — reproducir, pausar y recorrer la ruta paso a paso en
// el lienzo. Solo muestra lo que calcula useSimulacion.
import React from 'react';
import { Pause, Play, SkipBack, SkipForward, Square } from 'lucide-react';
import { BotonIcono, BotonPrincipal, Desplegable, NOTA } from '@/components/ui';
import { segundos } from './formato';
import type { Simulacion } from './useSimulacion';

const VELOCIDADES = ['0.5', '1', '2', '5'].map((v) => ({ valor: v, etiqueta: `${v.replace('.', ',')}×` }));

export const ControlesSimulacion: React.FC<{ sim: Simulacion; deshabilitado: boolean }> = ({ sim, deshabilitado }) => {
  const sinRuta = deshabilitado || sim.totalMs === 0;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-ui-borde px-3 py-2" role="group" aria-label="Simulación de la ruta">
      <BotonIcono etiqueta="Paso atrás" onClick={sim.pasoAtras} disabled={sinRuta}>
        <SkipBack size={14} aria-hidden />
      </BotonIcono>
      <BotonPrincipal className="h-8 px-3" onClick={sim.alternar} disabled={sinRuta}>
        {sim.reproduciendo ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
        {sim.reproduciendo ? 'Pausar' : 'Simular'}
      </BotonPrincipal>
      <BotonIcono etiqueta="Paso adelante" onClick={sim.pasoAdelante} disabled={sinRuta}>
        <SkipForward size={14} aria-hidden />
      </BotonIcono>
      <BotonIcono etiqueta="Detener y volver al inicio" onClick={sim.detener} disabled={sinRuta}>
        <Square size={14} aria-hidden />
      </BotonIcono>

      <input
        type="range"
        aria-label="Momento de la simulación"
        min={0}
        max={sim.totalMs || 1}
        step={1}
        value={Math.min(sim.tiempoMs, sim.totalMs || 1)}
        onChange={(e) => sim.irA(Number(e.target.value))}
        disabled={sinRuta}
        className="min-w-[80px] flex-1 accent-[var(--accent-primary)]"
      />
      <span className={`${NOTA} shrink-0`} aria-live="off">{segundos(sim.tiempoMs)} / {segundos(sim.totalMs)}</span>
      <Desplegable etiqueta="Velocidad de la simulación" valor={String(sim.velocidad)} opciones={VELOCIDADES} className="w-[76px]"
        onCambio={(v) => sim.setVelocidad(Number(v))} />
    </div>
  );
};
