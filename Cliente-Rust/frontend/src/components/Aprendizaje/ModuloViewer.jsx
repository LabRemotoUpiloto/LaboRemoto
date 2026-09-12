import { useState } from 'react';
import { MODULOS } from '../../lib/aprendizaje/modulos.js';
import { useProgreso } from './useProgreso.js';
import './Aprendizaje.css';

/**
 * Shell genérico de un módulo: la navegación entre pasos y el tracking de
 * progreso son iguales para todos los módulos — lo único que cambia es
 * `moduloId` y qué componente renderiza cada paso. Cada módulo tiene un
 * archivo finito (p.ej. `ModuloSensoresEnAccion.jsx`) que solo arma
 * `componentePorPaso` y le pasa esto a `ModuloViewer`.
 *
 * El paso "quiz" no se auto-completa al apretar "Siguiente" como los demás:
 * se completa solo cuando el propio paso llama a `onCompletado` (aprobó).
 */
export default function ModuloViewer({ moduloId, componentePorPaso, onVolver, onIrATerminal, onIrATrayectoria, status }) {
  const [pasoIndice, setPasoIndice] = useState(0);
  const { pasoCompletado, completarPaso } = useProgreso();
  const modulo = MODULOS.find(m => m.id === moduloId);

  const paso = modulo.pasos[pasoIndice];
  const esUltimoPaso = pasoIndice === modulo.pasos.length - 1;
  const ComponentePaso = componentePorPaso[paso.id];

  function irAPaso(indice) {
    setPasoIndice(Math.min(Math.max(indice, 0), modulo.pasos.length - 1));
  }

  function siguiente() {
    if (paso.id !== 'quiz') completarPaso(moduloId, paso.id);
    if (esUltimoPaso) {
      onVolver();
    } else {
      irAPaso(pasoIndice + 1);
    }
  }

  return (
    <div className="modulo-viewer">
      <aside className="modulo-nav">
        <button className="modulo-nav-volver" onClick={onVolver}>← Módulos</button>
        <h3>{modulo.titulo}</h3>
        <ol className="modulo-nav-pasos">
          {modulo.pasos.map((p, i) => (
            <li
              key={p.id}
              className={`modulo-nav-paso ${i === pasoIndice ? 'activo' : ''}`}
              onClick={() => irAPaso(i)}
            >
              <span className="modulo-nav-paso-marca">{pasoCompletado(moduloId, p.id) ? '✓' : i + 1}</span>
              {p.titulo}
            </li>
          ))}
        </ol>
      </aside>

      <div className="modulo-contenido">
        <ComponentePaso
          onCompletado={() => completarPaso(moduloId, 'quiz')}
          onIrATerminal={onIrATerminal}
          onIrATrayectoria={onIrATrayectoria}
          status={status}
        />
        <div className="modulo-controles">
          <button className="btn" onClick={() => irAPaso(pasoIndice - 1)} disabled={pasoIndice === 0}>
            ← Anterior
          </button>
          <button className="btn btn-primary" onClick={siguiente}>
            {esUltimoPaso ? 'Volver a módulos' : 'Siguiente →'}
          </button>
        </div>
      </div>
    </div>
  );
}
