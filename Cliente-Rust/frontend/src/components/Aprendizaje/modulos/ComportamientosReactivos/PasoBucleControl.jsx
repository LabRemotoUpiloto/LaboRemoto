import { useState } from 'react';

export default function PasoBucleControl() {
  const [vueltas, setVueltas] = useState(0);

  return (
    <div className="paso">
      <h2>El bucle de control</h2>
      <p>
        En el Módulo 2 leíste un sensor <strong>una vez</strong> y tomaste una decisión. Un comportamiento de
        verdad — seguir una línea, esquivar algo — necesita leer el sensor <strong>todo el tiempo</strong>,
        cientos de veces por segundo, y ajustar el movimiento en cada vuelta. Eso es un bucle de control:
      </p>

      <pre>{`while True:
    valor = sensor.value()
    # decidir algo con "valor"
    # mover los motores según lo decidido`}</pre>

      <p>
        No hace falta un <code>sleep()</code> entre vueltas: el bucle corre tan rápido como el procesador lo
        permita, así que el robot reacciona casi al instante a cualquier cambio.
      </p>

      <div className="sensor-demo">
        <button className="btn btn-primary" onClick={() => setVueltas(v => v + 1)}>
          Simular una vuelta del bucle
        </button>
        <div className="sensor-demo-valor">
          <span>vueltas del bucle simuladas</span>
          <strong>{vueltas}</strong>
        </div>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
          En el robot real, esto pasaría cientos de veces mientras vos hacés un solo clic.
        </p>
      </div>

      <p>Los próximos dos pasos muestran las dos decisiones más comunes que se toman dentro de un bucle así: seguir una línea, y evitar un obstáculo.</p>
    </div>
  );
}
