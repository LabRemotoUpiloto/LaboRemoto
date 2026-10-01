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

      <h3>Si estás corriendo un programa desde la Consola</h3>
      <p>
        Un programa que ejecutaste con "▶ Ejecutar en EV3" sigue corriendo <strong>dentro</strong>{' '}
        del robot, no lo controla el Dashboard. Si necesitás cortarlo:
      </p>
      <ul>
        <li>Pulsá <strong>■ Detener</strong> en la pestaña Consola: corta el programa y frena los motores.</li>
        <li>Si te desconectás con un programa corriendo, el robot lo corta solo al cumplirse el tiempo máximo (2 minutos) y frena los motores.</li>
      </ul>

      <p>
        Por eso, cuando estés probando un script nuevo — sobre todo uno con un <code>while True</code> — es
        buena idea probarlo primero a potencia baja, y dejar la pestaña Consola abierta y el botón Detener a mano mientras
        corre.
      </p>
    </div>
  );
}
