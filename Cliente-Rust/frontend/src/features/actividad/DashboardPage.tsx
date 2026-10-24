// features/actividad/DashboardPage.tsx — Actividad, para el personal de supervisión (jefe, coordinador, laboratorista, admin).
// Tres pestañas con el mismo encabezado (período y «Actualizar»):
//  - General: las prácticas que reporta la app (cmd::sesiones). Los números van en una frase y en tablas, no en tarjetas.
//  - Dispositivos: quién entra por SSH a cada Pi, con su ubicación (cmd::dispositivos). Aparte de las prácticas.
//  - Encuestas: lo que respondieron los estudiantes al terminar cada práctica (anónimo).
import { useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import {
  Aviso, Boton, BarraAcento, BotonIcono, Buscador, Encabezado, NOTA, Num, Pagina, Pestanas, Punto, Seccion, Selector, TARJETA, Tabla,
  FilasCargando, type Opcion,
} from '@/components/ui';
import { sesionesService, type SesionPractica } from './sesiones.service';
import SesionesMapa from './SesionesMapa';
import DispositivosPanel from './DispositivosPanel';
import EncuestasPanel from './EncuestasPanel';
import {
  conteoPorPractica, detalleUbicacion, duracionMs, esActiva, formatoDuracion, nombreEstudiante, nombrePractica, porEstudiante,
  porUbicacion, resumenGeneral, sesionesPorDia, ubicacion,
} from './dashboardStats';
import { useResumen } from './useResumen';
import { fechaCorta, MESES, PersonaBoton, type PropsPestana } from './piezas';

type PestanaActividad = 'general' | 'dispositivos' | 'encuestas';

// Las encuestas se juntan más despacio: su período va de 30 días a un año.
const PERIODOS: Opcion<string>[] = [{ valor: '7', etiqueta: '7 días' }, { valor: '30', etiqueta: '30 días' }, { valor: '90', etiqueta: '90 días' }];
const PERIODOS_ENCUESTAS: Opcion<string>[] = [{ valor: '30', etiqueta: '30 días' }, { valor: '90', etiqueta: '90 días' }, { valor: '365', etiqueta: '1 año' }];

export default function DashboardPage() {
  const [pestana, setPestana] = useState<PestanaActividad>('general');
  const [dias, setDias] = useState('30');
  const [diasEncuestas, setDiasEncuestas] = useState('90');
  const [recarga, setRecarga] = useState(0);
  const encuestas = pestana === 'encuestas';


  const props: PropsPestana = {
    dias: Number(encuestas ? diasEncuestas : dias), recarga, reintentar: () => setRecarga((n) => n + 1),
  };
  return (
    <Pagina>
      <Encabezado
        titulo="Actividad"
        descripcion="Qué prácticas se hacen, quién las hace y desde dónde."
        derecha={<>
          <Selector nombre="Período" valor={encuestas ? diasEncuestas : dias} onCambio={encuestas ? setDiasEncuestas : setDias}
            opciones={encuestas ? PERIODOS_ENCUESTAS : PERIODOS} />
          <BotonIcono etiqueta="Actualizar" onClick={() => setRecarga((n) => n + 1)}><RefreshCw size={15} /></BotonIcono>
        </>}
        pestanas={<Pestanas<PestanaActividad> nombre="Secciones de Actividad" valor={pestana}
          onCambio={setPestana}
          opciones={[{ valor: 'general', etiqueta: 'General' }, { valor: 'dispositivos', etiqueta: 'Dispositivos' }, { valor: 'encuestas', etiqueta: 'Encuestas' }]} />}
      />
      {pestana === 'general' ? <General {...props} /> : pestana === 'dispositivos' ? <DispositivosPanel {...props} /> : <EncuestasPanel {...props} />}
    </Pagina>
  );
}

function General({ dias, recarga, reintentar }: PropsPestana) {
  const { datos, error, cargando, ahora } = useResumen(sesionesService.resumen, dias, recarga, 30_000);
  const [busqueda, setBusqueda] = useState('');
  const [elegido, setElegido] = useState<string | null>(null);

  const sesiones = datos?.sesiones ?? [];
  const g = useMemo(() => resumenGeneral(sesiones, ahora), [sesiones, ahora]);
  const activas = useMemo(() => sesiones.filter(esActiva), [sesiones]);
  const porDia = useMemo(() => sesionesPorDia(sesiones, dias, ahora), [sesiones, dias, ahora]);
  const maximo = Math.max(1, ...porDia.map((d) => d.total));
  const practicas = useMemo(() => conteoPorPractica(sesiones), [sesiones]);
  const puntos = useMemo(() => porUbicacion(sesiones), [sesiones]);
  const estudiantes = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return porEstudiante(sesiones, ahora).filter((e) => !q || e.nombre.toLowerCase().includes(q) || e.usuario.toLowerCase().includes(q));
  }, [sesiones, ahora, busqueda]);
  const historial = useMemo(() => sesiones.filter((s) => s.usuario === elegido), [sesiones, elegido]);

  if (cargando && !datos) return <FilasCargando plantilla="grid-cols-[minmax(0,1fr)_90px_130px_130px]" columnas={4} />;
  if (error && !datos) return <Aviso nivel="critico" titulo="No se pudo cargar la actividad" detalle={error} accion={<Boton onClick={reintentar}>Reintentar</Boton>} />;
  if (!sesiones.length) {
    return <Aviso titulo={`No hubo sesiones de práctica en los últimos ${dias} días`}
      detalle="Cada práctica que se abre desde la app aparece aquí, con quién la hizo, cuánto duró y desde dónde." />;
  }

  return (
    <>
      {error && <Aviso nivel="alerta" titulo="No se pudo actualizar" detalle={`Se muestran los datos anteriores. Detalle: ${error}`} />}

      <section className="flex flex-col gap-2">
        <p className="m-0 max-w-[760px] text-[15px] leading-relaxed text-ui-tinta-2">
          En los últimos <Num>{dias}</Num> días hubo <Num>{g.total}</Num> {g.total === 1 ? 'sesión' : 'sesiones'} de{' '}
          <Num>{g.estudiantes}</Num> {g.estudiantes === 1 ? 'estudiante' : 'estudiantes'}
          {g.duracionPromedioMs != null && <>, de <Num>{formatoDuracion(g.duracionPromedioMs)}</Num> en promedio</>}.
          {g.practicaTop && <> La más usada fue {g.practicaTop}.</>}
        </p>
        {activas.length
          ? <Punto nivel="bien" fuerte={`${activas.length} en práctica`} resto="ahora mismo" />
          : <Punto nivel="apagado" fuerte="Nadie" resto="está haciendo una práctica en este momento." />}
      </section>

      {activas.length > 0 && (
        <Seccion titulo="En práctica ahora"><TablaSesiones sesiones={activas} ahora={ahora} conEstudiante /></Seccion>
      )}

      <Seccion titulo="Sesiones por día">
        <div className={`${TARJETA} flex flex-col gap-2 px-5 pb-3 pt-5`}>
          <div className="flex h-[120px] items-end gap-1" role="img"
            aria-label={`Sesiones por día en los últimos ${dias} días: ${g.total} en total, máximo ${maximo} en un día.`}>
            {porDia.map((d) => (
              <div key={d.dia} title={`${Number(d.dia.slice(8))} ${MESES[Number(d.dia.slice(5, 7)) - 1]}: ${d.total}`}
                className={`flex-1 rounded-t-[2px] ${d.total ? 'bg-ui-acento-texto' : 'bg-ui-pista'}`}
                style={{ height: d.total ? `${Math.max(3, (d.total / maximo) * 100)}%` : '1px' }} />
            ))}
          </div>
          <div className="flex justify-between border-t border-ui-pista pt-2">
            <span className={NOTA}>{porDia[0] && `${Number(porDia[0].dia.slice(8))} ${MESES[Number(porDia[0].dia.slice(5, 7)) - 1]}`}</span>
            <span className={NOTA}>hoy</span>
          </div>
        </div>
      </Seccion>

      <Seccion titulo="Prácticas más usadas">
        <div className={`${TARJETA} px-5 py-1`}>
          {practicas.slice(0, 8).map((p, i) => (
            <div key={p.nombre} className={`grid grid-cols-[minmax(0,1fr)_minmax(120px,260px)_40px] items-center gap-5 py-2.5 text-[13px] ${i ? 'border-t border-ui-pista' : ''}`}>
              <span className="truncate text-ui-tinta">{p.nombre}</span>
              <BarraAcento frac={p.total / practicas[0].total} />
              <span className="text-right"><Num>{p.total}</Num></span>
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Estudiantes"
        derecha={<Buscador icono={Search} valor={busqueda} onCambio={setBusqueda} placeholder="Buscar por nombre o usuario" />}>
        {estudiantes.length ? (
          <Tabla
            plantilla="grid-cols-[minmax(0,1fr)_90px_130px_130px]"
            columnas={[{ titulo: 'Estudiante' }, { titulo: 'Sesiones', derecha: true }, { titulo: 'Tiempo total', derecha: true }, { titulo: 'Última', derecha: true }]}
            claves={estudiantes.map((e) => e.usuario)}
            filas={estudiantes.map((e) => [
              <PersonaBoton nombre={e.nombre} usuario={e.usuario} abierta={elegido === e.usuario} enCurso={e.activa ? 'en práctica' : undefined}
                onClick={() => setElegido(elegido === e.usuario ? null : e.usuario)} />,
              <Num>{e.sesiones}</Num>,
              <Num>{formatoDuracion(e.tiempoTotalMs)}</Num>,
              <Num>{fechaCorta(e.ultima)}</Num>,
            ])}
          />
        ) : <Aviso titulo={`Nadie coincide con «${busqueda.trim()}»`} />}
      </Seccion>

      {elegido && historial.length > 0 && (
        <Seccion titulo={`Historial de ${nombreEstudiante(historial[0])}`}
          derecha={<Boton onClick={() => setElegido(null)}>Cerrar</Boton>}>
          <TablaSesiones sesiones={historial} ahora={ahora} />
        </Seccion>
      )}

      <Seccion titulo="Desde dónde se conectan"
        derecha={<span className={NOTA}>verde: en práctica ahora; punteado: aproximado por IP (centro de la ciudad)</span>}>
        {puntos.length
          ? <div className={`${TARJETA} h-[300px]`}><SesionesMapa puntos={puntos} /></div>
          : <Aviso titulo="Todavía no hay sesiones con ubicación en el período" />}
      </Seccion>
    </>
  );
}

function TablaSesiones({ sesiones, ahora, conEstudiante }: { sesiones: SesionPractica[]; ahora: number; conEstudiante?: boolean }) {
  const columnas = [
    ...(conEstudiante ? [{ titulo: 'Estudiante' }] : []),
    { titulo: 'Práctica' }, { titulo: 'Inicio', derecha: true }, { titulo: 'Duración', derecha: true }, { titulo: 'Desde' }, { titulo: 'IP' },
  ];
  return (
    <Tabla
      plantilla={conEstudiante
        ? 'grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_110px_120px_minmax(0,1fr)_120px]'
        : 'grid-cols-[minmax(0,1fr)_110px_120px_minmax(0,1fr)_120px]'}
      columnas={columnas}
      claves={sesiones.map((s) => s.id)}
      filas={sesiones.map((s) => [
        ...(conEstudiante ? [<span className="block truncate font-semibold text-ui-tinta">{nombreEstudiante(s)}</span>] : []),
        <span className="block truncate text-ui-tinta" title={nombrePractica(s)}>{nombrePractica(s)}</span>,
        <Num>{fechaCorta(s.inicio)}</Num>,
        <span className="flex flex-col items-end">
          <Num>{formatoDuracion(duracionMs(s, ahora))}</Num>
          {esActiva(s) ? <span className="text-[11px] text-ui-bien-texto">en curso</span>
            : s.cierre === 'sin_latido' && <span className="text-[11px] text-ui-apagado">se perdió la conexión</span>}
        </span>,
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{ubicacion(s)}</span>
          {detalleUbicacion(s) && <span className="truncate text-[11px] text-ui-apagado">{detalleUbicacion(s)}</span>}
        </span>,
        <span className="block truncate font-ui-num text-[12px] text-ui-apagado">{s.ip || '—'}</span>,
      ])}
    />
  );
}
