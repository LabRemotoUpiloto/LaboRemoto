// features/practicas/ev3/trayectorias/PanelRobot.tsx — medidas físicas del robot y qué motor es cada rueda.
//
// Diámetro, ancho de vía y calibración son lo único de lo que dependen los grados de motor (cinematica.ts) y la
// odometría de la trayectoria real. Las ruedas se eligen aparte: es para saber qué encoders grabar; por defecto A y D,
// como el control por teclado del cajón Motores.
import React from 'react';
import { RotateCcw } from 'lucide-react';
import { Boton, Desplegable, ETIQUETA } from '@/components/ui';
import { CampoNumero } from './CampoNumero';
import { CONFIG_POR_DEFECTO, type ConfigRobot } from './tipos';

export interface RuedasMotores {
  izquierda: string;
  derecha: string;
}

export const RUEDAS_POR_DEFECTO: RuedasMotores = { izquierda: 'outA', derecha: 'outD' };

const CAMPOS: { clave: keyof ConfigRobot; etiqueta: string; sufijo: string; paso: number }[] = [
  { clave: 'diametroRuedaCm', etiqueta: 'Diámetro de la rueda (D)', sufijo: 'cm', paso: 0.1 },
  { clave: 'anchoViaCm', etiqueta: 'Ancho de vía (E)', sufijo: 'cm', paso: 0.1 },
  { clave: 'factorCalibracion', etiqueta: 'Calibración (k)', sufijo: '×', paso: 0.01 },
];

const PUERTOS = ['outA', 'outB', 'outC', 'outD'].map((p) => ({ valor: p, etiqueta: `Puerto ${p.slice(3)}` }));

interface Props {
  config: ConfigRobot;
  onCambiarConfig: (c: ConfigRobot) => void;
  ruedas: RuedasMotores;
  onCambiarRuedas: (r: RuedasMotores) => void;
}

export const PanelRobot: React.FC<Props> = ({ config, onCambiarConfig, ruedas, onCambiarRuedas }) => (
  <section aria-labelledby="panel-robot-titulo" className="flex flex-col gap-2">
    <h3 id="panel-robot-titulo" className={ETIQUETA}>Medidas del robot</h3>
    {CAMPOS.map((c) => (
      <div key={c.clave} className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-ui-tinta-2">{c.etiqueta}</span>
        <CampoNumero etiqueta={c.etiqueta} valor={config[c.clave]} paso={c.paso} sufijo={c.sufijo} min={0.01}
          onCambiar={(v) => onCambiarConfig({ ...config, [c.clave]: v })} />
      </div>
    ))}
    <Boton className="h-8 self-start px-2.5 text-[12px]" onClick={() => onCambiarConfig(CONFIG_POR_DEFECTO)}>
      <RotateCcw size={14} aria-hidden />
      Valores por defecto
    </Boton>

    <h3 className={`${ETIQUETA} mt-2`}>Ruedas (trayectoria real)</h3>
    <div className="flex items-center justify-between gap-2">
      <span className="text-[12px] text-ui-tinta-2">Rueda izquierda</span>
      <Desplegable etiqueta="Motor de la rueda izquierda" valor={ruedas.izquierda} opciones={PUERTOS} className="w-[120px]"
        onCambio={(izquierda) => onCambiarRuedas({ ...ruedas, izquierda })} />
    </div>
    <div className="flex items-center justify-between gap-2">
      <span className="text-[12px] text-ui-tinta-2">Rueda derecha</span>
      <Desplegable etiqueta="Motor de la rueda derecha" valor={ruedas.derecha} opciones={PUERTOS} className="w-[120px]"
        onCambio={(derecha) => onCambiarRuedas({ ...ruedas, derecha })} />
    </div>
  </section>
);
