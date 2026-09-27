import { MODULOS } from '../../lib/aprendizaje/modulos.js';
import { useProgreso } from './useProgreso.js';
import './Aprendizaje.css';

/**
 * Grilla de módulos disponibles, con barra de progreso por módulo. Es la
 * pantalla que ve el estudiante apenas abre la app.
 */
export default function AprendizajeHome({ onAbrirModulo }) {
  const { contarPasosCompletados, moduloCompletado } = useProgreso();

  return (
    <div className="aprendizaje-home">
      <header className="aprendizaje-home-header">
        <h1>Laboratorio remoto EV3 — Aprendizaje</h1>
        <p>Módulos paso a paso para conocer el robot antes de programarlo de verdad.</p>
      </header>

      <div className="modulo-grid">
        {MODULOS.map(modulo => {
          const pasosIds = modulo.pasos.map(p => p.id);
          const completados = contarPasosCompletados(modulo.id, pasosIds);
          const total = pasosIds.length;
          const terminado = moduloCompletado(modulo.id, pasosIds);

          return (
            <button key={modulo.id} className="modulo-card" onClick={() => onAbrirModulo(modulo.id)}>
              <span className="modulo-card-numero">Módulo {modulo.numero}</span>
              <h2>{modulo.titulo}</h2>
              <p>{modulo.resumen}</p>
              <div className="modulo-card-progreso">
                <div className="modulo-card-barra">
                  <div className="modulo-card-barra-relleno" style={{ width: `${(completados / total) * 100}%` }} />
                </div>
                <span className="modulo-card-progreso-texto">
                  {terminado ? '✓ Completo' : `${completados}/${total} pasos`}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
