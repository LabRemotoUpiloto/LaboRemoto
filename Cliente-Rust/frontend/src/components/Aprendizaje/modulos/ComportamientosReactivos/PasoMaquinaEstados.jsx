import { useState } from 'react';

const TRANSICIONES = {
  buscando: { encontro_linea: 'siguiendo' },
  siguiendo: { perdio_linea: 'buscando', detecto_obstaculo: 'esquivando' },
  esquivando: { obstaculo_despejado: 'buscando' },
};

const ETIQUETAS_ESTADO = {
  buscando: 'Buscando línea',
  siguiendo: 'Siguiendo línea',
  esquivando: 'Evitando obstáculo',
};

const ETIQUETAS_EVENTO = {
  encontro_linea: 'Encontró la línea',
  perdio_linea: 'Perdió la línea',
  detecto_obstaculo: 'Detectó un obstáculo',
  obstaculo_despejado: 'Obstáculo despejado',
};

export default function PasoMaquinaEstados() {
  const [estado, setEstado] = useState('buscando');
  const eventosDisponibles = Object.keys(TRANSICIONES[estado]);

  return (
    <div className="paso">
      <h2>Combinando comportamientos</h2>
      <p>
        Seguir línea y evitar obstáculos son dos comportamientos separados — el robot solo puede estar
        "haciendo" uno a la vez. Una <strong>máquina de estados</strong> es justamente eso: una lista de
        situaciones posibles (estados) y qué evento hace pasar de una a otra.
      </p>

      <div className="estados-widget">
        <div className="estados-diagrama">
          {Object.keys(ETIQUETAS_ESTADO).map(e => (
            <div key={e} className={`estados-caja ${estado === e ? 'activa' : ''}`}>
              {ETIQUETAS_ESTADO[e]}
            </div>
          ))}
        </div>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
          Estado actual: <strong>{ETIQUETAS_ESTADO[estado]}</strong>. Probá disparar un evento:
        </p>
        <div className="estados-eventos">
          {eventosDisponibles.map(ev => (
            <button key={ev} className="btn" onClick={() => setEstado(TRANSICIONES[estado][ev])}>
              {ETIQUETAS_EVENTO[ev]}
            </button>
          ))}
        </div>
      </div>

      <pre>{`estado = "buscando"

while True:
    if estado == "buscando":
        # girar en el lugar hasta encontrar la línea
        if color.reflected_light_intensity < 50:
            estado = "siguiendo"

    elif estado == "siguiendo":
        seguir_linea()
        if ultrasonico.distance_centimeters < 15:
            estado = "esquivando"

    elif estado == "esquivando":
        esquivar()
        if ultrasonico.distance_centimeters > 40:
            estado = "buscando"`}</pre>

      <p>
        Fijate que el bucle principal no cambió de forma — sigue siendo un <code>while True</code>. Lo único
        nuevo es una variable <code>estado</code> que decide qué bloque de código correr en cada vuelta.
      </p>
    </div>
  );
}
