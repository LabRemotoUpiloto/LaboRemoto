import { useState } from 'react';

const PREGUNTAS = [
  {
    id: 'diferencia-simulador',
    texto: '¿Qué diferencia clave hay entre programar el EV3 remoto y un simulador en tu computadora?',
    opciones: [
      'Ninguna, es exactamente igual',
      'En el robot real no hay "deshacer" y puede haber otros usuarios',
      'El robot remoto es más lento a propósito',
      'El simulador es más difícil de usar',
    ],
    correcta: 1,
  },
  {
    id: 'espacio',
    texto: 'En el panel "Control por teclado" del Dashboard, ¿qué tecla frena las dos ruedas configuradas?',
    opciones: ['Enter', 'Espacio', 'Escape', 'Ctrl+C'],
    correcta: 1,
  },
  {
    id: 'script-corriendo',
    texto: 'Si un script con while True se está ejecutando en el EV3 vía la pestaña Terminal, ¿cómo lo cortás?',
    opciones: [
      'Cerrando la pestaña del navegador alcanza',
      'Con Ctrl+C en la sesión SSH de la Terminal (si sigue abierta)',
      'No hay forma de cortarlo una vez que arrancó',
      'Apagando la computadora',
    ],
    correcta: 1,
  },
  {
    id: 'antes-de-empezar',
    texto: '¿Qué conviene revisar antes de empezar a programar algo nuevo?',
    opciones: [
      'Que algún motor no haya quedado girando de una sesión anterior',
      'Nada, se puede empezar directamente',
      'Solo el color del robot',
      'La hora exacta del sistema',
    ],
    correcta: 0,
  },
];

const PUNTAJE_MINIMO = 3;

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
