// features/actividad/BotonActualizar.tsx — «Actualizar» que se nota: vuelve a pedir al broker, gira mientras espera y avisa al
// terminar (con la hora), para que no quede la duda de si de verdad se actualizó.
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Boton } from '@/components/ui';
import { useToasts } from '@/app/providers/ToastContext';

const hora = (d: Date) => d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Recarga todo lo de la página a la vez; `que` es lo que se nombra en el aviso («la actividad», «las encuestas»). */
export function useActualizar(recargas: (() => Promise<boolean | null>)[], que: { bien: string; mal: string }) {
  const { push } = useToasts();
  const [actualizando, setActualizando] = useState(false);
  const actualizar = async () => {
    setActualizando(true);
    const resultados = await Promise.all(recargas.map((r) => r()));
    setActualizando(false);
    if (resultados.includes(null)) return; // otra carga (otro período) la reemplazó: esa es la que cuenta
    push(resultados.every(Boolean)
      ? { type: 'success', message: `${que.bien} a las ${hora(new Date())}.` }
      : { type: 'error', message: que.mal });
  };
  return { actualizando, actualizar };
}

export function BotonActualizar({ actualizando, onClick }: { actualizando: boolean; onClick: () => void }) {
  return (
    // ancho fijo: que el botón no salte al cambiar el texto. Sin `disabled` mientras actualiza: ese gris casi no se lee, y
    // lo que tiene que verse justo ahí es que está trabajando; un segundo clic simplemente no hace nada.
    <Boton onClick={actualizando ? undefined : onClick} aria-disabled={actualizando} aria-busy={actualizando} className="w-[156px]">
      <RefreshCw size={14} aria-hidden className={`shrink-0 ${actualizando ? 'motion-safe:animate-spin' : ''}`} />
      {actualizando ? 'Actualizando…' : 'Actualizar'}
    </Boton>
  );
}
