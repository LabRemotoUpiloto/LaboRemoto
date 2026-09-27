export default function PasoIntro() {
  return (
    <div className="paso">
      <h2>¿Qué es el EV3?</h2>

      <p>
        El <strong>LEGO Mindstorms EV3</strong> es un kit de robótica educativa. Su pieza central es el{' '}
        <strong>ladrillo</strong> ("brick"): una computadora pequeña con procesador propio, pantalla, botones,
        altavoz y batería, que se programa para leer sensores y mover motores.
      </p>

      <p>
        En este laboratorio, el ladrillo no corre el firmware original de LEGO: corre{' '}
        <strong>ev3dev</strong>, una distribución de Linux, con un programa en <strong>Python</strong> escuchando
        pedidos por red. Esta app le manda esos pedidos — por eso podés controlar el robot desde el navegador,
        aunque el EV3 esté en otro lugar físico. A eso nos referimos con <strong>laboratorio remoto</strong>.
      </p>

      <h3>Qué vas a poder hacer con esta app</h3>
      <ul>
        <li>Ver en vivo el estado de los motores y sensores conectados (pestaña Dashboard).</li>
        <li>Mover el robot manualmente con el teclado.</li>
        <li>Escribir o subir un programa en Python y ejecutarlo en el EV3 (pestaña Terminal).</li>
        <li>Diseñar una trayectoria gráficamente y simularla antes de correrla en el robot real.</li>
      </ul>

      <p>
        Este primer módulo es conceptual: no hace falta tener el robot conectado para completarlo. La idea es
        que entiendas las piezas (sensores, actuadores, puertos) antes de programarlas de verdad.
      </p>
    </div>
  );
}
