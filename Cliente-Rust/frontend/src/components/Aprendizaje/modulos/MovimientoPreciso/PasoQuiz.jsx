import { useState } from 'react';

const PREGUNTAS = [
  {
    id: 'grados-por-cm',
    texto: '¿Qué determina cuántos grados hay que girar el motor para avanzar 1 cm?',
    opciones: ['El diámetro de la rueda (D)', 'La potencia configurada', 'El color del robot', 'El ancho de vía (E)'],
    correcta: 0,
  },
  {
    id: 'ancho-de-via',
    texto: '¿Qué mide el "ancho de vía" (E)?',
    opciones: ['El diámetro de la rueda', 'La distancia entre las dos ruedas', 'La potencia máxima del motor', 'El largo total del robot'],
    correcta: 1,
  },
  {
    id: 'encoder',
    texto: '¿Qué es el encoder de un motor?',
    opciones: ['Un tipo de sensor de color', 'Un contador interno que acumula cuánto giró el motor', 'La batería que lo alimenta', 'El cable que lo conecta al puerto'],
    correcta: 1,
  },
  {
    id: 'signos-giro',
    texto: 'Al girar el robot sobre su propio eje, ¿qué signos tienen las dos ruedas?',
    opciones: ['Los dos positivos', 'Los dos negativos', 'Opuestos: una avanza, la otra retrocede', 'Da igual, no importa el signo'],
    correcta: 2,
  },
  {
    id: 'para-que-simular',
    texto: '¿Para qué sirve simular una ruta antes de ejecutarla en el robot real?',
    opciones: [
      'No sirve para nada, es solo estético',
      'Para detectar errores en la ruta sin arriesgar al robot físico',
      'Para que el robot se mueva más rápido después',
      'Es obligatorio, la app no deja ejecutar sin simular antes',
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
