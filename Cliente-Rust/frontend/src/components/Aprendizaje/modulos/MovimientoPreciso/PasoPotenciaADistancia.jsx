export default function PasoPotenciaADistancia() {
  return (
    <div className="paso">
      <h2>De potencia a distancia</h2>
      <p>
        Hasta acá controlaste el robot con <strong>potencia</strong>: "andá al 40%" hasta que alguien lo pare.
        Eso sirve para manejarlo a mano, pero no para tareas como "avanzá exactamente 30 cm" — para eso hace
        falta otra herramienta.
      </p>

      <p>
        La librería <code>ev3dev2</code> tiene comandos que mueven el motor una cantidad exacta y se detienen
        solos:
      </p>

      <pre>{`motor.on_for_rotations(speed=30, rotations=2)   # 2 vueltas completas
motor.on_for_degrees(speed=30, degrees=180)     # media vuelta`}</pre>

      <p>
        La pregunta natural es: si le pido "180 grados", <strong>¿cuánto avanza el robot en centímetros?</strong>{' '}
        Depende de un solo dato físico: el diámetro de la rueda. Eso es lo que resuelve el próximo paso.
      </p>
    </div>
  );
}
