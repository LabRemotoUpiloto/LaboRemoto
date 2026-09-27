import { useState } from 'react';

const CRITERIOS = [
  'El robot completa el recorrido de punta a punta.',
  'Sigue la línea en el tramo correspondiente sin perderla en las curvas.',
  'Detecta el obstáculo y reacciona antes de chocarlo.',
  'El tramo de ruta planeada llega a destino sin depender de sensores.',
  'El código maneja al menos un caso de error posible (sensor desconectado, lectura fuera de rango).',
  'Dejaste el robot detenido y sin scripts corriendo al terminar (Módulo 7).',
];

/**
 * Autoevaluación, no un quiz calificado — el proyecto integrador no tiene
 * una única respuesta correcta que se pueda validar con opción múltiple.
 */
export default function PasoChecklistFinal() {
  const [marcados, setMarcados] = useState({});
  const completados = Object.values(marcados).filter(Boolean).length;

  return (
    <div className="paso">
      <h2>Autoevaluación</h2>
      <p>No hay una corrección automática para este proyecto — marcá honestamente qué lograste. Es una guía para vos, no un examen.</p>

      <div className="checklist">
        {CRITERIOS.map((texto, i) => (
          <label key={i} className={`checklist-item ${marcados[i] ? 'marcado' : ''}`}>
            <input type="checkbox" checked={!!marcados[i]} onChange={() => setMarcados(p => ({ ...p, [i]: !p[i] }))} />
            <span>{texto}</span>
          </label>
        ))}
      </div>

      <p>{completados}/{CRITERIOS.length} criterios marcados.</p>

      {completados === CRITERIOS.length ? (
        <div className="quiz-resultado aprobado">
          Recorriste los ocho módulos y armaste un proyecto que combina sensores, movimiento preciso y manejo
          de errores — eso es, en esencia, todo lo que hace falta para empezar a resolver problemas nuevos con
          el EV3 por tu cuenta.
        </div>
      ) : (
        <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Los criterios sin marcar son un buen punto de partida para la próxima sesión.
        </p>
      )}
    </div>
  );
}
