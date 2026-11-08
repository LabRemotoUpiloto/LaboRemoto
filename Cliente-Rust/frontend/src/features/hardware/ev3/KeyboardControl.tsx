import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Ev3Status } from '../ev3.service';
import './KeyboardControl.css';

const PORTS = ['outA', 'outB', 'outC', 'outD'];

/** true si la tecla va a un campo donde se escribe (input, textarea, editor o la terminal de xterm). */
export function esCampoDeTexto(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  // Sliders, casillas y botones no escriben texto: ahí W/A/S/D siguen moviendo el robot.
  const tipo = (target as HTMLInputElement).type;
  return !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color'].includes(tipo);
}

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
  // Las teclas apretadas viven también en un ref: los manejadores y la limpieza al desmontar leen siempre el valor
  // actual, y las órdenes al robot salen fuera de los actualizadores de estado (que React puede llamar dos veces).
  const teclasRef = useRef<Set<string>>(new Set());
  const ruedasRef = useRef({ leftPort, rightPort, onSetSpeed });
  ruedasRef.current = { leftPort, rightPort, onSetSpeed };

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

  /** Frena las dos ruedas si alguna tecla seguía apretada. */
  const soltarTodo = useCallback(() => {
    if (teclasRef.current.size === 0) return;
    teclasRef.current = new Set();
    const { leftPort: izq, rightPort: der, onSetSpeed: mover } = ruedasRef.current;
    mover(izq, 0);
    mover(der, 0);
  }, []);

  useEffect(() => {
    const actualizar = (teclas: Set<string>) => {
      teclasRef.current = teclas;
      setActiveKeys(teclas);
      sendMove(teclas);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Mientras se escribe (chat, consola, cualquier campo) las letras son letras, no órdenes al robot.
      if (esCampoDeTexto(e.target)) return;
      const key = e.key.toLowerCase();
      if (!['w', 'a', 's', 'd', ' '].includes(key)) return;
      e.preventDefault();

      if (key === ' ') {
        teclasRef.current = new Set();
        setActiveKeys(new Set());
        onSetSpeed(leftPort, 0);
        onSetSpeed(rightPort, 0);
        return;
      }

      // La repetición automática de una tecla sostenida no cambia el movimiento.
      if (teclasRef.current.has(key)) return;
      actualizar(new Set(teclasRef.current).add(key));
    };

    // Soltar nunca se filtra por el campo con foco: si W se apretó fuera del chat y se suelta dentro, el robot debe
    // frenar igual. Solo cuentan las teclas que este control había tomado (escribir «w» en el chat no manda nada).
    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!teclasRef.current.has(key)) return;
      const next = new Set(teclasRef.current);
      next.delete(key);
      actualizar(next);
    };

    // Si la ventana pierde el foco con una tecla apretada, el keyup nunca llega.
    const handleBlur = () => {
      soltarTodo();
      setActiveKeys(new Set());
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [leftPort, rightPort, sendMove, onSetSpeed, soltarTodo]);

  // Cerrar el cajón de Motores (o el panel) con una tecla apretada desmonta el control: el robot se frena.
  useEffect(() => soltarTodo, [soltarTodo]);

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
