export default function PasoEditorTrayectorias({ onIrATrayectoria }) {
  return (
    <div className="paso">
      <h2>El editor de trayectorias</h2>
      <p>
        Todo lo de este módulo — grados por cm, ángulos de giro, encoders — es lo que corre por debajo de la
        pestaña <strong>Trayectoria</strong>. Ahí no escribís grados a mano: dibujás la ruta en un plano y la
        app hace la cuenta.
      </p>

      <h3>Cómo se usa</h3>
      <ol>
        <li>Hacé clic en el canvas para agregar puntos — la app arma sola los comandos "girar" + "avanzar" necesarios para llegar a cada uno.</li>
        <li>La lista de comandos, a la derecha, se sincroniza con el canvas en los dos sentidos: arrastrás un punto y la lista cambia; editás un número y el punto se mueve.</li>
        <li>El panel de configuración tiene los mismos D, E, k y potencia que viste en este módulo — cambiarlos ahí recalcula toda la ruta en vivo.</li>
        <li>Con "▶ Reproducir" simulás la ruta completa antes de tocar el robot de verdad — el comando en curso se resalta en la lista.</li>
        <li>
          Si el robot tiene encoders disponibles, "Grabar trayectoria real" te muestra la ruta que recorrió de
          verdad, superpuesta en rojo punteado sobre la planeada, con el error final en cm.
        </li>
      </ol>

      <p>Simular antes de mover el robot de verdad sirve para encontrar errores de la ruta sin arriesgar al robot físico — un giro de más ahí es gratis; en el mundo real puede tirar algo al piso.</p>

      {onIrATrayectoria && (
        <button className="btn btn-primary" onClick={onIrATrayectoria}>
          Ir a la pestaña Trayectoria →
        </button>
      )}
    </div>
  );
}
