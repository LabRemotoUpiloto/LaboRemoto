import { useState } from 'react';

const POTENCIA_BASE = 40;
const GANANCIA = 0.5;
const OBJETIVO = 50; // punto medio entre negro (0) y blanco (100): el "borde" de la línea

export default function PasoSeguirLinea() {
  const [reflectividad, setReflectividad] = useState(50);

  const error = reflectividad - OBJETIVO;
  const correccion = error * GANANCIA;
  const potenciaIzq = Math.round(POTENCIA_BASE + correccion);
  const potenciaDer = Math.round(POTENCIA_BASE - correccion);

  return (
    <div className="paso">
      <h2>Seguir una línea</h2>
      <p>
        En el Módulo 2 corregiste el rumbo con un umbral fijo: "si es menor a 30, girá para un lado". Un
        seguidor de línea más suave no salta bruscamente entre dos comportamientos — corrige{' '}
        <strong>proporcionalmente</strong> a qué tan lejos está la lectura de un valor objetivo: el borde entre
        la línea y el piso, más o menos a mitad de camino entre negro y blanco.
      </p>

      <div className="sensor-demo">
        <input
          type="range"
          min={0}
          max={100}
          value={reflectividad}
          onChange={e => setReflectividad(Number(e.target.value))}
        />
        <div className="sensor-demo-valor">
          <span>color.reflected_light_intensity (objetivo: {OBJETIVO})</span>
          <strong>{reflectividad}</strong>
        </div>

        <svg viewBox="0 0 260 24" className="sensor-demo-pared">
          <defs>
            <linearGradient id="gradienteLinea" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#111111" />
              <stop offset="100%" stopColor="#f0f0f0" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="260" height="24" fill="url(#gradienteLinea)" />
          <line x1={OBJETIVO * 2.6} y1="0" x2={OBJETIVO * 2.6} y2="24" stroke="#4ec94e" strokeWidth="2" />
          <circle cx={reflectividad * 2.6} cy="12" r="5" fill="#007acc" stroke="#fff" strokeWidth="1" />
        </svg>

        <div className="sensor-demo-valor">
          <span>motor izquierdo</span>
          <strong>{potenciaIzq}%</strong>
        </div>
        <div className="sensor-demo-valor">
          <span>motor derecho</span>
          <strong>{potenciaDer}%</strong>
        </div>
      </div>

      <pre>{`error = color.reflected_light_intensity - ${OBJETIVO}
correccion = error * ${GANANCIA}
motor_izq.on(${POTENCIA_BASE} + correccion)
motor_der.on(${POTENCIA_BASE} - correccion)`}</pre>

      <p>
        El número <code>{GANANCIA}</code> se llama <strong>ganancia</strong>: con una ganancia muy baja el
        robot corrige tarde y se sale de la línea en las curvas cerradas; con una muy alta, corrige de más y
        termina zigzagueando. Encontrar un buen valor es, en la práctica, prueba y error.
      </p>
    </div>
  );
}
