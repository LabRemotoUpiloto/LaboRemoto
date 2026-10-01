import { useState } from 'react';

const ITEMS = [
  '¿El Dashboard muestra "Conectado" en verde, arriba a la izquierda?',
  '¿El Dashboard muestra la IP del robot junto a "Conectado"? Si dice "Sin conexión", vuelve a conectar la práctica.',
  '¿El motor aparece "conectado" en su tarjeta del Dashboard, o dice "vacío"?',
  '¿El puerto que usa tu código (outA, outB...) es el mismo cable que está enchufado?',
  '¿Probaste mover ese motor a mano desde el Dashboard antes de correr tu script?',
  '¿El puente HTTP está funcionando? La práctica lo arranca al conectar: si el panel dice "Sin conexión", reconecta la práctica.',
];

/**
 * Checklist de auto-diagnóstico: no se corrige ni se "aprueba", es una
 * herramienta para usar de verdad cuando algo no anda — por eso no cuenta
 * como el paso "quiz" del módulo.
 */
export default function PasoChecklistDiagnostico() {
  const [marcados, setMarcados] = useState({});

  function alternar(i) {
    setMarcados(prev => ({ ...prev, [i]: !prev[i] }));
  }

  return (
    <div className="paso">
      <h2>Checklist: el motor no gira</h2>
      <p>
        Antes de sospechar de tu código, revisá esto en orden — la mayoría de las veces el problema está en
        uno de los primeros puntos, no en la lógica del programa.
      </p>

      <div className="checklist">
        {ITEMS.map((texto, i) => (
          <label key={i} className={`checklist-item ${marcados[i] ? 'marcado' : ''}`}>
            <input type="checkbox" checked={!!marcados[i]} onChange={() => alternar(i)} />
            <span>{texto}</span>
          </label>
        ))}
      </div>

      <p>
        Guardá este checklist en la cabeza: la próxima vez que un motor no responda, recorrerlo suele ser más
        rápido que leer el código de arriba a abajo buscando el error.
      </p>
    </div>
  );
}
