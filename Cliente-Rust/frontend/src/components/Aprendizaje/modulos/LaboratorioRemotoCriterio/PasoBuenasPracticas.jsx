import { useState } from 'react';

const ANTES = [
  'Revisá el Dashboard: ¿está "Conectado" y la batería tiene carga razonable?',
  '¿Algún motor quedó girando de una sesión anterior? Frenalo antes de programar nada nuevo.',
  'Si vas a correr un script propio, probá primero un movimiento chico y a potencia baja.',
];

const DESPUES = [
  'Dejá todos los motores detenidos — no asumas que la próxima persona los va a frenar por vos.',
  'Si dejaste un script corriendo en la Terminal (por ejemplo un while True), cortalo antes de desconectarte.',
  'Si vas a subir una versión nueva de un archivo con el mismo nombre en el robot, asegurate de que la versión vieja no siga corriendo en paralelo — dos procesos usando el mismo puerto van a chocar entre sí.',
];

function ChecklistSimple({ items }) {
  const [marcados, setMarcados] = useState({});
  return (
    <div className="checklist">
      {items.map((texto, i) => (
        <label key={i} className={`checklist-item ${marcados[i] ? 'marcado' : ''}`}>
          <input type="checkbox" checked={!!marcados[i]} onChange={() => setMarcados(p => ({ ...p, [i]: !p[i] }))} />
          <span>{texto}</span>
        </label>
      ))}
    </div>
  );
}

export default function PasoBuenasPracticas() {
  return (
    <div className="paso">
      <h2>Antes y después de una sesión</h2>
      <p>
        Nada de esto es una regla arbitraria del laboratorio — el último punto de la lista de "después" pasó
        de verdad en este mismo proyecto: quedó un proceso viejo corriendo en el robot ocupando el puerto, y
        hubo que matarlo a mano antes de poder arrancar la versión nueva.
      </p>

      <h3>Antes de empezar</h3>
      <ChecklistSimple items={ANTES} />

      <h3>Al terminar</h3>
      <ChecklistSimple items={DESPUES} />

      <p>Un robot compartido se porta bien si cada sesión lo deja como esperarías encontrarlo vos.</p>
    </div>
  );
}
