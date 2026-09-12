import { useState } from 'react';

const PREGUNTAS = [
  {
    id: 'actuador',
    texto: '¿Cuál de estas opciones es un actuador?',
    opciones: ['Sensor de color', 'Motor grande', 'Sensor ultrasónico', 'Sensor de contacto'],
    correcta: 1,
  },
  {
    id: 'puerto-sensor',
    texto: '¿A qué tipo de puerto se conecta un sensor de distancia?',
    opciones: ['outA (salida)', 'in2 (entrada)', 'outC (salida)', 'outD (salida)'],
    correcta: 1,
  },
  {
    id: 'avanzar',
    texto: 'Si las dos ruedas giran con la misma potencia positiva, el robot...',
    opciones: ['Gira en el lugar', 'Avanza en línea recta', 'Retrocede', 'Se queda detenido'],
    correcta: 1,
  },
  {
    id: 'sistema-operativo',
    texto: '¿Qué corre dentro del EV3 en este laboratorio?',
    opciones: [
      'El firmware original de LEGO',
      'Windows IoT',
      'ev3dev (Linux) con un programa en Python',
      'No corre ningún software, todo es remoto',
    ],
    correcta: 2,
  },
  {
    id: 'ejecutar-programa',
    texto: '¿Cómo se ejecuta un programa Python en el robot desde esta app?',
    opciones: [
      'Se sube por la pestaña Terminal y se corre por SSH',
      'Se copia a mano con un pendrive',
      'Se pega el código directamente en el Dashboard',
      'No se puede, solo comandos sueltos',
    ],
    correcta: 0,
  },
];

const PUNTAJE_MINIMO = 4;

/** Quiz final del módulo. `onCompletado` se llama solo si aprueba. */
export default function PasoQuiz({ onCompletado }) {
  const [respuestas, setRespuestas] = useState({});
  const [enviado, setEnviado] = useState(false);

  const todasContestadas = PREGUNTAS.every(p => respuestas[p.id] !== undefined);
  const correctas = PREGUNTAS.filter(p => respuestas[p.id] === p.correcta).length;
  const aprobado = correctas >= PUNTAJE_MINIMO;

  function elegir(preguntaId, indice) {
    if (enviado) return;
    setRespuestas(prev => ({ ...prev, [preguntaId]: indice }));
  }

  function enviar() {
    setEnviado(true);
    if (correctas >= PUNTAJE_MINIMO) onCompletado();
  }

  function reintentar() {
    setRespuestas({});
    setEnviado(false);
  }

  return (
    <div className="paso">
      <h2>Puesta a prueba</h2>
      <p>
        Necesitás {PUNTAJE_MINIMO} de {PREGUNTAS.length} correctas para completar el módulo. Podés reintentar
        las veces que quieras.
      </p>

      {PREGUNTAS.map(pregunta => (
        <div key={pregunta.id} className="quiz-pregunta">
          <p>{pregunta.texto}</p>
          <div className="quiz-opciones">
            {pregunta.opciones.map((opcion, i) => {
              let clase = respuestas[pregunta.id] === i ? 'seleccionada' : '';
              if (enviado) {
                if (i === pregunta.correcta) clase = 'correcta';
                else if (respuestas[pregunta.id] === i) clase = 'incorrecta';
              }
              return (
                <button
                  key={i}
                  className={`quiz-opcion ${clase}`}
                  onClick={() => elegir(pregunta.id, i)}
                  disabled={enviado}
                >
                  {opcion}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {!enviado ? (
        <button className="btn btn-primary" onClick={enviar} disabled={!todasContestadas}>
          Corregir
        </button>
      ) : (
        <div className={`quiz-resultado ${aprobado ? 'aprobado' : 'reprobado'}`}>
          {aprobado ? (
            `¡Bien! Respondiste ${correctas}/${PREGUNTAS.length} correctas. Módulo completado.`
          ) : (
            <>
              Respondiste {correctas}/{PREGUNTAS.length} correctas — necesitás al menos {PUNTAJE_MINIMO}.{' '}
              <button className="btn" onClick={reintentar}>Reintentar</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
