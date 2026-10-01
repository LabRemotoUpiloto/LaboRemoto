export default function PasoPlanDeTrabajo() {
  return (
    <div className="paso">
      <h2>Cómo planificarlo</h2>
      <p>Encarar todo el desafío de una vez suele terminar en un programa difícil de depurar. Un orden que funciona bien:</p>

      <ol>
        <li>
          <strong>Dibujá el recorrido aproximado</strong> en papel, aunque después una parte
          la reemplaces por comportamiento reactivo — te da una referencia de distancias y giros.
        </li>
        <li>
          <strong>Identificá qué tramos necesitan sensores</strong> (seguir línea, esquivar) y cuáles pueden
          ser una ruta planeada fija (Módulo 3).
        </li>
        <li>
          <strong>Escribí y probá cada comportamiento por separado</strong>: primero que siga la línea sin
          preocuparte del obstáculo, después que esquive sin preocuparte de la línea. Combinarlos antes de que
          cada uno funcione solo hace más difícil saber cuál está fallando.
        </li>
        <li>
          <strong>Uní todo con una máquina de estados</strong> (Módulos 4 y 5) — cada comportamiento probado
          se convierte en un estado.
        </li>
        <li>
          <strong>Agregá manejo de errores</strong> donde tenga sentido (Módulo 5) y usá el checklist de
          diagnóstico (Módulo 6) apenas algo no funcione como esperabas.
        </li>
      </ol>

      <p>No hace falta terminar todo en una sola sesión — es exactamente el tipo de proyecto que conviene dejar a medio armar de un día para el otro, con lo que ya funciona guardado aparte.</p>
    </div>
  );
}
