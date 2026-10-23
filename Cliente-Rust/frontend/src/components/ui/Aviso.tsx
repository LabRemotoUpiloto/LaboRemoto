// components/ui/Aviso.tsx — un solo formato para vacío, error, sin permiso y avisos: qué pasa, el detalle y la salida.
import React from 'react';
import { TARJETA } from './estilos';

const BORDE = { critico: 'border-l-ui-critico', alerta: 'border-l-ui-alerta', bien: 'border-l-ui-bien', apagado: 'border-l-ui-banda' };

export function Aviso({ nivel = 'apagado', titulo, detalle, accion }: {
  nivel?: keyof typeof BORDE;
  titulo: string;
  detalle?: React.ReactNode;
  accion?: React.ReactNode;
}) {
  return (
    <div role={nivel === 'critico' ? 'alert' : undefined} className={`${TARJETA} flex items-center gap-4 border-l-[3px] ${BORDE[nivel]} px-5 py-4`}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[14px] font-semibold text-ui-tinta">{titulo}</span>
        {detalle && <span className="text-[13px] text-ui-tinta-2">{detalle}</span>}
      </div>
      {accion}
    </div>
  );
}
