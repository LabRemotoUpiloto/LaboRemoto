import { useState } from 'react';
import { calcularGiro } from '../../../../lib/trayectoria/cinematica.js';
import { CONFIG_POR_DEFECTO } from '../../../../lib/trayectoria/config.js';

export default function PasoGirarAngulo() {
  const [grados, setGrados] = useState(90);
  const { izquierda, derecha } = calcularGiro(grados, CONFIG_POR_DEFECTO);

  return (
    <div className="paso">
      <h2>Girar un ángulo exacto</h2>
      <p>
        Girar no depende solo del diámetro de la rueda — también del <strong>ancho de vía (E)</strong>, la
        distancia entre las dos ruedas. Cuanto más separadas están, más tienen que girar para lograr el mismo
        giro del robot completo.
      </p>

      <div className="sensor-demo">
        <div className="movimientos-slider">
          <label><span>Ángulo a girar</span><span>{grados}°</span></label>
          <input type="range" min={-180} max={180} value={grados} onChange={e => setGrados(Number(e.target.value))} />
        </div>
        <div className="sensor-demo-valor">
          <span>motor izquierdo</span>
          <strong>{izquierda.toFixed(1)}°</strong>
        </div>
        <div className="sensor-demo-valor">
          <span>motor derecho</span>
          <strong>{derecha.toFixed(1)}°</strong>
        </div>
      </div>

      <p>
        Los signos son opuestos: mientras una rueda avanza, la otra retrocede la misma cantidad — así el
        robot gira sobre su propio centro en vez de desplazarse hacia un lado.
      </p>

      <pre>{`motor_izq.on_for_degrees(speed=30, degrees=${izquierda.toFixed(0)})
motor_der.on_for_degrees(speed=30, degrees=${derecha.toFixed(0)})`}</pre>
    </div>
  );
}
