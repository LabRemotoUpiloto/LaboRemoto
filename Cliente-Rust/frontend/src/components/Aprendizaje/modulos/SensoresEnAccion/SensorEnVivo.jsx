/** Badge reutilizable: valor real del sensor si hay uno conectado, o un aviso si no. */
export default function SensorEnVivo({ sensor, tipoLegible }) {
  if (!sensor) {
    return (
      <p className="diagrama-ev3-detalle-vacio">
        No hay un {tipoLegible} conectado ahora mismo — esto de arriba es la simulación.
      </p>
    );
  }
  return (
    <span className="diagrama-ev3-estado">
      <span className="diagrama-ev3-estado-dot" style={{ background: 'var(--success)' }} />
      Sensor real conectado en {sensor.port}: valor actual {sensor.value}
    </span>
  );
}
