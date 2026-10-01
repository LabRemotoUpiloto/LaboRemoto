import { useState } from 'react';

export default function PasoPrintComoHerramienta() {
  const [conPrints, setConPrints] = useState(false);

  return (
    <div className="paso">
      <h2>print() como herramienta de diagnóstico</h2>
      <p>
        No hace falta un depurador sofisticado para entender por qué un programa no hace lo esperado: imprimir
        los valores intermedios, en los puntos donde algo podría estar fallando, suele alcanzar.
      </p>

      <div className="sensor-demo">
        <label className="checklist-item" style={{ cursor: 'pointer', padding: 0 }}>
          <input type="checkbox" checked={conPrints} onChange={e => setConPrints(e.target.checked)} />
          <span>Agregar prints de diagnóstico</span>
        </label>

        {conPrints ? (
          <pre style={{ margin: 0 }}>{`distancia = ultrasonico.distance_centimeters
print("distancia leída:", distancia)   # <- esto

if distancia < umbral:
    print("Frenando: distancia menor al umbral", umbral)   # <- y esto
    motor.off()
else:
    motor.on(30)

# Salida real: distancia leída: 47
#              (el motor sigue andando, y ahora SABÉS por qué)`}</pre>
        ) : (
          <pre style={{ margin: 0 }}>{`distancia = ultrasonico.distance_centimeters

if distancia < umbral:
    motor.off()
else:
    motor.on(30)

# El robot no frena y no hay ninguna pista de por qué.
# ¿La distancia está mal leída? ¿El umbral es incorrecto?
# ¿Nunca entra al if? No hay forma de saberlo sin más información.`}</pre>
        )}
      </div>

      <p>
        La diferencia no es el código que hace el trabajo — es la misma lógica en los dos casos. La diferencia
        es que la versión de la izquierda te dice <strong>qué está pasando de verdad</strong> en vez de
        obligarte a adivinar.
      </p>

      <h3>Dónde poner los prints</h3>
      <ul>
        <li>Justo después de leer un sensor — para descartar "el sensor lee algo raro".</li>
        <li>Antes de cada rama de un <code>if</code> importante — para saber cuál se ejecutó de verdad.</li>
        <li>Al entrar y salir de una función — para confirmar que se llamó cuando pensabas que se llamaba.</li>
      </ul>
      <p>Una vez que el problema está resuelto, es buena práctica sacar los prints que ya no aportan — si no, la consola termina llena de ruido.</p>
    </div>
  );
}
