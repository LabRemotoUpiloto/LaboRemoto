import { useState } from 'react';

// Los mismos tipos de sensor que la app reconoce de verdad — ver
// DRIVER_TO_TYPE en api_simulador/main.py. No es una lista inventada para
// el módulo: es lo que vas a ver aparecer en el Dashboard cuando conectes
// sensores reales.
const ITEMS = [
  { id: 'motor-grande', nombre: 'Motor grande (Large Motor)', tipo: 'actuador' },
  { id: 'sensor-tacto', nombre: 'Sensor de contacto (Touch)', tipo: 'sensor' },
  { id: 'sensor-color', nombre: 'Sensor de color (Color)', tipo: 'sensor' },
  { id: 'motor-mediano', nombre: 'Motor mediano (Medium Motor)', tipo: 'actuador' },
  { id: 'sensor-ultrasonido', nombre: 'Sensor ultrasónico (distancia)', tipo: 'sensor' },
  { id: 'sensor-giro', nombre: 'Sensor giroscópico (Gyro)', tipo: 'sensor' },
];

export default function PasoSensoresActuadores() {
  const [respuestas, setRespuestas] = useState({});

  function responder(item, elegido) {
    if (respuestas[item.id]) return; // ya contestado, no se puede cambiar
    setRespuestas(prev => ({ ...prev, [item.id]: { elegido, correcto: elegido === item.tipo } }));
  }

  return (
    <div className="paso">
      <h2>Sensores y actuadores</h2>

      <p>
        Todo robot necesita dos cosas: una forma de <strong>percibir</strong> el mundo y una forma de{' '}
        <strong>actuar</strong> sobre él. En el EV3 eso se traduce en dos familias de piezas que se conectan a
        los puertos del ladrillo.
      </p>

      <div className="paso-tarjetas">
        <div className="paso-tarjeta">
          <div className="paso-tarjeta-icono">👁</div>
          <h4>Sensores (los "sentidos")</h4>
          <p>
            Perciben algo del entorno — luz, distancia, contacto, giro — y lo convierten en un número que el
            programa puede leer. Se conectan a los puertos de <strong>entrada</strong> (<code>in1</code> a{' '}
            <code>in4</code>).
          </p>
        </div>
        <div className="paso-tarjeta">
          <div className="paso-tarjeta-icono">⚙</div>
          <h4>Actuadores (los "músculos")</h4>
          <p>
            Reciben una orden del programa y producen un efecto físico — típicamente girar. Se conectan a los
            puertos de <strong>salida</strong> (<code>outA</code> a <code>outD</code>).
          </p>
        </div>
      </div>

      <h3>Probá: ¿sensor o actuador?</h3>
      <p>Clasificá cada pieza. Es inmediato — no hay penalidad por equivocarse, es para practicar.</p>

      {ITEMS.map(item => {
        const respuesta = respuestas[item.id];
        const estado = respuesta ? (respuesta.correcto ? 'correcto' : 'incorrecto') : '';
        return (
          <div key={item.id} className={`clasificar-item ${estado}`}>
            <span>{item.nombre}</span>
            {respuesta ? (
              <span className="clasificar-resultado">{respuesta.correcto ? '✓' : `✗ era ${item.tipo}`}</span>
            ) : (
              <span className="clasificar-botones">
                <button className="btn" onClick={() => responder(item, 'sensor')}>Sensor</button>
                <button className="btn" onClick={() => responder(item, 'actuador')}>Actuador</button>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
