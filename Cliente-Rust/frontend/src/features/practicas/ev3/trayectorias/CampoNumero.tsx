// features/practicas/ev3/trayectorias/CampoNumero.tsx — campo numérico compacto que no pelea con lo que se escribe.
//
// Con `value={numero}` a secas, al escribir «-» o «0,» el valor sería NaN y el campo se borraría antes de terminar.
// Por eso el texto visible es un estado propio: sigue a `valor` solo cuando el campo no tiene el foco (por ejemplo, si
// el número cambió al arrastrar un punto en el lienzo) y sube con `onCambiar` cuando ya forma un número válido.
import React, { useEffect, useRef, useState } from 'react';
import { RADIO } from '@/components/ui';

/** Lo que se muestra sin foco: hasta un decimal, sin ceros de más. */
const mostrar = (n: number) => String(Math.round(n * 10) / 10);

interface Props {
  valor: number;
  onCambiar: (n: number) => void;
  /** Nombre accesible del campo. */
  etiqueta: string;
  sufijo?: string;
  paso?: number;
  min?: number;
  titulo?: string;
  ancho?: string;
}

export const CampoNumero: React.FC<Props> = ({ valor, onCambiar, etiqueta, sufijo, paso = 1, min, titulo, ancho = 'w-[68px]' }) => {
  const [texto, setTexto] = useState(mostrar(valor));
  const enFoco = useRef(false);

  useEffect(() => { if (!enFoco.current) setTexto(mostrar(valor)); }, [valor]);

  const cambiar = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTexto(e.target.value);
    const n = parseFloat(e.target.value.replace(',', '.'));
    if (Number.isFinite(n) && (min === undefined || n >= min)) onCambiar(n);
  };

  return (
    <span className="inline-flex items-center gap-1" title={titulo}>
      <input
        type="number"
        aria-label={etiqueta}
        value={texto}
        step={paso}
        min={min}
        onFocus={() => { enFoco.current = true; }}
        onBlur={() => { enFoco.current = false; setTexto(mostrar(valor)); }}
        onChange={cambiar}
        className={`h-8 ${ancho} ${RADIO} border-[length:var(--card-border-width,1px)] border-ui-borde-campo bg-ui-superficie px-2 font-ui-num text-[12px] text-ui-tinta transition-colors hover:border-ui-tinta-2`}
      />
      {sufijo && <span className="text-[11px] text-ui-tinta-2">{sufijo}</span>}
    </span>
  );
};
