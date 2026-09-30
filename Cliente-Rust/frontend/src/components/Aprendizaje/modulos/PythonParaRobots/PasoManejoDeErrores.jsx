import { useState } from 'react';

export default function PasoManejoDeErrores() {
  const [conectado, setConectado] = useState(true);

  return (
    <div className="paso">
      <h2>Manejo de errores</h2>
      <p>
        En este mismo laboratorio remoto ya viste sensores que se desconectan o un backend que no responde
        (el mensaje "Sin conexión con el backend" del Dashboard es exactamente eso). Un programa que no
        contempla esos casos se cae entero apenas algo no está como se esperaba —{' '}
        <code>try/except</code> deja seguir corriendo aunque una parte falle.
      </p>

      <div className="sensor-demo">
        <label className="checklist-item" style={{ cursor: 'pointer', padding: 0 }}>
          <input type="checkbox" checked={conectado} onChange={e => setConectado(e.target.checked)} />
          <span>Sensor de contacto conectado</span>
        </label>
        <pre style={{ margin: 0 }}>{conectado
          ? `try:
    presionado = touch.is_pressed
    print("Sensor OK:", presionado)
except Exception as error:
    print("No pude leer el sensor:", error)

# Salida: Sensor OK: False`
          : `try:
    presionado = touch.is_pressed
    print("Sensor OK:", presionado)
except Exception as error:
    print("No pude leer el sensor:", error)

# Salida: No pude leer el sensor: [Errno 19] No such device`}</pre>
      </div>

      <p>
        Sin el <code>try/except</code>, el segundo caso terminaría el programa entero con un traceback — con
        él, el programa se entera del problema, lo informa, y puede decidir qué hacer (frenar, avisar,
        reintentar) en vez de simplemente morir.
      </p>

      <p>
        No hace falta envolver <strong>todo</strong> el programa en <code>try/except</code> — solo las partes
        que dependen de algo que puede fallar de verdad: un sensor, una conexión de red, un archivo.
      </p>
    </div>
  );
}
