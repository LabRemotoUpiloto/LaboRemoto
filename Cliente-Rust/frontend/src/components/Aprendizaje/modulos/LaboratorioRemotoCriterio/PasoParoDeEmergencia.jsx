export default function PasoParoDeEmergencia() {
  return (
    <div className="paso">
      <h2>El paro de emergencia</h2>
      <p>
        Esta app tiene dos formas de frenar el robot ya, sin esperar a que termine un programa. Conocerlas
        antes de necesitarlas es la diferencia entre un susto y un problema real.
      </p>

      <h3>Desde el Dashboard</h3>
      <ul>
        <li>
          El panel <strong>Control por teclado</strong> frena con la barra <strong>Espacio</strong> — corta las
          dos ruedas configuradas ahí (por defecto <code>outA</code>/<code>outD</code>, revisá que coincida
          con tu robot).
        </li>
        <li>
          Cada tarjeta de motor tiene su propio botón <strong>■</strong> — frena ese motor puntual, sin
          depender de cuáles ruedas configuraste como izquierda/derecha.
        </li>
      </ul>

      <h3>Si estás corriendo un script desde la Terminal</h3>
      <p>
        Un programa que subiste y ejecutaste con "▶ Ejecutar en EV3" sigue corriendo <strong>dentro</strong>{' '}
        del robot, no lo controla el Dashboard. Si necesitás cortarlo:
      </p>
      <ul>
        <li>Si la sesión SSH sigue abierta en la pestaña Terminal, <code>Ctrl+C</code> ahí corta el programa en ejecución.</li>
        <li>Si perdiste esa sesión, un motor puede seguir girando hasta que el programa termine solo o alguien lo mate por SSH.</li>
      </ul>

      <p>
        Por eso, cuando estés probando un script nuevo — sobre todo uno con un <code>while True</code> — es
        buena idea probarlo primero a potencia baja, y dejar la sesión de Terminal abierta y a mano mientras
        corre.
      </p>
    </div>
  );
}
