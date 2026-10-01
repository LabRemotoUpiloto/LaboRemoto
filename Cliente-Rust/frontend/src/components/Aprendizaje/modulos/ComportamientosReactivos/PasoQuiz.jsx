import { useState } from 'react';

const PREGUNTAS = [
  {
    id: 'bucle',
    texto: '¿Por qué un comportamiento reactivo necesita un bucle en vez de un solo if?',
    opciones: [
      'Porque Python obliga a usar while True siempre',
      'Porque el entorno cambia constantemente y hay que releer el sensor una y otra vez',
      'Porque los motores solo funcionan dentro de un bucle',
      'No es necesario, un solo if alcanza',
    ],
    correcta: 1,
  },
  {
    id: 'proporcional',
    texto: 'En el control proporcional para seguir línea, ¿qué determina cuánto se corrige?',
    opciones: ['Un número al azar', 'El error (qué tan lejos está del valor objetivo)', 'La batería restante', 'El color del robot'],
    correcta: 1,
  },
  {
    id: 'ganancia-alta',
    texto: '¿Qué pasa si la ganancia de la corrección es demasiado alta?',
    opciones: ['El robot corrige de más y zigzaguea', 'El robot no se mueve', 'El sensor se rompe', 'No pasa nada, siempre conviene una ganancia alta'],
    correcta: 0,
  },
  {
    id: 'zonas',
    texto: '¿Para qué sirve dividir la distancia en zonas (libre/precaución/peligro) en vez de un solo umbral?',
    opciones: [
      'Para que el código sea más largo',
      'Para reaccionar de forma gradual, no solo "chocar o no chocar"',
      'No sirve de nada, un umbral alcanza siempre',
      'Porque el sensor ultrasónico lo exige',
    ],
    correcta: 1,
  },
  {
    id: 'estado',
    texto: 'En una máquina de estados, ¿qué decide qué bloque de código se ejecuta en cada vuelta del bucle?',
    opciones: ['El orden en que se escribieron los ifs', 'El valor de una variable de estado', 'El azar', 'La hora del día'],
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
