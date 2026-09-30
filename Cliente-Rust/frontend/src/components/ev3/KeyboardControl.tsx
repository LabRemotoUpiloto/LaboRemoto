import React, { useCallback, useEffect, useState } from 'react';
import type { Ev3Status } from '../../services/hardware/ev3.service';
import './KeyboardControl.css';

const PORTS = ['outA', 'outB', 'outC', 'outD'];

interface KeyboardControlProps {
  status: Ev3Status | null;
  onSetSpeed: (port: string, speed: number) => void;
}

const KeyboardControl: React.FC<KeyboardControlProps> = ({ status, onSetSpeed }) => {
  const [expanded, setExpanded] = useState(false);
  const [leftPort, setLeftPort] = useState('outA');
  const [rightPort, setRightPort] = useState('outD');
  const [baseSpeed, setBaseSpeed] = useState(60);
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());

  const motors = status?.motors ?? [];
  const connectedPorts = motors.filter(m => m.connected).map(m => m.port);

  const sendMove = useCallback((keys: Set<string>) => {
    let leftSpeed = 0;
    let rightSpeed = 0;

    if (keys.has('w')) { leftSpeed += baseSpeed; rightSpeed += baseSpeed; }
    if (keys.has('s')) { leftSpeed -= baseSpeed; rightSpeed -= baseSpeed; }
    if (keys.has('a')) { leftSpeed -= baseSpeed; rightSpeed += baseSpeed; }
    if (keys.has('d')) { leftSpeed += baseSpeed; rightSpeed -= baseSpeed; }

    onSetSpeed(leftPort, leftSpeed);
    onSetSpeed(rightPort, rightSpeed);
  }, [leftPort, rightPort, baseSpeed, onSetSpeed]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!['w', 'a', 's', 'd', ' '].includes(key)) return;
      e.preventDefault();

      if (key === ' ') {
        onSetSpeed(leftPort, 0);
        onSetSpeed(rightPort, 0);
        setActiveKeys(new Set());
        return;
      }

      setActiveKeys(prev => {
        const next = new Set(prev);
        next.add(key);
        sendMove(next);
        return next;
      });
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!['w', 'a', 's', 'd'].includes(key)) return;
      setActiveKeys(prev => {
        const next = new Set(prev);
        next.delete(key);
        sendMove(next);
        return next;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [leftPort, rightPort, baseSpeed, sendMove, onSetSpeed]);

  return (
    <div className="kbd-panel">
      <button className="kbd-header" onClick={() => setExpanded(e => !e)}>
        <span className="kbd-title">⌨ Control por teclado</span>
        <span className="kbd-hint">W/A/S/D + Espacio</span>
        <span className="kbd-arrow">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="kbd-body">
          <div className="kbd-config">
            <div className="kbd-config-row">
              <label>Rueda izquierda</label>
              <select value={leftPort} onChange={e => setLeftPort(e.target.value)} className="kbd-select">
                {PORTS.map(p => (
                  <option key={p} value={p}>
                    {p.replace('out', '')} {connectedPorts.includes(p) ? '✓' : '—'}
                  </option>
                ))}
              </select>
            </div>
            <div className="kbd-config-row">
              <label>Rueda derecha</label>
              <select value={rightPort} onChange={e => setRightPort(e.target.value)} className="kbd-select">
                {PORTS.map(p => (
                  <option key={p} value={p}>
                    {p.replace('out', '')} {connectedPorts.includes(p) ? '✓' : '—'}
                  </option>
                ))}
              </select>
            </div>
            <div className="kbd-config-row">
              <label>Velocidad base</label>
              <div className="kbd-speed-row">
                <input
                  type="range" min={10} max={100} value={baseSpeed}
                  onChange={e => setBaseSpeed(parseInt(e.target.value, 10))}
                  className="kbd-slider"
                />
                <span className="kbd-speed-val">{baseSpeed}%</span>
              </div>
            </div>
          </div>

          <div className="kbd-visual">
            <div className="kbd-row">
              <Key label="W" active={activeKeys.has('w')} />
            </div>
            <div className="kbd-row">
              <Key label="A" active={activeKeys.has('a')} />
              <Key label="S" active={activeKeys.has('s')} />
              <Key label="D" active={activeKeys.has('d')} />
            </div>
            <div className="kbd-row">
              <Key label="ESPACIO" active={false} wide />
            </div>
            <div className="kbd-legend">
              <span>W=adelante  S=atrás  A=izq  D=der  Espacio=parar</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Key: React.FC<{ label: string; active: boolean; wide?: boolean }> = ({ label, active, wide }) => (
  <div className={`kbd-key ${active ? 'active' : ''} ${wide ? 'wide' : ''}`}>
    {label}
  </div>
);

export default KeyboardControl;
