import { useState } from 'react';

// Los tres primeros son mensajes reales de esta misma app (Dashboard y
// consola del navegador) — no son inventados para el ejercicio.
const SINTOMAS = [
  { id: 'sin-backend', texto: '"Sin conexión con el backend" en la barra roja del Dashboard', tipo: 'conexion' },
  { id: 'err-refused', texto: '"ERR_CONNECTION_REFUSED" en la consola del navegador', tipo: 'conexion' },
  { id: 'motor-desconectado', texto: '"Motor outC desconectado" en la lista de alertas', tipo: 'conexion' },
  { id: 'nameerror', texto: 'El programa se cierra con "NameError: name motor_izq is not defined"', tipo: 'codigo' },
  { id: 'typeerror', texto: '"TypeError: \'bool\' object is not callable"', tipo: 'codigo' },
  { id: 'logica', texto: 'El robot corre, pero gira para el lado contrario al que esperabas', tipo: 'codigo' },
];

export default function PasoConexionVsCodigo() {
  const [respuestas, setRespuestas] = useState({});

  function responder(sintoma, elegido) {
    if (respuestas[sintoma.id]) return;
    setRespuestas(prev => ({ ...prev, [sintoma.id]: { elegido, correcto: elegido === sintoma.tipo } }));
  }

  return (
    <div className="paso">
      <h2>¿Conexión o código?</h2>
      <p>
        Cuando algo no funciona, la primera pregunta útil es separar el problema en dos categorías, porque se
        arreglan en lugares completamente distintos:
      </p>

      <div className="paso-tarjetas">
        <div className="paso-tarjeta">
          <h4>Problema de conexión</h4>
          <p>El backend, el robot o un cable no están donde el programa espera que estén. Tu código en sí podría estar perfecto.</p>
        </div>
        <div className="paso-tarjeta">
          <h4>Problema de código</h4>
          <p>Todo está conectado, pero el programa hace algo distinto de lo que querías — un error de sintaxis, una fórmula mal escrita, una lógica invertida.</p>
        </div>
      </div>

      <h3>Clasificá estos síntomas reales</h3>
      {SINTOMAS.map(sintoma => {
        const respuesta = respuestas[sintoma.id];
        const estado = respuesta ? (respuesta.correcto ? 'correcto' : 'incorrecto') : '';
        return (
          <div key={sintoma.id} className={`clasificar-item ${estado}`}>
            <span>{sintoma.texto}</span>
            {respuesta ? (
              <span className="clasificar-resultado">{respuesta.correcto ? '✓' : `✗ era ${sintoma.tipo}`}</span>
            ) : (
              <span className="clasificar-botones">
                <button className="btn" onClick={() => responder(sintoma, 'conexion')}>Conexión</button>
                <button className="btn" onClick={() => responder(sintoma, 'codigo')}>Código</button>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
