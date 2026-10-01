import { useState } from 'react';

const OPCIONES = [
  { id: 'a', texto: 'is_pressed ya es un valor (True/False), no se puede "llamar" con ()', correcta: true },
  { id: 'b', texto: 'El sensor de contacto no está conectado', correcta: false },
  { id: 'c', texto: 'Falta importar TouchSensor', correcta: false },
  { id: 'd', texto: 'El puerto in1 está mal escrito', correcta: false },
];

export default function PasoLeerErrores() {
  const [elegida, setElegida] = useState(null);
  const opcion = OPCIONES.find(o => o.id === elegida);

  return (
    <div className="paso">
      <h2>Leer un error de Python</h2>
      <p>
        Cuando un programa se cae, Python imprime un <strong>traceback</strong>. Da miedo la primera vez, pero
        se lee <strong>de abajo hacia arriba</strong>: la última línea es el error real; las de arriba son el
        camino que siguió el programa hasta llegar ahí.
      </p>

      <pre>{`Traceback (most recent call last):
  File "programa.py", line 8, in <module>
    if touch.is_pressed():
TypeError: 'bool' object is not callable`}</pre>

      <p>
        La línea 8 (<code>if touch.is_pressed():</code>) es donde pasó — el mismo error del Módulo 2. La
        última línea, <code>TypeError: 'bool' object is not callable</code>, es el mensaje real: dice que se
        intentó "llamar como función" (con paréntesis) algo que ya es un valor booleano.
      </p>

      <p>¿Qué significa este error, en criollo?</p>
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
          {opcion.correcta
            ? 'Exacto — el mensaje del error casi siempre dice literalmente qué está mal, una vez que se entiende el vocabulario de Python.'
            : <>Fijate en el mensaje de la última línea: "'bool' object is not callable" — habla de un valor booleano, no de una conexión ni de un import. <button className="btn" onClick={() => setElegida(null)}>Reintentar</button></>}
        </div>
      )}
    </div>
  );
}
