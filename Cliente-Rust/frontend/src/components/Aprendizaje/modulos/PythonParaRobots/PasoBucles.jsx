import { useState } from 'react';

const OPCIONES = [
  { id: 'a', texto: '0, 1, 2, 3, 4', correcta: true },
  { id: 'b', texto: '1, 2, 3, 4, 5', correcta: false },
  { id: 'c', texto: '0, 1, 2, 3, 4, 5', correcta: false },
  { id: 'd', texto: 'Un error', correcta: false },
];

export default function PasoBucles() {
  const [elegida, setElegida] = useState(null);
  const opcion = OPCIONES.find(o => o.id === elegida);

  return (
    <div className="paso">
      <h2>Bucles: while y for</h2>
      <p>
        Ya usaste <code>while True</code> para un comportamiento que corre "para siempre" (hasta que algo lo
        interrumpa con <code>break</code>). Cuando sabés de antemano <strong>cuántas veces</strong> querés
        repetir algo, <code>for</code> es más directo:
      </p>

      <pre>{`for i in range(5):
    motor.on_for_rotations(speed=30, rotations=1)
    print(i)`}</pre>

      <p>
        <code>range(5)</code> genera 5 números, empezando en 0. Esto hace que el motor dé 5 vueltas, e
        imprime en qué vuelta va.
      </p>

      <h3>Probá predecir</h3>
      <p>¿Qué imprime el código de arriba?</p>
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
            ? 'Exacto — range(5) cuenta 0, 1, 2, 3, 4 (5 números, arrancando en 0, sin llegar al 5).'
            : <>range(5) da 5 números arrancando en 0, así que llega hasta el 4, no hasta el 5. <button className="btn" onClick={() => setElegida(null)}>Reintentar</button></>}
        </div>
      )}

      <h3>break y continue</h3>
      <p>
        Dentro de un <code>while True</code>, <code>break</code> corta el bucle por completo (por ejemplo, al
        detectar el sensor de contacto); <code>continue</code> salta directo a la siguiente vuelta sin ejecutar
        el resto del cuerpo del bucle.
      </p>
      <pre>{`while True:
    if touch.is_pressed:
        break   # sale del bucle
    if ultrasonico.distance_centimeters > 200:
        continue   # lectura rara, ignorarla y volver a leer
    motor.on(30)`}</pre>
    </div>
  );
}
