import { useState } from 'react';
import { buscarSensorConectado } from './utilSensorEnVivo.js';
import SensorEnVivo from './SensorEnVivo.jsx';

const UMBRAL_CM = 10;
const MAX_CM = 100;

export default function PasoUltrasonido({ status }) {
  const [distancia, setDistancia] = useState(50);
  const enPeligro = distancia < UMBRAL_CM;
  const sensorReal = buscarSensorConectado(status, 'Ultrasonic');

  // Posición del robot en el mini-diagrama, a lo largo de un track de 260px.
  const posicionPx = 10 + (260 - 34) * (distancia / MAX_CM);

  return (
    <div className="paso">
      <h2>Sensor de distancia (ultrasónico)</h2>
      <p>
        Mide qué tan lejos está el objeto más cercano, en centímetros, mandando un pulso de ultrasonido y
        cronometrando el eco — el mismo principio que un sonar.
      </p>

      <div className="sensor-demo">
        <input
          type="range"
          min={0}
          max={MAX_CM}
          value={distancia}
          onChange={e => setDistancia(Number(e.target.value))}
        />
        <div className="sensor-demo-valor">
          <span>ultrasonico.distance_centimeters</span>
          <strong>{distancia} cm</strong>
        </div>

        <svg viewBox="0 0 300 50" className="sensor-demo-pared">
          <rect x="0" y="5" width="10" height="40" fill="#555" />
          <rect x={posicionPx} y="15" width="24" height="20" rx="4" fill={enPeligro ? '#e05252' : '#007acc'} />
        </svg>
      </div>

      <pre>{`if ultrasonico.distance_centimeters < ${UMBRAL_CM}:
    motor_izq.off()
    motor_der.off()
else:
    motor_izq.on(30)
    motor_der.on(30)`}</pre>

      <p className={enPeligro ? 'sensor-demo-alerta' : ''}>
        {enPeligro
          ? `⚠ A ${distancia}cm, el programa de arriba frenaría (umbral: ${UMBRAL_CM}cm).`
          : `A ${distancia}cm todavía hay margen — el robot seguiría avanzando.`}
      </p>

      <SensorEnVivo sensor={sensorReal} tipoLegible="sensor ultrasónico" />
    </div>
  );
}
