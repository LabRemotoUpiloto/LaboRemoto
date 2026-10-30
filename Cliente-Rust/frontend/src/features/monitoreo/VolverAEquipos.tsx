// features/monitoreo/VolverAEquipos.tsx — el botón para regresar a «Equipos del laboratorio» desde el detalle de
// cualquier equipo (Pi 4, cámaras y los que vengan). Va siempre arriba del título, igual en todos.
import { ArrowLeft } from 'lucide-react';
import { Boton } from '@/components/ui';

/** Los equipos que se abren desde Monitoreo. Uno nuevo: su id aquí, su tarjeta en EquiposVista con
 *  `onAbrir('<id>')` y su detalle en RendimientoPage con este botón arriba. */
export type EquipoMonitoreo = 'pi4' | 'camaras';
export const EQUIPOS_MONITOREO: readonly EquipoMonitoreo[] = ['pi4', 'camaras'];

export default function VolverAEquipos({ onVolver, className = '' }: { onVolver: () => void; className?: string }) {
  return (
    <Boton className={className} onClick={onVolver}>
      <ArrowLeft size={14} aria-hidden /> Equipos del laboratorio
    </Boton>
  );
}
