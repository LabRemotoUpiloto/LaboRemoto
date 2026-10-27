// features/circuitos/ContenidoPaso.tsx — lo que explica un paso de circuitos, bloque por bloque: párrafos, listas, consejos,
// imágenes (se amplían con un clic) y videos. Las imágenes y los videos los sirve el simulador, igual que las prácticas.
import { useState } from 'react';
import { Lightbulb, Maximize2 } from 'lucide-react';
import { Boton, Dialogo } from '@/components/ui';
import type { BloqueCircuito } from './practicas';
import { urlMedia } from './simulador';
import VideoPaso from './VideoPaso';

const PARRAFO = 'm-0 text-[13.5px] leading-relaxed text-ui-tinta-2';

export default function ContenidoPaso({ bloques }: { bloques: BloqueCircuito[] }) {
  return (
    <>
      {bloques.map((b, i) => {
        switch (b.type) {
          case 'text':
            return <p key={i} className={PARRAFO}>{b.text}</p>;
          case 'tip':
            return (
              <div key={i} className="flex gap-2 rounded-ui border border-ui-borde bg-ui-fondo px-3 py-2">
                <Lightbulb size={14} className="mt-[3px] shrink-0 text-ui-alerta-texto" aria-hidden />
                <p className={PARRAFO}>{b.text}</p>
              </div>
            );
          case 'list': {
            const Lista = b.ordered ? 'ol' : 'ul';
            return (
              <Lista key={i} className={`m-0 flex flex-col gap-1.5 pl-5 ${b.ordered ? 'list-decimal' : 'list-disc'}`}>
                {b.items.map((t) => <li key={t} className={`${PARRAFO} pl-1`}>{t}</li>)}
              </Lista>
            );
          }
          case 'image':
            return <ImagenPaso key={i} archivo={b.file} titulo={b.caption} />;
          case 'video':
            return <VideoPaso key={i} archivo={b.file} titulo={b.caption} />;
          default:
            return null;
        }
      })}
    </>
  );
}

/** Imagen del paso: en el chat se ve angosta, así que se puede abrir en grande. */
function ImagenPaso({ archivo, titulo }: { archivo: string; titulo?: string }) {
  const [grande, setGrande] = useState(false);
  const [error, setError] = useState(false);
  if (error) return <p className="m-0 text-[13px] text-ui-critico-texto" role="alert">No se pudo cargar la imagen. Revisa que el simulador esté corriendo.</p>;
  return (
    <figure className="m-0 flex flex-col gap-1.5">
      <button type="button" onClick={() => setGrande(true)} className="group relative block w-full overflow-hidden rounded-ui border border-ui-borde bg-ui-superficie p-0"
        aria-label={`Ampliar la imagen${titulo ? `: ${titulo}` : ''}`}>
        <img src={urlMedia(archivo)} alt={titulo ?? ''} onError={() => setError(true)} className="block w-full" />
        <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-ui border border-ui-borde bg-ui-superficie px-2 py-1 text-[12px] text-ui-tinta">
          <Maximize2 size={12} aria-hidden /> Ampliar
        </span>
      </button>
      {titulo && <figcaption className="text-[12px] text-ui-apagado">{titulo}</figcaption>}
      {grande && (
        <Dialogo titulo={titulo ?? 'Imagen'} ancho="w-[min(92vw,1100px)]" onCerrar={() => setGrande(false)}
          acciones={<Boton onClick={() => setGrande(false)}>Cerrar</Boton>}>
          <img src={urlMedia(archivo)} alt={titulo ?? ''} className="block w-full rounded-ui" />
        </Dialogo>
      )}
    </figure>
  );
}
