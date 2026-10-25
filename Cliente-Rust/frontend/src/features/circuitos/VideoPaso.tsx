// features/circuitos/VideoPaso.tsx — el video de un paso de circuitos (como los de Linux: se baja solo cuando el estudiante lo
// pide, para no saturar el enlace con un curso entero abriendo la práctica). Lo sirve el simulador del laboratorio
// (GET /api/laboremoto/media/<archivo>), igual que las prácticas.
import { useState } from 'react';
import { Play } from 'lucide-react';
import { Boton, ETIQUETA } from '@/components/ui';
import { URL_SIMULADOR } from './simulador';

export default function VideoPaso({ archivo, titulo }: { archivo: string; titulo?: string }) {
  const [pedido, setPedido] = useState(false);
  const [error, setError] = useState(false);

  return (
    <figure className="m-0 flex flex-col gap-2">
      <figcaption className="flex items-baseline gap-2">
        <span className={`${ETIQUETA} flex items-center gap-1`}><Play size={11} aria-hidden /> Video</span>
        {titulo && <span className="min-w-0 truncate text-[13px] font-semibold text-ui-tinta">{titulo}</span>}
      </figcaption>
      {!pedido ? (
        <div className="flex aspect-video items-center justify-center rounded-ui border border-ui-borde bg-ui-fondo">
          <Boton onClick={() => setPedido(true)}><Play size={14} aria-hidden /> Ver video</Boton>
        </div>
      ) : error ? (
        <p className="m-0 text-[13px] text-ui-critico-texto" role="alert">No se pudo reproducir el video. Revisa que el simulador esté corriendo.</p>
      ) : (
        <video
          src={`${URL_SIMULADOR}/api/laboremoto/media/${encodeURIComponent(archivo)}`}
          controls
          autoPlay
          preload="metadata"
          onError={() => setError(true)}
          className="aspect-video w-full rounded-ui bg-ui-fondo"
        />
      )}
    </figure>
  );
}
