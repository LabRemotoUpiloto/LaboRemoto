// features/camaras/VigilanciaPage.tsx — video en vivo de las cámaras del laboratorio para los roles de personal
// (PAGE_ACCESS['vigilancia'] en usePermissions.ts). Cada cámara con su nombre y estado DEBAJO del video.
// El panel de cámaras de una sesión sigue usando CameraGrid (sin PTZ).
import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, Maximize2, RotateCw, Settings2 } from 'lucide-react';
import { useEffectiveRole, puedeAdministrarCamaras } from '@/features/cuenta/usePermissions';
import { Aviso, Boton, BotonIcono, Encabezado, Pagina, Punto, TARJETA } from '@/components/ui';
import { PILOT_GROUP_KEY } from './CameraGrid';
import CameraVideo from './CameraVideo';
import CamarasAdminModal from './CamarasAdminModal';
import PtzControls from './PtzControls';
import { useNvrCameras, type NvrCamera } from './useNvrCameras';
import { usePtzControl, type PtzOp } from './usePtzControl';

export default function VigilanciaPage() {
  const role = useEffectiveRole();
  const [adminAbierto, setAdminAbierto] = useState(false);
  const [ampliada, setAmpliada] = useState<string | null>(null);
  // La lista se vuelve a pedir cada 5 s: una cámara nueva, editada o que vuelve aparece sola.
  const { cameras, status, error, start } = useNvrCameras(PILOT_GROUP_KEY);
  const { sendPtz } = usePtzControl(PILOT_GROUP_KEY);

  useEffect(() => { void start(); }, [start]);

  const enVivo = cameras.filter((c) => c.status === 'active').length;
  const visibles = ampliada ? cameras.filter((c) => c.id === ampliada) : cameras;
  const columnas = ampliada || cameras.length <= 1 ? 'grid-cols-1' : cameras.length <= 4 ? 'grid-cols-2' : 'grid-cols-3';
  const listo = status === 'active';

  return (
    <Pagina ancho="max-w-[1240px]">
      <Encabezado titulo="Vigilancia" descripcion="Video en vivo de las cámaras del laboratorio."
        derecha={<>
          {listo && cameras.length > 0 && (
            <Punto nivel={enVivo === cameras.length ? 'bien' : 'alerta'} fuerte={`${enVivo} de ${cameras.length}`} resto="en vivo" />
          )}
          {puedeAdministrarCamaras(role) && (
            <Boton onClick={() => setAdminAbierto(true)}><Settings2 size={14} aria-hidden /> Administrar cámaras</Boton>
          )}
        </>} />

      {status === 'error' ? (
        <Aviso nivel="critico" titulo="No se pudo conectar con el servidor de cámaras"
          detalle={<>Se vuelve a intentar solo cada 5 segundos. Detalle: <span className="font-ui-num">{error}</span></>}
          accion={<Boton onClick={() => void start()}><RotateCw size={14} aria-hidden /> Reintentar</Boton>} />
      ) : !listo ? (
        <div className="grid grid-cols-2 gap-4" role="status" aria-busy="true">
          <span className="sr-only">Conectando con el servidor de cámaras…</span>
          {[0, 1].map((i) => <div key={i} aria-hidden className={`${TARJETA} aspect-video bg-ui-pista`} />)}
        </div>
      ) : cameras.length === 0 ? (
        <Aviso titulo="No hay cámaras configuradas"
          detalle={puedeAdministrarCamaras(role) ? 'Agrégalas desde «Administrar cámaras».' : 'Pídele al administrador que las agregue.'} />
      ) : (
        <>
          {ampliada && (
            <div><Boton onClick={() => setAmpliada(null)}><ChevronLeft size={14} aria-hidden /> Ver todas las cámaras</Boton></div>
          )}
          <div className={`grid ${columnas} gap-4`}>
            {visibles.map((c) => (
              <Camara key={c.id} camara={c} ampliada={ampliada === c.id}
                onAmpliar={() => setAmpliada((a) => (a === c.id ? null : c.id))}
                onPtz={(op) => sendPtz(c.id, op)} />
            ))}
          </div>
        </>
      )}

      {puedeAdministrarCamaras(role) && <CamarasAdminModal opened={adminAbierto} onClose={() => setAdminAbierto(false)} />}
    </Pagina>
  );
}

function Camara({ camara: c, ampliada, onAmpliar, onPtz }: {
  camara: NvrCamera; ampliada: boolean; onAmpliar: () => void; onPtz: (op: PtzOp) => void;
}) {
  const [intento, setIntento] = useState(0);
  const [modo, setModo] = useState<'WebRTC' | 'HLS' | null>(null);
  const alModo = useCallback((m: 'WebRTC' | 'HLS') => setModo(m), []);
  const viva = c.status === 'active' && !!c.stream_url;

  return (
    <figure className={`${TARJETA} m-0 flex flex-col`}>
      {/* ampliada: el alto de la ventana, para que el pie con nombre y botones siga a la vista */}
      <div className={`relative w-full bg-black ${ampliada ? 'h-[calc(100vh-260px)] min-h-[320px]' : 'aspect-video'}`}>
        {viva ? (
          <>
            <CameraVideo key={intento} hlsUrl={c.stream_url} webrtcPath={c.webrtc} label={c.name} sinEtiqueta onModo={alModo} />
            {/* PTZ solo con la cámara ampliada y si el broker la marcó como PTZ */}
            {ampliada && c.ptz && <PtzControls onCommand={onPtz} />}
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ui-terciario px-6 text-center">
            <span className="text-[14px] font-semibold text-ui-tinta">
              {c.status === 'connecting' ? 'Conectando con la cámara…' : 'La cámara no está enviando video'}
            </span>
            {c.status !== 'connecting' && (
              <span className="max-w-[340px] text-[13px] text-ui-tinta-2">
                Revisa que esté encendida y conectada a la red; el video aparece solo cuando vuelve.
              </span>
            )}
          </div>
        )}
      </div>
      <figcaption className="flex items-center gap-3 px-4 py-2.5">
        <span className="truncate text-[13px] font-semibold text-ui-tinta">{c.name}</span>
        {viva ? <Punto nivel="bien" fuerte="En vivo" />
          : c.status === 'connecting' ? <Punto nivel="alerta" fuerte="Conectando" />
          : <Punto nivel="critico" fuerte="Sin video" />}
        {viva && modo && <span className="font-ui-num text-[11px] text-ui-apagado" title={modo === 'HLS' ? 'Respaldo con más retraso' : 'Baja latencia'}>{modo}</span>}
        <span className="ml-auto flex gap-1">
          {viva && <BotonIcono etiqueta="Reconectar el video" onClick={() => setIntento((n) => n + 1)}><RotateCw size={15} /></BotonIcono>}
          <BotonIcono etiqueta={ampliada ? 'Ver todas las cámaras' : 'Ampliar'} onClick={onAmpliar}><Maximize2 size={15} /></BotonIcono>
        </span>
      </figcaption>
    </figure>
  );
}
