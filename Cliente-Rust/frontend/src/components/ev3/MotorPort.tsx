import React, { useEffect, useState } from 'react';
import type { Ev3Motor } from '../../services/hardware/ev3.service';
import './Port.css';

interface MotorPortProps {
  port: string;
  motor?: Ev3Motor;
  onSetSpeed: (port: string, speed: number) => void;
}

/** rpm máximas de un motor grande EV3, para escalar la barra de medida. */
const MAX_RPM = 1050;

const MotorPort: React.FC<MotorPortProps> = ({ port, motor, onSetSpeed }) => {
  const connected = motor?.connected ?? false;

  // El slider es la CONSIGNA en % (-100..100). No se sincroniza con
  // motor.speed, que es la medida real en rpm: meter 700 rpm en un control
  // de -100..100 lo satura y muestra "+700%".
  const [speed, setSpeed] = useState(0);

  useEffect(() => {
    if (!connected) setSpeed(0);
  }, [connected]);

  const handleSlider = (val: number) => {
    setSpeed(val);
    onSetSpeed(port, val);
  };

  const handleStop = () => {
    setSpeed(0);
    onSetSpeed(port, 0);
  };

  const label = port.replace('out', '');
  const rpm = motor?.speed ?? 0;

  if (!connected) {
    return (
      <div className="ev3-row ev3-row-empty">
        <span className="ev3-chip">{label}</span>
        <span className="ev3-row-empty-text">sin motor</span>
      </div>
    );
  }

  // Barra bipolar: el centro es 0, crece a la derecha en positivo y a la
  // izquierda en negativo, igual que el signo de las rpm.
  const magnitude = Math.min(Math.abs(rpm) / MAX_RPM, 1) * 50;

  return (
    <div className="ev3-row ev3-row-motor">
      <span className="ev3-chip ev3-chip-motor">{label}</span>

      <div className="ev3-row-body">
        <div className="ev3-meter" aria-hidden="true">
          <span className="ev3-meter-zero" />
          <span
            className="ev3-meter-fill"
            style={{
              left: rpm >= 0 ? '50%' : `${50 - magnitude}%`,
              width: `${magnitude}%`,
            }}
          />
        </div>

        <input
          type="range"
          min={-100}
          max={100}
          value={speed}
          onChange={e => handleSlider(parseInt(e.target.value, 10))}
          className="ev3-range"
          aria-label={`Velocidad del motor ${label}`}
        />
      </div>

      <div className="ev3-readout">
        <span className="ev3-readout-main">{rpm}<span className="ev3-unit">rpm</span></span>
        <span className="ev3-readout-sub">{speed > 0 ? '+' : ''}{speed}%</span>
      </div>

      <button
        className="ev3-stop"
        onClick={handleStop}
        disabled={speed === 0}
        title={`Detener motor ${label}`}
      >
        <span />
      </button>
    </div>
  );
};

export default MotorPort;
