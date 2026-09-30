import { useState } from 'react';
import { buscarSensorConectado } from './utilSensorEnVivo.js';
import SensorEnVivo from './SensorEnVivo.jsx';

export default function PasoTacto({ status }) {
  const [presionado, setPresionado] = useState(false);
  const sensorReal = buscarSensorConectado(status, 'Touch');

  return (
    <div className="paso">
      <h2>Sensor de contacto (Touch)</h2>
      <p>
        Es el sensor más simple: solo informa si algo lo está presionando o no. Su valor no es un número
        cualquiera, es <strong>verdadero o falso</strong> — no hace falta compararlo contra un umbral.
      </p>

      <div className="sensor-demo">
        <button
          className={`sensor-demo-boton-tacto ${presionado ? 'presionado' : ''}`}
          onMouseDown={() => setPresionado(true)}
          onMouseUp={() => setPresionado(false)}
          onMouseLeave={() => setPresionado(false)}
        >
          {presionado ? 'PRESIONADO' : 'Mantené click acá'}
        </button>
        <div className="sensor-demo-valor">
          <span>touch.is_pressed</span>
          <strong>{presionado ? 'True' : 'False'}</strong>
        </div>
      </div>

      <pre>{`if touch.is_pressed:
    motor.off()
else:
    motor.on(30)`}</pre>

      <p>Uso típico: parachoques (detectar un choque contra algo) o un botón de confirmación en un menú simple.</p>

      <SensorEnVivo sensor={sensorReal} tipoLegible="sensor de contacto" />
    </div>
  );
}
