const PUERTOS_MOTOR = ['A', 'B', 'C', 'D'];
const PUERTOS_SENSOR = ['1', '2', '3', '4'];
const X_POR_INDICE = [55, 120, 185, 250];

/**
 * Diagrama esquemático (no fotorrealista) del ladrillo EV3: cuerpo, pantalla,
 * cruceta de botones, y los 8 puertos — 4 de salida (motores, borde
 * superior) y 4 de entrada (sensores, borde inferior). Cada puerto es
 * clickeable.
 *
 * `estado` es opcional: si viene (telemetría real del robot conectado),
 * cada puerto se pinta verde si está conectado o gris si no — encima del
 * color base naranja/azul que indica su tipo. Sin `estado`, el diagrama es
 * puramente de referencia (para cuando no hay robot a mano).
 */
export default function DiagramaEv3({ seleccionado, onSeleccionar, estado }) {
  function estiloPuerto(tipo, id) {
    const esSeleccionado = seleccionado?.tipo === tipo && seleccionado?.id === id;
    const infoEstado = tipo === 'motor' ? estado?.motors?.[id] : estado?.sensors?.[id];

    let fill = tipo === 'motor' ? '#3a2f1e' : '#1e2a3a';
    let stroke = tipo === 'motor' ? '#cca700' : '#007acc';

    if (estado) {
      const conectado = !!infoEstado?.connected;
      fill = conectado ? '#1e3a1e' : '#2d2d30';
      stroke = conectado ? '#4ec94e' : '#555555';
    }

    return { fill, stroke, strokeWidth: esSeleccionado ? 3 : 1.5 };
  }

  function manejarTecla(e, tipo, id) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSeleccionar(tipo, id);
    }
  }

  function renderPuerto(tipo, id, x, y, etiqueta) {
    const estilo = estiloPuerto(tipo, id);
    return (
      <g
        key={`${tipo}-${id}`}
        onClick={() => onSeleccionar(tipo, id)}
        onKeyDown={e => manejarTecla(e, tipo, id)}
        role="button"
        tabIndex={0}
        style={{ cursor: 'pointer' }}
      >
        <title>{tipo === 'motor' ? `Puerto de salida out${id}` : `Puerto de entrada in${id}`}</title>
        <rect x={x} y={y} width="30" height="20" rx="3" {...estilo} />
        <text x={x + 15} y={y + 14} textAnchor="middle" fontSize="11" fill="#ddd" fontFamily="monospace">
          {etiqueta}
        </text>
      </g>
    );
  }

  return (
    <svg className="diagrama-ev3-svg" viewBox="0 0 380 240" xmlns="http://www.w3.org/2000/svg">
      {/* Cuerpo */}
      <rect x="40" y="30" width="300" height="170" rx="14" fill="#2d2d30" stroke="#3e3e42" strokeWidth="1.5" />

      {/* Pantalla */}
      <rect x="140" y="48" width="100" height="52" rx="4" fill="#0f172a" stroke="#3e3e42" />
      <text x="190" y="78" textAnchor="middle" fontSize="10" fill="#4ec94e" fontFamily="monospace">EV3</text>

      {/* Cruceta de botones */}
      <circle cx="190" cy="150" r="10" fill="#1e1e1e" stroke="#555" />
      <circle cx="165" cy="150" r="8" fill="#1e1e1e" stroke="#555" />
      <circle cx="215" cy="150" r="8" fill="#1e1e1e" stroke="#555" />
      <circle cx="190" cy="125" r="8" fill="#1e1e1e" stroke="#555" />
      <circle cx="190" cy="175" r="8" fill="#1e1e1e" stroke="#555" />

      {/* Etiquetas de fila */}
      <text x="20" y="26" fontSize="8" fill="#888" fontFamily="monospace">OUT</text>
      <text x="20" y="214" fontSize="8" fill="#888" fontFamily="monospace">IN</text>

      {PUERTOS_MOTOR.map((id, i) => renderPuerto('motor', id, X_POR_INDICE[i], 12, id))}
      {PUERTOS_SENSOR.map((id, i) => renderPuerto('sensor', id, X_POR_INDICE[i], 200, id))}
    </svg>
  );
}
