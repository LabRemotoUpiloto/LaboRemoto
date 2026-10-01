import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getEv3Status, setEv3Motor, stopEv3Motors, type Ev3Status } from '../../services/hardware/ev3.service';
import Ev3Dashboard from './Ev3Dashboard';
import Ev3Twin from './Ev3Twin';
import './Ev3Panel.css';

const POLL_MS = 1000;

interface Ev3PanelProps {
  sessionId: string;
}

/**
 * Contenedor del panel del robot EV3: arma el polling de telemetría y las
 * acciones de motor sobre `ev3.service.ts` (que a su vez tuneliza `curl` por
 * la sesión SSH ya autenticada, ver cmd::hardware::ev3 en el backend), y las
 * reparte entre las dos vistas portadas de investigacion_ev3 (Dashboard y
 * Gemelo 3D). Los módulos de aprendizaje ya no viven acá: son módulos de la
 * API de prácticas (`ev3-m1`..`ev3-m9`) que se leen en el chat. Tampoco se
 * portó la pestaña "Terminal" del proyecto original: LaboRemoto ya tiene su
 * propia terminal SSH para la sesión.
 */
const Ev3Panel: React.FC<Ev3PanelProps> = ({ sessionId }) => {
  const [status, setStatus] = useState<Ev3Status | null>(null);
  const [view, setView] = useState<'dashboard' | 'twin'>('dashboard');
  const cancelledRef = useRef(false);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await getEv3Status(sessionId);
      if (!cancelledRef.current) setStatus(s);
    } catch (e) {
      if (!cancelledRef.current) {
        setStatus(prev => ({
          connected: false,
          ip: prev?.ip ?? '—',
          battery: prev?.battery ?? 0,
          motors: prev?.motors ?? [],
          sensors: prev?.sensors ?? [],
          alerts: [`Error de comunicación: ${e}`],
          reachable: false,
        }));
      }
    }
  }, [sessionId]);

  useEffect(() => {
    cancelledRef.current = false;
    void refreshStatus();
    const it = window.setInterval(refreshStatus, POLL_MS);
    return () => { cancelledRef.current = true; window.clearInterval(it); };
  }, [refreshStatus]);

  const handleSetSpeed = useCallback((port: string, speed: number) => {
    void setEv3Motor(sessionId, port, speed).catch(e => console.error('[EV3] Error moviendo motor:', e));
  }, [sessionId]);

  const handleStopAll = useCallback(() => {
    void stopEv3Motors(sessionId).catch(e => console.error('[EV3] Error deteniendo motores:', e));
  }, [sessionId]);

  return (
    <div className="ev3-panel">
      <div className="ev3-panel-nav">
        <div className="ev3-nav-brand">
          <span className={`ev3-nav-dot ${status?.connected ? 'online' : 'offline'}`} />
          Control EV3
        </div>
        <div className="ev3-nav-tabs">
          <button className={`ev3-nav-tab ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>
            Dashboard
          </button>
          <button className={`ev3-nav-tab ${view === 'twin' ? 'active' : ''}`} onClick={() => setView('twin')}>
            Gemelo 3D
          </button>
        </div>
      </div>

      <div className="ev3-panel-body">
        {view === 'dashboard' && (
          <Ev3Dashboard status={status} onSetSpeed={handleSetSpeed} onStopAll={handleStopAll} />
        )}
        {view === 'twin' && <Ev3Twin status={status} />}
      </div>
    </div>
  );
};

export default Ev3Panel;
