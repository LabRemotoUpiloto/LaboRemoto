import { useState } from 'react';

const ESTADOS = ['buscando', 'siguiendo', 'esquivando'];

const DESCRIPCION = {
  buscando: 'Gira en el lugar hasta que el sensor de color detecta la línea.',
  siguiendo: 'Corrige el rumbo proporcionalmente mientras no haya obstáculos.',
  esquivando: 'Frena y gira para rodear el obstáculo detectado.',
};

export default function PasoMaquinaDeEstados() {
  const [estado, setEstado] = useState('buscando');

  return (
    <div className="paso">
      <h2>Máquinas de estado en código</h2>
      <p>
        En el Módulo 4 viste la idea de estados con un diagrama. En código, "el estado" no es nada especial de
        Python: es una variable de texto común, y un <code>if/elif</code> decide qué bloque correr según su
        valor actual.
      </p>

      <div className="sensor-demo">
        <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          Elegí un estado para ver qué rama del código correría:
        </label>
        <select className="panel-config-select" value={estado} onChange={e => setEstado(e.target.value)}>
          {ESTADOS.map(e => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <p style={{ margin: 0 }}>{DESCRIPCION[estado]}</p>
      </div>

      <pre>{`estado = "${estado}"

if estado == "buscando":
    ${estado === 'buscando' ? '# ← esta rama corre ahora' : 'buscar_linea()'}
elif estado == "siguiendo":
    ${estado === 'siguiendo' ? '# ← esta rama corre ahora' : 'seguir_linea()'}
elif estado == "esquivando":
    ${estado === 'esquivando' ? '# ← esta rama corre ahora' : 'esquivar()'}`}</pre>

      <p>
        Esa variable se lee al principio de cada vuelta del bucle, y se actualiza cuando pasa algo (un
        evento) — por eso una máquina de estados es tan natural adentro de un <code>while True</code>.
      </p>
    </div>
  );
}
