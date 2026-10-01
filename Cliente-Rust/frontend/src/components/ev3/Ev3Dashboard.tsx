import React from 'react';
import type { Ev3Status } from '../../services/hardware/ev3.service';
import MotorPort from './MotorPort';
import SensorPort from './SensorPort';
import KeyboardControl from './KeyboardControl';
import './Ev3Dashboard.css';

const MOTOR_PORTS = ['outA', 'outB', 'outC', 'outD'];
const SENSOR_PORTS = ['in1', 'in2', 'in3', 'in4'];

interface Ev3DashboardProps {
  status: Ev3Status | null;
  onSetSpeed: (port: string, speed: number) => void;
  onStopAll: () => void;
}

/**
 * Puerto a puerto igual que el Dashboard de investigacion_ev3 (rama
 * luisa-tauri), sin el selector de modo simulado/real ni el campo de IP: en
 * la práctica de LaboRemoto la conexión del robot la fijan los comandos de
 * arranque del módulo (`environment.setup_commands`, ver
 * cmd::practices::linux_api::practicas_module_setup); el estudiante no la edita.
 */
const Ev3Dashboard: React.FC<Ev3DashboardProps> = ({ status, onSetSpeed, onStopAll }) => {
  return (
    <div className="ev3-dashboard">
      <div className="ev3-status-bar">
        <div className="ev3-status-left">
          <span className={`ev3-status-dot ${status?.connected ? 'online' : 'offline'}`} />
          <span className="ev3-status-text">{status?.connected ? 'Conectado' : 'Sin conexión'}</span>
          <span className="ev3-ip-display">{status?.ip ?? '—'}</span>
        </div>
        <div className="ev3-status-right">
          <span className="ev3-battery" title="Batería del ladrillo">
            {status?.battery?.toFixed(2) ?? '—'}<span className="ev3-unit">V</span>
          </span>
          <button className="ev3-stop-all" onClick={onStopAll}>Detener todo</button>
        </div>
      </div>

      <div className="ev3-dashboard-main">
        <section className="ev3-section">
          <h2 className="ev3-section-title">Motores <span>output</span></h2>
          <div className="ev3-motor-list">
            {MOTOR_PORTS.map(port => {
              const motor = status?.motors?.find(m => m.port === port);
              return <MotorPort key={port} port={port} motor={motor} onSetSpeed={onSetSpeed} />;
            })}
          </div>
        </section>

        <section className="ev3-section">
          <h2 className="ev3-section-title">Sensores <span>input</span></h2>
          <div className="ev3-sensor-grid">
            {SENSOR_PORTS.map(port => {
              const sensor = status?.sensors?.find(s => s.port === port);
              return <SensorPort key={port} port={port} sensor={sensor} />;
            })}
          </div>
        </section>
      </div>

      <KeyboardControl status={status} onSetSpeed={onSetSpeed} />

      {status?.alerts && status.alerts.length > 0 && (
        <div className="ev3-alerts">
          {status.alerts.map((a, i) => (
            <div key={i} className="ev3-alert">⚠ {a}</div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Ev3Dashboard;
