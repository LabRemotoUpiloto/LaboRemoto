export default function PasoElDesafio() {
  return (
    <div className="paso">
      <h2>El desafío</h2>
      <p>Con los siete módulos anteriores ya tenés todas las piezas. Este último no enseña nada nuevo — es la oportunidad de combinarlas en un problema real, sin una respuesta única correcta.</p>

      <h3>Objetivo</h3>
      <p>
        Hacé que el robot recorra un circuito simple que incluya <strong>al menos</strong>:
      </p>
      <ul>
        <li>Un tramo con una línea a seguir (sensor de color).</li>
        <li>Un obstáculo en algún punto del recorrido (sensor ultrasónico).</li>
        <li>Un tramo final donde uses una ruta planeada con precisión, sin depender de sensores — con las cuentas de grados del Módulo 3.</li>
      </ul>

      <p>
        No hay una única forma correcta de armarlo: podés priorizar seguir la línea y solo esquivar cuando el
        obstáculo la corta, o tratar cada tramo como un estado separado de una máquina de estados. Las
        decisiones de diseño son parte del ejercicio.
      </p>

      <p>Si no tenés un circuito físico armado, también vale calcular el recorrido completo en papel y describir en palabras dónde y cómo intervendría cada sensor.</p>
    </div>
  );
}
