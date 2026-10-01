export default function PasoCargarArchivos({ onIrATerminal }) {
  return (
    <div className="paso">
      <h2>Cargar y ejecutar un programa</h2>
      <p>
        Todo lo que viste hasta acá (mover motores, leer sensores) se puede hacer también escribiendo un
        programa en Python y corriéndolo directamente <strong>dentro</strong> del EV3, en vez de mandar un
        comando a la vez desde el Dashboard. Para eso está la pestaña <strong>Consola</strong>.
      </p>

      <h3>Cómo funciona</h3>
      <ol>
        <li>Escribís tu programa <code>.py</code> en el editor (o elegís un ejemplo de la lista).</li>
        <li>
          Al apretar <strong>▶ Ejecutar en EV3</strong>, la app manda el programa al robot y lo corre allá
          (con un tiempo máximo de 2 minutos). Solo una persona a la vez puede correr un programa.
        </li>
        <li>Todo lo que el programa imprime (o cualquier error) aparece en la consola de abajo, en tiempo real, y podés cortarlo con <strong>■ Detener</strong>.</li>
      </ol>

      <h3>Un primer programa típico</h3>
      <pre>{`from ev3dev2.motor import LargeMotor, OUTPUT_A

motor = LargeMotor(OUTPUT_A)
motor.on_for_seconds(speed=30, seconds=2)
print("Listo")`}</pre>
      <p>
        Esto mueve el motor conectado en <code>outA</code> al 30% de potencia durante 2 segundos, y después
        imprime un mensaje — vas a verlo aparecer en la consola de la pestaña Consola apenas termine.
      </p>

      <h3>Por qué importa entender esto ahora</h3>
      <p>
        El Dashboard controla el robot <strong>desde afuera</strong>, mandando un
        comando HTTP por vez. Un programa subido y ejecutado en el EV3 corre <strong>adentro</strong> del
        robot, sin depender de la conexión de red para cada paso — es el modo en que vas a trabajar cuando la
        tarea sea más compleja que unos pocos movimientos.
      </p>

      {onIrATerminal && (
        <button className="btn btn-primary" onClick={onIrATerminal}>
          Ir a la pestaña Consola →
        </button>
      )}
    </div>
  );
}
