import { useEffect, useRef, useState } from 'react';

const LIMITE_PX = 60; // qué tan lejos del centro puede llegar el ícono antes de "envolver"

/**
 * Explica en palabras qué le pasa al robot dado un par de potencias — la
 * misma lógica que después se ve en `cinematica.js` (avanzar/girar son
 * casos particulares de esto), pero en texto simple para quien recién
 * empieza.
 */
function describirMovimiento(izq, der) {
  if (izq === 0 && der === 0) return 'El robot está detenido: ningún motor recibe potencia.';
  if (izq === der) {
    return izq > 0
      ? 'Las dos ruedas giran igual, hacia adelante: el robot avanza en línea recta.'
      : 'Las dos ruedas giran igual, hacia atrás: el robot retrocede en línea recta.';
  }
  if (izq === -der) {
    return der > 0
      ? 'Las ruedas giran en sentidos opuestos con la misma fuerza: el robot gira sobre su propio eje, hacia la izquierda.'
      : 'Las ruedas giran en sentidos opuestos con la misma fuerza: el robot gira sobre su propio eje, hacia la derecha.';
  }
  const seMueveAdelante = izq + der > 0;
  if (Math.sign(izq) !== Math.sign(der) && izq !== 0 && der !== 0) {
    return 'Las ruedas giran en sentidos opuestos y con distinta fuerza: el robot gira sobre sí mismo, más rápido hacia un lado que hacia el otro.';
  }
  return izq > der
    ? `El motor izquierdo gira más fuerte que el derecho: el robot ${seMueveAdelante ? 'avanza' : 'retrocede'} trazando una curva hacia la derecha.`
    : `El motor derecho gira más fuerte que el izquierdo: el robot ${seMueveAdelante ? 'avanza' : 'retrocede'} trazando una curva hacia la izquierda.`;
}

export default function PasoMovimientos() {
  const [potenciaIzq, setPotenciaIzq] = useState(50);
  const [potenciaDer, setPotenciaDer] = useState(50);
  const [pose, setPose] = useState({ x: 0, y: 0, th: -90 });

  // Las potencias viven también en un ref para que el loop de animación
  // siempre lea el valor más reciente sin tener que reiniciar el efecto
  // (y su `requestAnimationFrame`) cada vez que se mueve un slider.
  const potenciasRef = useRef({ izq: potenciaIzq, der: potenciaDer });
  potenciasRef.current = { izq: potenciaIzq, der: potenciaDer };

  useEffect(() => {
    let frameId;
    let ultimo = performance.now();

    function tick(ahora) {
      const dtS = Math.min((ahora - ultimo) / 1000, 0.1); // clamp por si la pestaña estuvo en background
      ultimo = ahora;
      const { izq, der } = potenciasRef.current;

      setPose(p => {
        const v = ((izq + der) / 2) * 0.25; // px/seg — solo para que la demo se vea bien, no es físico
        const w = ((der - izq) / 40) * 60; // °/seg
        const thRad = (p.th * Math.PI) / 180;
        let x = p.x + v * dtS * Math.cos(thRad);
        let y = p.y + v * dtS * Math.sin(thRad);
        // Al llegar al borde del recuadro, reaparece del otro lado — así la
        // demo puede quedar andando sin "escaparse" del cuadrito.
        if (x > LIMITE_PX) x = -LIMITE_PX;
        if (x < -LIMITE_PX) x = LIMITE_PX;
        if (y > LIMITE_PX) y = -LIMITE_PX;
        if (y < -LIMITE_PX) y = LIMITE_PX;
        return { x, y, th: p.th + w * dtS };
      });

      frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, []);

  function preset(izq, der) {
    setPotenciaIzq(izq);
    setPotenciaDer(der);
  }

  return (
    <div className="paso">
      <h2>Movimientos básicos</h2>
      <p>
        Cada motor gira de forma independiente, a una potencia de -100% a 100%. No existe un comando especial
        para "girar" o "avanzar": todos los movimientos del robot salen de combinar dos números, uno por rueda.
      </p>

      <div className="movimientos-widget">
        <div className="movimientos-sliders">
          <div className="movimientos-slider">
            <label><span>Rueda izquierda</span><span>{potenciaIzq}%</span></label>
            <input type="range" min={-100} max={100} value={potenciaIzq} onChange={e => setPotenciaIzq(Number(e.target.value))} />
          </div>
          <div className="movimientos-slider">
            <label><span>Rueda derecha</span><span>{potenciaDer}%</span></label>
            <input type="range" min={-100} max={100} value={potenciaDer} onChange={e => setPotenciaDer(Number(e.target.value))} />
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => preset(50, 50)}>Adelante</button>
            <button className="btn" onClick={() => preset(-50, 50)}>Girar izq.</button>
            <button className="btn" onClick={() => preset(50, -50)}>Girar der.</button>
            <button className="btn" onClick={() => preset(0, 0)}>Detener</button>
          </div>
        </div>

        <svg className="movimientos-preview" viewBox="0 0 150 150">
          <g transform={`translate(${75 + pose.x} ${75 + pose.y}) rotate(${pose.th + 90})`}>
            <rect x="-10" y="-14" width="20" height="28" rx="4" fill="#007acc" />
            <polygon points="0,-20 -6,-12 6,-12" fill="#4ec94e" />
          </g>
        </svg>

        <p className="movimientos-explicacion">{describirMovimiento(potenciaIzq, potenciaDer)}</p>
      </div>

      <h3>Los cuatro casos clásicos</h3>
      <ul>
        <li><strong>Avanzar:</strong> las dos ruedas giran igual, hacia adelante (signo +).</li>
        <li><strong>Retroceder:</strong> las dos ruedas giran igual, hacia atrás (signo −).</li>
        <li><strong>Girar en el lugar:</strong> las ruedas giran con la misma fuerza pero en sentidos opuestos.</li>
        <li><strong>Curva:</strong> las ruedas giran hacia el mismo lado pero con distinta fuerza — la más lenta marca hacia dónde se curva.</li>
      </ul>
      <p>
        Esta misma idea, formalizada con las medidas reales del robot (diámetro de rueda, distancia entre
        ruedas), es la que permite armar rutas completas en el Módulo 3.
      </p>
    </div>
  );
}
