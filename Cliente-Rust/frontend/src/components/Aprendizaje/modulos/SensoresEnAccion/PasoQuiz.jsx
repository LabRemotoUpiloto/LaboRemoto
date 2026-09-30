import { useState } from 'react';

const PREGUNTAS = [
  {
    id: 'valor-tacto',
    texto: '¿Qué tipo de valor devuelve un sensor de contacto?',
    opciones: ['Un número de 0 a 100', 'Verdadero/Falso (presionado o no)', 'Una distancia en cm', 'Un código de color'],
    correcta: 1,
  },
  {
    id: 'unidad-ultrasonido',
    texto: '¿En qué unidad mide el sensor ultrasónico?',
    opciones: ['Grados', 'Centímetros', 'Porcentaje', 'Voltios'],
    correcta: 1,
  },
  {
    id: 'luz-reflejada',
    texto: 'En modo luz reflejada, ¿qué significa un valor bajo (cercano a 0)?',
    opciones: ['Superficie muy clara', 'Superficie muy oscura', 'El sensor está roto', 'No hay superficie debajo'],
    correcta: 1,
  },
  {
    id: 'is-pressed',
    texto: '¿Por qué if touch.is_pressed(): (con paréntesis) es un error típico?',
    opciones: [
      'is_pressed es una propiedad, no un método — no se llama con ()',
      'Python no permite usar if con sensores',
      'Falta importar la librería random',
      'El puerto está mal escrito',
    ],
    correcta: 0,
  },
  {
    id: 'reactivo',
    texto: '¿Cuál es la idea central de un programa "reactivo"?',
    opciones: [
      'Ejecutar todo de una vez, sin condiciones',
      'Leer un sensor y decidir una acción según su valor',
      'Usar solo motores, nunca sensores',
      'Programar sin loops',
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
