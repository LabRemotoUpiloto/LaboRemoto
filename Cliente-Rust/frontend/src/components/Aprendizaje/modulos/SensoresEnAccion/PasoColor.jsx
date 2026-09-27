import { useState } from 'react';
import { buscarSensorConectado } from './utilSensorEnVivo.js';
import SensorEnVivo from './SensorEnVivo.jsx';

const SUPERFICIES = [
  { nombre: 'Blanco', reflectividad: 90, color: '#f0f0f0' },
  { nombre: 'Gris claro', reflectividad: 55, color: '#aaaaaa' },
  { nombre: 'Gris oscuro', reflectividad: 25, color: '#555555' },
  { nombre: 'Negro', reflectividad: 5, color: '#161616' },
];

export default function PasoColor({ status }) {
  const [seleccion, setSeleccion] = useState(SUPERFICIES[0]);
  const sensorReal = buscarSensorConectado(status, 'Color');

  return (
    <div className="paso">
      <h2>Sensor de color</h2>
      <p>
        En modo "luz reflejada", el sensor no identifica el color exacto — mide qué tan clara u oscura es la
        superficie que tiene debajo, de 0 (negro) a 100 (blanco). Ese único número alcanza para seguir una
        línea negra sobre piso claro.
      </p>

      <div className="sensor-demo">
        <div className="sensor-demo-superficies">
          {SUPERFICIES.map(s => (
            <button
              key={s.nombre}
              className={`sensor-demo-superficie ${seleccion.nombre === s.nombre ? 'activa' : ''}`}
              style={{ background: s.color, color: s.reflectividad > 40 ? '#111' : '#eee' }}
              onClick={() => setSeleccion(s)}
            >
              {s.nombre}
            </button>
          ))}
        </div>
        <div className="sensor-demo-valor">
          <span>color.reflected_light_intensity</span>
          <strong>{seleccion.reflectividad}</strong>
        </div>
      </div>

      <pre>{`if color.reflected_light_intensity < 30:
    # está sobre la línea negra: corregir hacia la izquierda
    motor_izq.on(20)
    motor_der.on(40)
else:
    # está sobre el piso claro: corregir hacia la derecha
    motor_izq.on(40)
    motor_der.on(20)`}</pre>

      <p>
        Leer este valor muchas veces por segundo y corregir el rumbo según si el sensor ve "más línea" o
        "más piso" de lo esperado es, en esencia, cómo funciona un seguidor de línea clásico.
      </p>

      <SensorEnVivo sensor={sensorReal} tipoLegible="sensor de color" />
    </div>
  );
}
