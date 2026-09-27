import { useState } from 'react';
import DiagramaEv3 from './DiagramaEv3.jsx';

const INFO_PUERTO = {
  motor: {
    titulo: id => `Puerto de salida out${id}`,
    descripcion:
      'Acá se conecta un motor. El programa le manda una velocidad de -100% a 100%: el signo define el sentido de giro, la magnitud la fuerza. Nunca hay que adivinar el puerto por el nombre del motor — es literalmente el cable físico que está enchufado ahí.',
  },
  sensor: {
    titulo: id => `Puerto de entrada in${id}`,
    descripcion:
      'Acá se conecta un sensor. El programa lee su valor — una distancia en cm, si está presionado, un color — para decidir qué hacer. A diferencia de un motor, un sensor nunca recibe órdenes: solo informa.',
  },
};

/**
 * Diagrama interactivo del ladrillo. Si `status` trae un robot conectado
 * (real o el simulador local), el diagrama superpone qué puertos están
 * conectados ahora mismo — si no, es solo el diagrama de referencia.
 */
export default function PasoPuertos({ status }) {
  const [seleccionado, setSeleccionado] = useState({ tipo: 'motor', id: 'A' });

  const estado = status?.connected
    ? {
        motors: Object.fromEntries((status.motors ?? []).map(m => [m.port.replace('out', ''), m])),
        // App.jsx ya filtra `status.sensors` a solo los conectados (a
        // diferencia de los motores, no trae un campo `connected` propio) —
        // estar en esta lista ES la señal de que está conectado.
        sensors: Object.fromEntries(
          (status.sensors ?? []).map(s => [s.port.replace('in', ''), { ...s, connected: true }])
        ),
      }
    : null;

  const info = INFO_PUERTO[seleccionado.tipo];
  const puertoEstado = estado
    ? seleccionado.tipo === 'motor'
      ? estado.motors[seleccionado.id]
      : estado.sensors[seleccionado.id]
    : null;

  return (
    <div className="paso">
      <h2>Puertos del ladrillo</h2>
      <p>
        El EV3 tiene 4 puertos de <strong>salida</strong> (<code>outA</code> a <code>outD</code>, para motores) y
        4 de <strong>entrada</strong> (<code>in1</code> a <code>in4</code>, para sensores). No son nombres que
        inventó esta app: son los mismos que usa el sistema operativo del robot (ev3dev) y los que vas a ver en
        el Dashboard.
      </p>
      <p>Hacé clic en un puerto del diagrama para ver qué hace.</p>

      <div className="diagrama-ev3-wrap">
        <DiagramaEv3
          seleccionado={seleccionado}
          onSeleccionar={(tipo, id) => setSeleccionado({ tipo, id })}
          estado={estado}
        />
        <div className="diagrama-ev3-detalle">
          <h4>{info.titulo(seleccionado.id)}</h4>
          <p>{info.descripcion}</p>
          {estado ? (
            <span className="diagrama-ev3-estado">
              <span
                className="diagrama-ev3-estado-dot"
                style={{ background: puertoEstado?.connected ? 'var(--success)' : 'var(--text-muted)' }}
              />
              {puertoEstado?.connected ? 'Conectado ahora mismo' : 'Vacío en este robot'}
            </span>
          ) : (
            <p className="diagrama-ev3-detalle-vacio">
              Sin robot conectado en este momento — esto es solo el diagrama de referencia.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
