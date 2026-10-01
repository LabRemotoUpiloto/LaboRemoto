function EncodersEnVivo({ status }) {
  if (!status?.connected) {
    return <p className="diagrama-ev3-detalle-vacio">Sin robot conectado ahora mismo — esto es solo el ejemplo.</p>;
  }
  const conectados = (status.motors ?? []).filter(m => m.connected);
  if (conectados.length === 0) {
    return <p className="diagrama-ev3-detalle-vacio">No hay motores conectados en este robot ahora mismo.</p>;
  }
  return (
    <div className="paso-tarjetas">
      {conectados.map(m => (
        <div key={m.port} className="paso-tarjeta">
          <h4>{m.port}</h4>
          <p>
            <code>position</code>: <strong>{m.position ?? 0}°</strong>
          </p>
        </div>
      ))}
    </div>
  );
}

export default function PasoEncoders({ status }) {
  return (
    <div className="paso">
      <h2>Encoders: cómo el robot sabe cuánto giró</h2>
      <p>
        En el Módulo 2 viste sensores que leen el entorno (distancia, contacto, color). Los motores también
        traen algo parecido, pero mirando hacia adentro: un <strong>encoder</strong>, que cuenta cuántos grados
        giró el motor desde que se prendió el robot. Ese conteo no se pierde entre comandos: sigue acumulando.
      </p>

      <pre>{`print(motor.position)   # grados acumulados — sigue sumando mientras el motor gire`}</pre>

      <p>
        Esto es lo que hace posible comparar "lo que el robot debería haber hecho" contra{' '}
        <strong>lo que hizo de verdad</strong>: si pediste 614° y el encoder marca 590°, algo patinó o se
        atascó. En la pestaña Consola podés imprimir este valor mientras tu programa mueve el robot.
      </p>

      <h3>Encoders de tu robot ahora mismo</h3>
      <EncodersEnVivo status={status} />
    </div>
  );
}
