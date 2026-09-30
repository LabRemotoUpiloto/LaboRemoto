export default function PasoComoLeer() {
  return (
    <div className="paso">
      <h2>Cómo leer un sensor</h2>
      <p>
        En el Módulo 1 viste que un sensor se conecta a un puerto de entrada (<code>in1</code> a{' '}
        <code>in4</code>). Para leerlo desde un programa, cada tipo de sensor tiene su propia clase en{' '}
        <code>ev3dev2.sensor.lego</code>: se instancia indicando el puerto, y después se consulta su valor
        cuando haga falta.
      </p>

      <pre>{`from ev3dev2.sensor.lego import TouchSensor
from ev3dev2.sensor import INPUT_1

touch = TouchSensor(INPUT_1)
print(touch.is_pressed)   # True o False`}</pre>

      <p>
        Lo importante: cada sensor devuelve un <strong>tipo de valor distinto</strong>, y hay que saber cuál es
        antes de comparar contra un número al azar en un <code>if</code>.
      </p>

      <div className="paso-tarjetas">
        <div className="paso-tarjeta">
          <h4>Contacto (Touch)</h4>
          <p><code>is_pressed</code> → Verdadero o Falso.</p>
        </div>
        <div className="paso-tarjeta">
          <h4>Ultrasónico</h4>
          <p><code>distance_centimeters</code> → un número, en cm.</p>
        </div>
        <div className="paso-tarjeta">
          <h4>Color</h4>
          <p><code>reflected_light_intensity</code> → 0 (negro) a 100 (blanco).</p>
        </div>
        <div className="paso-tarjeta">
          <h4>Giroscópico (Gyro)</h4>
          <p><code>angle</code> → grados acumulados desde que se prendió.</p>
        </div>
      </div>

      <p>Los próximos pasos muestran cada uno de estos con una simulación para jugar antes de probarlo en el robot real.</p>
    </div>
  );
}
