import { useState } from 'react';

const OPCIONES = [
  { id: 'a', texto: 'if touch.is_pressed:', correcta: true },
  { id: 'b', texto: 'if touch.is_pressed():', correcta: false },
  { id: 'c', texto: 'while touch.is_pressed:', correcta: false },
  { id: 'd', texto: 'if touch.value == 1:', correcta: false },
];

const EXPLICACION = {
  a: 'Exacto — is_pressed es una propiedad (sin paréntesis), no un método: se lee, no se llama.',
  b: 'Casi: is_pressed es una propiedad, no un método — con paréntesis Python tira un error.',
  c: 'Un while ahí adentro cambiaría el comportamiento: el programa quedaría atascado esperando a que se suelte antes de seguir, en vez de solo reaccionar una vez.',
  d: 'TouchSensor no tiene un atributo .value en la librería — la forma correcta es is_pressed.',
};

/**
 * Ejercicio de "completar el código": en vez de una simulación libre, se
 * verifica comprensión real de la sintaxis (una fuente típica de errores
 * al empezar con ev3dev2).
 */
export default function PasoProgramaReactivo() {
  const [elegida, setElegida] = useState(null);
  const opcion = OPCIONES.find(o => o.id === elegida);

  return (
    <div className="paso">
      <h2>Tu primer programa reactivo</h2>
      <p>
        Completá la línea que falta: el robot avanza hasta que se presiona el sensor de contacto, y ahí se
        detiene.
      </p>

      <pre>{`from ev3dev2.motor import LargeMotor, OUTPUT_A
from ev3dev2.sensor.lego import TouchSensor
from ev3dev2.sensor import INPUT_1

motor = LargeMotor(OUTPUT_A)
touch = TouchSensor(INPUT_1)

motor.on(40)
while True:
    ${elegida ? opcion.texto : '_______________________'}
        motor.off()
        break`}</pre>

      <div className="quiz-opciones">
        {OPCIONES.map(o => {
          let clase = elegida === o.id ? 'seleccionada' : '';
          if (elegida) {
            if (o.correcta) clase = 'correcta';
            else if (elegida === o.id) clase = 'incorrecta';
          }
          return (
            <button key={o.id} className={`quiz-opcion ${clase}`} onClick={() => setElegida(o.id)} disabled={!!elegida}>
              {o.texto}
            </button>
          );
        })}
      </div>

      {elegida && (
        <div className={`quiz-resultado ${opcion.correcta ? 'aprobado' : 'reprobado'}`}>
          {EXPLICACION[elegida]}
          {!opcion.correcta && (
            <>
              {' '}
              <button className="btn" onClick={() => setElegida(null)}>Reintentar</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
