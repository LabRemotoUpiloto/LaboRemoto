/**
 * Busca, dentro de `status` (la telemetría que arma App.jsx), un sensor
 * conectado del `tipo` pedido ("Touch", "Ultrasonic", "Color", "Gyro",
 * "Infrared" — los mismos nombres que devuelve DRIVER_TO_TYPE en
 * api_simulador/main.py). Devuelve `null` si no hay robot conectado o no
 * hay ningún sensor de ese tipo enchufado ahora mismo.
 *
 * Se usa para mostrar el valor REAL junto a cada simulación, cuando hay un
 * robot a mano — sin bloquear el paso si no lo hay.
 */
export function buscarSensorConectado(status, tipo) {
  if (!status?.connected) return null;
  return (status.sensors ?? []).find(s => s.sensor_type === tipo) ?? null;
}
