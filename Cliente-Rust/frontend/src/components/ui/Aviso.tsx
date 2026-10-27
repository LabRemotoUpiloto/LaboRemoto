// components/ui/Aviso.tsx — un solo formato para vacío, error, sin permiso y avisos: qué pasa, el detalle y la salida.
// El nivel se dice con el color del título (color solo para estados), sin barras de color a un lado.
import React from 'react';
import { TARJETA, TEXTO_NIVEL, type Nivel } from './estilos';

export function Aviso({ nivel = 'apagado', titulo, detalle, accion }: {
  nivel?: Nivel;
  titulo: string;
  detalle?: React.ReactNode;
  accion?: React.ReactNode;
}) {
  return (
    <div role={nivel === 'critico' ? 'alert' : undefined} className={`${TARJETA} flex items-center gap-4 px-5 py-4`}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={`text-[14px] font-semibold ${nivel === 'critico' || nivel === 'alerta' ? TEXTO_NIVEL[nivel] : 'text-ui-tinta'}`}>{titulo}</span>
        {detalle && <span className="text-[13px] text-ui-tinta-2">{detalle}</span>}
      </div>
      {accion}
    </div>
  );
}
