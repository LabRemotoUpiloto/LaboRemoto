import { useState } from 'react';
import { calcularAvance } from '../../../../lib/trayectoria/cinematica.js';
import { CONFIG_POR_DEFECTO } from '../../../../lib/trayectoria/config.js';

/**
 * Esta calculadora usa `calcularAvance` de verdad — el mismo módulo que
 * convierte un comando "Avanzar" en grados de
 * motor. No es una versión simplificada para el módulo: es la fórmula real.
 */
export default function PasoFormulaGrados() {
  const [diametro, setDiametro] = useState(CONFIG_POR_DEFECTO.diametroRuedaCm);
  const [distancia, setDistancia] = useState(10);

  const config = { ...CONFIG_POR_DEFECTO, diametroRuedaCm: diametro };
  const { izquierda: grados } = calcularAvance(distancia, config);

  return (
    <div className="paso">
      <h2>Grados por centímetro</h2>
      <p>
        La rueda es un círculo: en una vuelta completa (360°) avanza exactamente su circunferencia,{' '}
        <code>π · D</code>. Por regla de tres, los grados de motor que hacen falta por cada cm son{' '}
        <code>360 / (π · D)</code>.
      </p>

      <div className="sensor-demo">
        <div className="movimientos-slider">
          <label><span>Diámetro de rueda (D)</span><span>{diametro.toFixed(1)} cm</span></label>
          <input type="range" min={2} max={12} step={0.1} value={diametro} onChange={e => setDiametro(Number(e.target.value))} />
        </div>
        <div className="movimientos-slider">
          <label><span>Distancia a avanzar</span><span>{distancia} cm</span></label>
          <input type="range" min={1} max={100} value={distancia} onChange={e => setDistancia(Number(e.target.value))} />
        </div>
        <div className="sensor-demo-valor">
          <span>grados de motor necesarios</span>
          <strong>{grados.toFixed(1)}°</strong>
        </div>
      </div>

      <pre>{`motor.on_for_degrees(speed=30, degrees=${grados.toFixed(0)})`}</pre>

      <p>
        Con una rueda más chica hacen falta más grados para la misma distancia (da más vueltas más rápido).
        Es la cuenta que tenés que hacer cada vez que quieras que el robot avance una distancia exacta:
        probá cambiar el diámetro arriba y mirá cómo cambian los grados.
      </p>
    </div>
  );
}
