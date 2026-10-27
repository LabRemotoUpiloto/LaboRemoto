// features/practicas/linux/VisorPoster.tsx — un póster premio en grande (acercar con la rueda, arrastrar para mover) y
// «Descargar», que abre el diálogo de guardar. Lo abre el Perfil.
import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Boton, BotonPrincipal, Dialogo } from '@/components/ui';
import { downloadPoster, type PosterDef } from '../posters.service';
import { linuxGetMedia } from '../linuxPractice.service';
import { ZoomableImage } from './ZoomableImage';

export default function VisorPoster({ poster, onCerrar }: { poster: PosterDef; onCerrar: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [descargando, setDescargando] = useState(false);

  useEffect(() => {
    let vivo = true;
    linuxGetMedia(poster.practiceId, poster.mediaPath)
      .then((m) => { if (vivo) setUrl(`data:${m.mime};base64,${m.base64}`); })
      .catch(() => { if (vivo) setError(true); });
    return () => { vivo = false; };
  }, [poster.practiceId, poster.mediaPath]);

  const descargar = async () => {
    setDescargando(true);
    try { await downloadPoster(poster); } finally { setDescargando(false); }
  };

  return (
    <Dialogo titulo={poster.title} descripcion="Rueda del mouse para acercar, arrastra para mover y doble clic para volver al tamaño normal."
      ancho="w-[min(760px,92vw)]" onCerrar={onCerrar}
      acciones={<>
        <Boton onClick={onCerrar}>Cerrar</Boton>
        <BotonPrincipal disabled={!url || descargando} onClick={() => void descargar()}>
          <Download size={14} aria-hidden /> {descargando ? 'Guardando…' : 'Descargar'}
        </BotonPrincipal>
      </>}>
      <div className="flex h-[min(60vh,520px)] items-center justify-center overflow-hidden rounded-[max(2px,calc(var(--radius-md,8px)-2px))] bg-ui-pista">
        {url ? <ZoomableImage src={url} alt={poster.title} />
          : <span className="text-[13px] text-ui-apagado" role="status">{error ? 'No se pudo cargar el póster.' : 'Cargando…'}</span>}
      </div>
    </Dialogo>
  );
}
