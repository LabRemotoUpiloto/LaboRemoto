// features/practicas/ev3/CajonEv3.tsx — cajón lateral de la práctica de EV3: la herramienta que el estudiante abrió del
// riel (motores, sensores, consola o estado del robot), al lado del escenario y sin taparlo.
//
// La consola queda montada aunque el cajón esté cerrado o muestre otra herramienta, para no perder un programa que
// está corriendo en el robot. Las piezas (MotorPort, SensorPort, KeyboardControl, Ev3Console) son las del Panel EV3.
import React from 'react';
import { X } from 'lucide-react';
import { BotonIcono, ETIQUETA, NOTA, Num, Punto, TEXTO_NIVEL } from '@/components/ui';
import type { Ev3Status } from '@/features/hardware/ev3.service';
import MotorPort from '@/features/hardware/ev3/MotorPort';
import SensorPort from '@/features/hardware/ev3/SensorPort';
import KeyboardControl from '@/features/hardware/ev3/KeyboardControl';
import Ev3Console from '@/features/hardware/ev3/Ev3Console';
import { TITULO_HERRAMIENTA, type EstadoHerramienta, type HerramientaEv3 } from './necesidadesEv3';

const MOTOR_PORTS = ['outA', 'outB', 'outC', 'outD'];
const SENSOR_PORTS = ['in1', 'in2', 'in3', 'in4'];

/** La consola necesita espacio para el código; el resto cabe en una columna angosta. */
export const ANCHO_CAJON: Record<HerramientaEv3, number> = { motores: 320, sensores: 300, consola: 460, avanzado: 300 };

interface Props {
  sessionId: string;
  abierta: HerramientaEv3 | null;
  /**
   * Pantalla angosta: en vez de empujar el escenario, el cajón flota encima de su borde derecho. `derecha` es la
   * distancia en px al borde derecho de la fila (el riel y la guía). Se posiciona en el mismo lugar del árbol para que
   * la consola no se vuelva a montar al cambiar de modo.
   */
  superpuesto?: { derecha: number } | null;
  /** Estado de la herramienta abierta en este módulo (para avisar si no hace falta). */
  estado: EstadoHerramienta | null;
  /** false si el módulo oculta la consola: entonces ni se monta. */
  conConsola: boolean;
  status: Ev3Status | null;
  onSetSpeed: (port: string, speed: number) => void;
  onCerrar: () => void;
}

export const CajonEv3: React.FC<Props> = ({
  sessionId, abierta, superpuesto = null, estado, conConsola, status, onSetSpeed, onCerrar,
}) => {
  // Sin nada abierto, el cajón no ocupa espacio; si hay consola, sigue montada pero fuera de la vista.
  if (!abierta && !conConsola) return null;
  return (
    <aside
      aria-label={abierta ? TITULO_HERRAMIENTA[abierta] : undefined}
      hidden={!abierta}
      className={[
        abierta ? 'flex' : 'hidden',
        'shrink-0 flex-col border-l border-ui-borde bg-ui-superficie',
        superpuesto ? 'absolute inset-y-0 z-20 shadow-[var(--shadow)]' : '',
      ].join(' ')}
      style={abierta ? { width: ANCHO_CAJON[abierta], right: superpuesto?.derecha } : undefined}
    >
      {abierta && (
        <div className="flex items-start gap-2 border-b border-ui-borde px-3 py-2">
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[13px] font-semibold text-ui-tinta">{TITULO_HERRAMIENTA[abierta]}</h2>
            {estado === 'bloqueada' && (
              <p className="m-0 mt-0.5 text-[11px] text-ui-tinta-2">No hace falta en este módulo; puedes explorarla igual.</p>
            )}
          </div>
          <BotonIcono etiqueta={`Cerrar ${TITULO_HERRAMIENTA[abierta].toLowerCase()}`} onClick={onCerrar}>
            <X size={14} aria-hidden />
          </BotonIcono>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {abierta === 'motores' && (
          <div className="flex flex-col gap-2 p-3">
            {MOTOR_PORTS.map((port) => (
              <MotorPort key={port} port={port} motor={status?.motors?.find((m) => m.port === port)} onSetSpeed={onSetSpeed} />
            ))}
            <KeyboardControl status={status} onSetSpeed={onSetSpeed} />
          </div>
        )}

        {abierta === 'sensores' && (
          <div className="grid grid-cols-2 gap-2 p-3">
            {SENSOR_PORTS.map((port) => (
              <SensorPort key={port} port={port} sensor={status?.sensors?.find((s) => s.port === port)} />
            ))}
          </div>
        )}

        {abierta === 'avanzado' && <EstadoRobot status={status} />}

        {conConsola && (
          <div className="flex min-h-0 flex-1 flex-col" style={abierta === 'consola' ? undefined : { display: 'none' }}>
            <Ev3Console sessionId={sessionId} />
          </div>
        )}
      </div>
    </aside>
  );
};

/** Conexión, batería y alertas: lo que se mira para diagnosticar (módulo 6). */
const EstadoRobot: React.FC<{ status: Ev3Status | null }> = ({ status }) => {
  const alertas = status?.alerts ?? [];
  return (
    <div className="flex flex-col gap-4 p-3 text-[13px]">
      <section className="flex flex-col gap-1.5">
        <h3 className={ETIQUETA}>Conexión</h3>
        <Punto nivel={status?.reachable ? 'bien' : 'critico'} fuerte={status?.reachable ? 'El puente responde' : 'El puente no responde'} />
        <Punto nivel={status?.connected ? 'bien' : 'critico'} fuerte={status?.connected ? 'Robot conectado' : 'Robot sin conexión'} />
        <span className={NOTA}>Dirección: {status?.ip ?? '—'}</span>
      </section>
      <section className="flex flex-col gap-1">
        <h3 className={ETIQUETA}>Batería</h3>
        <span className="text-ui-tinta"><Num>{status?.battery ? status.battery.toFixed(2) : '—'}</Num> V</span>
      </section>
      <section className="flex flex-col gap-1">
        <h3 className={ETIQUETA}>Alertas</h3>
        {alertas.length === 0
          ? <span className="text-ui-tinta-2">Sin alertas.</span>
          : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-live="polite">
              {alertas.map((a, i) => <li key={i} className={TEXTO_NIVEL.alerta}>{a}</li>)}
            </ul>
          )}
      </section>
    </div>
  );
};
