import React from 'react';
import type { Ev3Sensor } from '../../services/hardware/ev3.service';
import './Port.css';

const SENSOR_LABELS: Record<string, string> = {
  Touch: 'Táctil',
  Ultrasonic: 'Ultrasónico',
  Color: 'Color',
  Gyro: 'Giroscopio',
  Infrared: 'Infrarrojo',
};

interface SensorPortProps {
  port: string;
  sensor?: Ev3Sensor;
}

const SensorPort: React.FC<SensorPortProps> = ({ port, sensor }) => {
  const label = port.replace('in', '');

  if (!sensor) {
    return (
      <div className="ev3-tile ev3-tile-empty">
        <span className="ev3-chip">{label}</span>
        <span className="ev3-tile-empty-text">vacío</span>
      </div>
    );
  }

  return (
    <div className="ev3-tile">
      <div className="ev3-tile-head">
        <span className="ev3-chip ev3-chip-sensor">{label}</span>
        <span className="ev3-tile-type">
          {SENSOR_LABELS[sensor.sensor_type] ?? sensor.sensor_type}
        </span>
      </div>
      <SensorValue sensor={sensor} />
    </div>
  );
};

/** Barra de progreso 0..1 con color propio. */
const Bar: React.FC<{ pct: number; color: string }> = ({ pct, color }) => (
  <div className="ev3-bar" aria-hidden="true">
    <span className="ev3-bar-fill" style={{ width: `${pct * 100}%`, background: color }} />
  </div>
);

const SensorValue: React.FC<{ sensor: Ev3Sensor }> = ({ sensor }) => {
  const { sensor_type, value } = sensor;

  if (sensor_type === 'Touch') {
    const pressed = value !== 0;
    return (
      <div className="ev3-tile-value">
        <span className={`ev3-touch ${pressed ? 'is-pressed' : ''}`}>
          {pressed ? 'presionado' : 'suelto'}
        </span>
      </div>
    );
  }

  if (sensor_type === 'Ultrasonic') {
    const pct = Math.min(value / 255, 1);
    // Verde de cerca a rojo de lejos: el estudiante lee "peligro de choque"
    // sin tener que interpretar el número.
    return (
      <div className="ev3-tile-value">
        <span className="ev3-readout-main">{value.toFixed(0)}<span className="ev3-unit">cm</span></span>
        <Bar pct={pct} color={`hsl(${120 - pct * 120}, 65%, 48%)`} />
      </div>
    );
  }

  if (sensor_type === 'Infrared') {
    const pct = Math.min(value / 100, 1);
    return (
      <div className="ev3-tile-value">
        <span className="ev3-readout-main">{value.toFixed(0)}<span className="ev3-unit">%</span></span>
        <Bar pct={pct} color="var(--accent-primary)" />
      </div>
    );
  }

  if (sensor_type === 'Gyro') {
    return (
      <div className="ev3-tile-value">
        <span className="ev3-readout-main">{value.toFixed(0)}<span className="ev3-unit">°</span></span>
      </div>
    );
  }

  return (
    <div className="ev3-tile-value">
      <span className="ev3-readout-main">{value.toFixed(1)}</span>
    </div>
  );
};

export default SensorPort;
