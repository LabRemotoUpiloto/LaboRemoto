import { useState } from 'react';

const PREGUNTAS = [
  {
    id: 'orden-traceback',
    texto: '¿En qué orden conviene leer un traceback de Python?',
    opciones: ['De arriba hacia abajo', 'De abajo hacia arriba', 'Del medio hacia los costados', 'El orden no importa'],
    correcta: 1,
  },
  {
    id: 'para-que-print',
    texto: '¿Para qué sirve agregar print() al depurar?',
    opciones: [
      'Para que el programa corra más rápido',
      'Para ver valores intermedios y confirmar qué está pasando de verdad',
      'Es obligatorio en todo programa de Python',
      'Para arreglar el error automáticamente',
    ],
    correcta: 1,
  },
  {
    id: 'tipo-error',
    texto: '"Sin conexión con el backend" es un problema de...',
    opciones: ['Código', 'Conexión', 'Batería del robot', 'Sintaxis de Python'],
    correcta: 1,
  },
  {
    id: 'tipo-error-2',
    texto: '"NameError: name motor_izq is not defined" es un problema de...',
    opciones: ['Conexión', 'Código', 'Red', 'Hardware'],
    correcta: 1,
  },
  {
    id: 'checklist',
    texto: 'Si un motor no gira, ¿qué conviene revisar antes de sospechar del código?',
    opciones: [
      'Reescribir todo el programa de cero',
      'Si el Dashboard lo muestra conectado y el puerto coincide con el cable',
      'Cambiar de computadora',
      'Nada, siempre es un error de código',
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
