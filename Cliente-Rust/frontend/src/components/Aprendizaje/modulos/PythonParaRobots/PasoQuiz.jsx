import { useState } from 'react';

const PREGUNTAS = [
  {
    id: 'range',
    texto: '¿Cuántas veces se ejecuta el cuerpo de for i in range(3):?',
    opciones: ['2 veces', '3 veces', '4 veces', 'Infinitas veces'],
    correcta: 1,
  },
  {
    id: 'break-continue',
    texto: '¿Qué diferencia hay entre break y continue?',
    opciones: [
      'Son lo mismo, da igual cuál usar',
      'break sale del bucle entero; continue salta a la siguiente vuelta',
      'break salta a la siguiente vuelta; continue sale del bucle',
      'Ninguno de los dos funciona dentro de un while',
    ],
    correcta: 1,
  },
  {
    id: 'funcion',
    texto: '¿Cuál es la principal ventaja de empaquetar código repetido en una función?',
    opciones: [
      'El programa corre más rápido',
      'Si hay que corregir algo, se corrige en un solo lugar',
      'Usa menos batería el robot',
      'Es obligatorio en Python',
    ],
    correcta: 1,
  },
  {
    id: 'estado-variable',
    texto: 'En una máquina de estados, ¿qué es "el estado" en términos de código?',
    opciones: ['Una función especial de ev3dev2', 'Una variable común que se lee y se actualiza', 'Un archivo aparte', 'Un tipo de sensor'],
    correcta: 1,
  },
  {
    id: 'try-except',
    texto: '¿Qué logra un try/except que no lograría el código sin él?',
    opciones: [
      'Que el programa corra más rápido',
      'Que el programa siga corriendo (o reaccione) aunque una parte falle',
      'Que los sensores nunca se desconecten',
      'Nada, es solo decoración',
    ],
    correcta: 1,
  },
];

const PUNTAJE_MINIMO = 4;

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
