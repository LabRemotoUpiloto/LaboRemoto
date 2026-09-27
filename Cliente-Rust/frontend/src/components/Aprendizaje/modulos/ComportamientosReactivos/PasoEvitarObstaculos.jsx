import { useState } from 'react';

const ZONA_PELIGRO = 15;
const ZONA_PRECAUCION = 40;

function zonaDe(distancia) {
  if (distancia < ZONA_PELIGRO) return { nombre: 'peligro', etiqueta: 'PELIGRO' };
  if (distancia < ZONA_PRECAUCION) return { nombre: 'precaucion', etiqueta: 'PRECAUCIÓN' };
  return { nombre: 'libre', etiqueta: 'LIBRE' };
}

export default function PasoEvitarObstaculos() {
  const [distancia, setDistancia] = useState(80);
  const zona = zonaDe(distancia);

  const acciones = {
    libre: 'Avanzar a potencia normal.',
    precaucion: 'Reducir la potencia — hay algo cerca, pero todavía hay margen.',
    peligro: 'Detenerse y girar para buscar otro camino.',
  };

  return (
    <div className="paso">
      <h2>Evitar obstáculos</h2>
      <p>
        En el Módulo 2 usaste un solo umbral con el sensor ultrasónico. Un comportamiento más prolijo separa
        la distancia en <strong>zonas</strong>, cada una con su propia reacción — así el robot empieza a
        reaccionar antes de estar a punto de chocar.
      </p>

      <div className="sensor-demo">
        <input type="range" min={0} max={100} value={distancia} onChange={e => setDistancia(Number(e.target.value))} />
        <div className="sensor-demo-valor">
          <span>ultrasonico.distance_centimeters</span>
          <strong>
            {distancia} cm <span className={`zona-badge ${zona.nombre}`}>{zona.etiqueta}</span>
          </strong>
        </div>
      </div>

      <pre>{`distancia = ultrasonico.distance_centimeters
if distancia < ${ZONA_PELIGRO}:
    motor_izq.off(); motor_der.off()
    girar(90)
elif distancia < ${ZONA_PRECAUCION}:
    motor_izq.on(15); motor_der.on(15)
else:
    motor_izq.on(40); motor_der.on(40)`}</pre>

      <p>Con {distancia}cm ({zona.etiqueta.toLowerCase()}): {acciones[zona.nombre]}</p>
    </div>
  );
}
