// features/practicas/ev3/trayectorias/ListaComandos.tsx — la ruta como lista editable, una fila por primitiva.
//
// Editar un número cambia la lista y el lienzo se actualiza solo (es una vista de la misma lista). Borrar una fila
// quita exactamente esa primitiva; el doble clic en el lienzo, en cambio, reacomoda los puntos siguientes. Los botones
// «+» son la única forma de crear un arco o una pausa: el lienzo solo genera giros y avances.
//
// Cada fila muestra también los grados que gira cada motor (cinematica.ts): así el diámetro de la rueda, el ancho de
// vía y la calibración del panel se ven reflejados en la ruta.
import React from 'react';
import { Plus, X } from 'lucide-react';
import { Boton, BotonIcono, ETIQUETA, NOTA, SUAVE } from '@/components/ui';
import { CampoNumero } from './CampoNumero';
import { gradosMotorParaPrimitiva } from './cinematica';
import { num } from './formato';
import type { ConfigRobot, Primitiva, TipoPrimitiva } from './tipos';

export const ETIQUETA_TIPO: Record<TipoPrimitiva, string> = { avanzar: 'Avanzar', girar: 'Girar', arco: 'Arco', pausa: 'Pausa' };

const NUEVA: Record<TipoPrimitiva, Primitiva> = {
  avanzar: { tipo: 'avanzar', cm: 10 },
  girar: { tipo: 'girar', grados: 90 },
  arco: { tipo: 'arco', radioCm: 20, grados: 90 },
  pausa: { tipo: 'pausa', ms: 500 },
};

const ANTIHORARIO = 'Positivo = antihorario (izquierda); negativo = horario (derecha)';

interface Props {
  primitivas: Primitiva[];
  onCambiar: (p: Primitiva[]) => void;
  indiceActivo: number | null;
  config: ConfigRobot;
}

export const ListaComandos: React.FC<Props> = ({ primitivas, onCambiar, indiceActivo, config }) => {
  const actualizar = (indice: number, cambios: Partial<Primitiva>) =>
    onCambiar(primitivas.map((p, i) => (i === indice ? ({ ...p, ...cambios } as Primitiva) : p)));
  const eliminar = (indice: number) => onCambiar(primitivas.filter((_, i) => i !== indice));

  return (
    <section aria-labelledby="lista-comandos-titulo" className="flex flex-col gap-2">
      <h3 id="lista-comandos-titulo" className={ETIQUETA}>Lista de comandos</h3>

      {primitivas.length === 0 ? (
        <p className="m-0 text-[12px] text-ui-tinta-2">Sin comandos todavía. Haz clic en el lienzo o agrega uno con los botones de abajo.</p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {primitivas.map((p, i) => {
            const grados = gradosMotorParaPrimitiva(p, config);
            const n = i + 1;
            return (
              <li
                key={i}
                aria-current={i === indiceActivo ? 'step' : undefined}
                className={`flex flex-col gap-1 rounded-ui px-2 py-1.5 ${i === indiceActivo ? SUAVE : ''}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`${NOTA} w-5 text-right`}>{n}</span>
                  <span className="w-[58px] text-[12px] font-semibold text-ui-tinta">{ETIQUETA_TIPO[p.tipo]}</span>
                  <span className="flex flex-1 flex-wrap items-center gap-2">
                    {p.tipo === 'avanzar' && (
                      <CampoNumero etiqueta={`Comando ${n}: centímetros`} valor={p.cm} sufijo="cm" titulo="Negativo = retroceder"
                        onCambiar={(cm) => actualizar(i, { cm })} />
                    )}
                    {p.tipo === 'girar' && (
                      <CampoNumero etiqueta={`Comando ${n}: grados`} valor={p.grados} sufijo="°" titulo={ANTIHORARIO}
                        onCambiar={(g) => actualizar(i, { grados: g })} />
                    )}
                    {p.tipo === 'arco' && (
                      <>
                        <CampoNumero etiqueta={`Comando ${n}: radio en centímetros`} valor={p.radioCm} sufijo="cm de radio" min={0}
                          onCambiar={(radioCm) => actualizar(i, { radioCm })} />
                        <CampoNumero etiqueta={`Comando ${n}: grados`} valor={p.grados} sufijo="°" titulo={ANTIHORARIO}
                          onCambiar={(g) => actualizar(i, { grados: g })} />
                      </>
                    )}
                    {p.tipo === 'pausa' && (
                      <CampoNumero etiqueta={`Comando ${n}: milisegundos`} valor={p.ms} paso={100} min={0} sufijo="ms"
                        onCambiar={(ms) => actualizar(i, { ms })} />
                    )}
                  </span>
                  <BotonIcono etiqueta={`Borrar el comando ${n}`} onClick={() => eliminar(i)}>
                    <X size={14} aria-hidden />
                  </BotonIcono>
                </div>
                {p.tipo !== 'pausa' && (
                  <span className={`${NOTA} pl-7`}>
                    Motores: izq. {num(grados.izquierda, 0)}° · der. {num(grados.derecha, 0)}°
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(NUEVA) as TipoPrimitiva[]).map((tipo) => (
          <Boton key={tipo} className="h-8 px-2.5 text-[12px]" onClick={() => onCambiar([...primitivas, NUEVA[tipo]])}>
            <Plus size={14} aria-hidden />
            {ETIQUETA_TIPO[tipo]}
          </Boton>
        ))}
      </div>
    </section>
  );
};
