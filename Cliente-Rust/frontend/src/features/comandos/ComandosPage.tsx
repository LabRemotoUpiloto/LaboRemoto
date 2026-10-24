// features/comandos/ComandosPage.tsx — los comandos guardados como página (sin sesión al lado: sin Ejecutar ni Pegar). En una
// sesión de uso normal son un panel del mosaico (ver SesionMosaico).
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { BotonPrincipal, Encabezado, Pagina, TARJETA } from '@/components/ui';
import PanelComandos from './PanelComandos';

export default function ComandosPage({ onEjecutar, onPegar }: { onEjecutar?: (c: string) => void; onPegar?: (c: string) => void }) {
  const [pedirNuevo, setPedirNuevo] = useState(0);
  return (
    <Pagina ancho="max-w-[860px]">
      <Encabezado titulo="Comandos"
        descripcion="Los comandos que repites seguido. En una sesión se ejecutan en la terminal con un clic."
        derecha={<BotonPrincipal onClick={() => setPedirNuevo((n) => n + 1)}><Plus size={15} aria-hidden /> Nuevo comando</BotonPrincipal>} />
      <div className={`${TARJETA} flex min-h-[320px] flex-col`}>
        <PanelComandos pedirNuevo={pedirNuevo} onEjecutar={onEjecutar} onPegar={onPegar} />
      </div>
    </Pagina>
  );
}
