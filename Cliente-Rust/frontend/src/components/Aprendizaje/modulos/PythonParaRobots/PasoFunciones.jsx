import { useState } from 'react';

const OPCIONES = [
  { id: 'a', texto: 'motor.on_for_degrees(speed=30, degrees=grados)', correcta: true },
  { id: 'b', texto: 'return grados', correcta: false },
  { id: 'c', texto: 'print(grados)', correcta: false },
  { id: 'd', texto: 'motor.on(grados)', correcta: false },
];

const EXPLICACION = {
  a: 'Exacto — se calculan los grados y se le pide al motor que gire exactamente esa cantidad.',
  b: 'Eso solo devuelve el número calculado — la función terminaría sin haber movido el motor.',
  c: 'Eso imprime el número en la consola, pero el motor nunca recibe la orden de moverse.',
  d: 'on() espera una potencia (-100 a 100), no una cantidad de grados — el motor giraría a una velocidad sin sentido.',
};

/**
 * Reutiliza la fórmula real de cinematica.js (grados por cm) para armar
 * una función — conecta el Módulo 3 con la idea de "empaquetar" una
 * fórmula repetida en algo reutilizable.
 */
export default function PasoFunciones() {
  const [elegida, setElegida] = useState(null);
  const opcion = OPCIONES.find(o => o.id === elegida);

  return (
    <div className="paso">
      <h2>Funciones reutilizables</h2>
      <p>
        En el Módulo 3 calculaste a mano cuántos grados hacen falta para avanzar una distancia exacta. Si esa
        cuenta se repite en varios lugares del programa, conviene empaquetarla en una <strong>función</strong>{' '}
        — se escribe una vez, se usa las veces que haga falta.
      </p>

      <p>Completá la línea que falta para que la función realmente mueva el motor:</p>

      <pre>{`def avanzar_cm(motor, cm, diametro_rueda):
    grados = cm * (360 / (3.1416 * diametro_rueda))
    ${elegida ? opcion.texto : '_______________________________________'}

avanzar_cm(motor_izq, 20, 5.6)`}</pre>

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

      <p>
        A partir de acá, cualquier parte del programa que necesite avanzar una distancia exacta llama a{' '}
        <code>avanzar_cm(...)</code> en vez de repetir la fórmula — si un día cambiás de rueda, corregís un
        solo lugar.
      </p>
    </div>
  );
}
