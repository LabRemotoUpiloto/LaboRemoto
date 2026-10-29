// features/practicas/ev3/trayectorias/EditorTrayectorias.tsx — editor gráfico de trayectorias del EV3, portado de
// investigacion_ev3 (rama version_api, src/components/TrayectoriaEditor).
//
// `primitivas` es la única fuente de verdad de la ruta: el lienzo, la lista de comandos y el simulador son vistas de
// la misma lista. El editor no mueve el robot: planea y simula. Mientras se graba, guarda los encoders de las dos
// ruedas (el robot se maneja con el teclado del cajón Motores), reconstruye por odometría la trayectoria real y la
// compara con la planeada.
import React, { useEffect, useMemo, useState } from 'react';
import { Circle, Square, Trash2 } from 'lucide-react';
import { Boton, NOTA } from '@/components/ui';
import type { Ev3Status } from '@/features/hardware/ev3.service';
import { ControlesSimulacion } from './ControlesSimulacion';
import { LienzoTrayectoria } from './LienzoTrayectoria';
import { ListaComandos } from './ListaComandos';
import { PanelRobot, RUEDAS_POR_DEFECTO, type RuedasMotores } from './PanelRobot';
import { num } from './formato';
import { errorFinalCm, reconstruirTrayectoria } from './odometria';
import { POSE_INICIAL_DEFECTO, poseFinal } from './planificador';
import { useRegistroEncoders } from './useRegistroEncoders';
import { useSimulacion } from './useSimulacion';
import { CONFIG_POR_DEFECTO, type ConfigRobot, type Primitiva } from './tipos';

interface Props {
  status: Ev3Status | null;
  /** Avisa si se está grabando, para leer el robot más seguido mientras tanto. */
  onGrabandoCambio?: (grabando: boolean) => void;
}

/** Por qué no se puede grabar la trayectoria real, o null si se puede. */
function motivoSinRegistro(status: Ev3Status | null, ruedas: RuedasMotores): string | null {
  if (!status?.connected) return 'Conecta el robot para grabar la trayectoria real.';
  const puertos = [ruedas.izquierda, ruedas.derecha];
  const motores = puertos.map((p) => status.motors.find((m) => m.port.replace(/^out/i, '') === p.replace(/^out/i, '')));
  if (motores.some((m) => !m?.connected)) {
    return `No hay motor en el puerto ${puertos.map((p) => p.slice(3)).join(' o ')}: elige en «Ruedas» los de tu robot.`;
  }
  return 'El robot no envía la posición de los encoders: en el ladrillo corre el main.py de la rama version_api.';
}

export const EditorTrayectorias: React.FC<Props> = ({ status, onGrabandoCambio }) => {
  const [primitivas, setPrimitivas] = useState<Primitiva[]>([]);
  const [config, setConfig] = useState<ConfigRobot>(CONFIG_POR_DEFECTO);
  const [ruedas, setRuedas] = useState<RuedasMotores>(RUEDAS_POR_DEFECTO);
  const sim = useSimulacion(primitivas);
  const registro = useRegistroEncoders(status, ruedas.izquierda, ruedas.derecha);

  useEffect(() => { onGrabandoCambio?.(registro.grabando); }, [registro.grabando, onGrabandoCambio]);
  // Al cerrar el editor se deja de leer el robot tan seguido.
  useEffect(() => () => onGrabandoCambio?.(false), [onGrabandoCambio]);

  const trayectoriaReal = useMemo(
    () => (registro.historial.length > 0 ? reconstruirTrayectoria(registro.historial, POSE_INICIAL_DEFECTO, config) : null),
    [registro.historial, config],
  );
  const errorFinal = trayectoriaReal && primitivas.length > 0
    ? errorFinalCm(trayectoriaReal[trayectoriaReal.length - 1], poseFinal(primitivas))
    : null;
  const sinRegistro = registro.disponible ? null : motivoSinRegistro(status, ruedas);
  const n = primitivas.length;

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ui-borde px-3 py-2">
        <div className="mr-auto min-w-0">
          <h2 className="m-0 text-[13px] font-semibold text-ui-tinta">Editor de trayectorias</h2>
          <p className={`${NOTA} m-0`}>
            {n} {n === 1 ? 'comando' : 'comandos'} · Robot simulado en ({num(sim.pose.x)}; {num(sim.pose.y)}) cm, {num(sim.pose.th, 0)}°
            {errorFinal !== null && <> · <span className="text-ui-tinta-2">Error final: {num(errorFinal)} cm</span></>}
          </p>
        </div>

        {registro.grabando ? (
          <Boton className="h-8 px-2.5 text-[12px]" onClick={registro.detener}>
            <Square size={14} aria-hidden />
            Detener grabación
          </Boton>
        ) : (
          <Boton className="h-8 px-2.5 text-[12px]" onClick={registro.iniciar} disabled={!registro.disponible}
            title={sinRegistro ?? 'Graba los encoders mientras mueves el robot con el teclado (cajón Motores)'}>
            <Circle size={14} aria-hidden className="text-ui-critico" />
            Grabar trayectoria real
          </Boton>
        )}
        {registro.historial.length > 0 && !registro.grabando && (
          <Boton className="h-8 px-2.5 text-[12px]" onClick={registro.reiniciar}>Borrar grabación</Boton>
        )}
        <Boton className="h-8 px-2.5 text-[12px]" onClick={() => setPrimitivas([])} disabled={n === 0}>
          <Trash2 size={14} aria-hidden />
          Borrar ruta
        </Boton>
      </div>

      {(registro.grabando || sinRegistro) && (
        <p role="status" className="m-0 border-b border-ui-borde px-3 py-1.5 text-[12px] text-ui-tinta-2">
          {registro.grabando
            ? <>Grabando: mueve el robot con W, A, S y D (cajón Motores). <span aria-hidden className={NOTA}>{registro.historial.length} lecturas</span></>
            : sinRegistro}
        </p>
      )}

      <ControlesSimulacion sim={sim} deshabilitado={n === 0} />

      <div className="flex min-h-0 flex-1">
        <LienzoTrayectoria primitivas={primitivas} onCambiar={setPrimitivas} poseRobot={sim.pose} trayectoriaReal={trayectoriaReal} />
        <aside aria-label="Ruta y medidas del robot" className="flex w-[290px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-ui-borde px-3 py-3">
          <ListaComandos primitivas={primitivas} onCambiar={setPrimitivas} indiceActivo={sim.indiceActivo} config={config} />
          <PanelRobot config={config} onCambiarConfig={setConfig} ruedas={ruedas} onCambiarRuedas={setRuedas} />
        </aside>
      </div>
    </div>
  );
};
