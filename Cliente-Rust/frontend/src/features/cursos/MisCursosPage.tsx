// features/cursos/MisCursosPage.tsx — los cursos del usuario en Moodle y sus prácticas. Docente y estudiante ven lo mismo con
// distinto detalle: el docente abre la vista general del curso y, en cada práctica, quién entregó y con qué nota.
import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Link2, RefreshCw } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { Aviso, Boton, ETIQUETA, Encabezado, FILA, FilasCargando, Pagina, Paginador, TARJETA, paginar } from '@/components/ui';
import {
  moodleCursosService, etiquetaEstado,
  type EntregasPractica, type MisCursos, type MoodlePractica, type PracticasCurso,
} from './moodleCursos.service';
import { etiquetaEstadoDocente, resumenEntregas, textoNota, yaEntrego } from './entregasStats';
import ResumenGeneralPanel from './ResumenGeneralPanel';

const mensajeDe = (e: any) => e?.message ?? String(e);

const CURSOS_POR_PAGINA = 8;
const PRACTICAS_POR_PAGINA = 8;
const ESTUDIANTES_POR_PAGINA = 10;

export default function MisCursosPage() {
  const [datos, setDatos] = useState<MisCursos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [abierto, setAbierto] = useState<number | null>(null);
  /** Curso cuya vista general (todas las prácticas × todos los estudiantes) está abierta. */
  const [general, setGeneral] = useState<number | null>(null);
  const [practicas, setPracticas] = useState<Record<number, PracticasCurso | 'cargando' | string>>({});

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setDatos(await moodleCursosService.misCursos());
    } catch (e: any) {
      setError(mensajeDe(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const alternar = async (cursoId: number) => {
    if (abierto === cursoId) { setAbierto(null); return; }
    setAbierto(cursoId);
    setPracticas((p) => ({ ...p, [cursoId]: 'cargando' }));
    try {
      const r = await moodleCursosService.practicasDeCurso(cursoId);
      setPracticas((p) => ({ ...p, [cursoId]: r }));
    } catch (e: any) {
      setPracticas((p) => ({ ...p, [cursoId]: mensajeDe(e) }));
    }
  };

  const vista = paginar(datos?.cursos ?? [], pagina, CURSOS_POR_PAGINA);

  return (
    <Pagina ancho="max-w-[960px]">
      <Encabezado titulo="Mis cursos" descripcion="Tus cursos de Moodle y las prácticas de laboratorio de cada uno."
        derecha={<Boton disabled={cargando} onClick={() => void cargar()}><RefreshCw size={14} aria-hidden /> Actualizar</Boton>} />

      {cargando ? (
        <FilasCargando plantilla="grid-cols-[minmax(0,1fr)_200px]" columnas={2} filas={4} />
      ) : error ? (
        <Aviso nivel="critico" titulo="No se pudieron cargar tus cursos" detalle={error}
          accion={<Boton onClick={() => void cargar()}>Reintentar</Boton>} />
      ) : datos && !datos.enMoodle ? (
        <Aviso titulo="Aún no tienes cuenta en Moodle"
          detalle="Tu usuario institucional todavía no aparece en Moodle, por eso no hay cursos para mostrar." />
      ) : !vista.total ? (
        <Aviso titulo="No estás matriculado en ningún curso" detalle="Cuando te matriculen en Moodle, el curso aparece aquí." />
      ) : (
        <div className={TARJETA}>
          <ul className="m-0 list-none p-0">
            {vista.filas.map((c, i) => {
              const docente = c.rol === 'docente';
              return (
                <li key={c.id} className={i ? 'border-t border-ui-pista' : ''}>
                  <div className="flex items-center gap-4 px-5 py-3.5">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[14px] font-semibold text-ui-tinta" title={c.nombre}>{c.nombre}</span>
                      <span className="text-[12px] text-ui-apagado"><span className="font-ui-num">{c.corto}</span>, como {docente ? 'docente' : 'estudiante'}</span>
                    </span>
                    <span className="flex shrink-0 gap-2">
                      {docente && (
                        <Boton aria-expanded={general === c.id} onClick={() => setGeneral(general === c.id ? null : c.id)}>
                          {general === c.id ? 'Ocultar vista general' : 'Vista general'}
                        </Boton>
                      )}
                      <Boton aria-expanded={abierto === c.id} onClick={() => void alternar(c.id)}>
                        {abierto === c.id ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />} Prácticas
                      </Boton>
                    </span>
                  </div>
                  {docente && general === c.id && (
                    <div className="border-t border-ui-pista px-5">
                      <ResumenGeneralPanel cursoId={c.id} />
                    </div>
                  )}
                  {abierto === c.id && <PracticasDelCurso estado={practicas[c.id]} cursoId={c.id} />}
                </li>
              );
            })}
          </ul>
          <Paginador pagina={vista} onPagina={setPagina} unidad={vista.total === 1 ? 'curso' : 'cursos'} />
        </div>
      )}
    </Pagina>
  );
}

function PracticasDelCurso({ estado, cursoId }: { estado: PracticasCurso | 'cargando' | string | undefined; cursoId: number }) {
  const [pagina, setPagina] = useState(1);
  const caja = 'border-t border-ui-pista';
  if (estado === undefined || estado === 'cargando') {
    return <p className={`${caja} m-0 px-5 py-3 text-[13px] text-ui-apagado`} role="status">Cargando prácticas…</p>;
  }
  if (typeof estado === 'string') {
    return <p className={`${caja} m-0 px-5 py-3 text-[13px] text-ui-critico-texto`} role="alert">No se pudieron cargar las prácticas: {estado}</p>;
  }
  const docente = estado.curso.rol === 'docente';
  if (!estado.practicas.length) {
    return (
      <p className={`${caja} m-0 px-5 py-3 text-[13px] text-ui-apagado`}>
        Este curso aún no tiene prácticas de laboratorio.
        {docente && <> Crea una tarea en Moodle y escribe <span className="font-ui-num">labo:</span> seguido del id de la práctica en su «ID number».</>}
      </p>
    );
  }
  const vista = paginar(estado.practicas, pagina, PRACTICAS_POR_PAGINA);
  return (
    <div className={caja}>
      <ul className="m-0 list-none py-0 pl-5 pr-0">
        {vista.filas.map((p, i) => (
          <FilaPractica key={p.cmid} p={p} cursoId={cursoId} docente={docente} primera={i === 0} />
        ))}
      </ul>
      {vista.paginas > 1 && <Paginador pagina={vista} onPagina={setPagina} unidad="prácticas" margen="px-5" />}
    </div>
  );
}

async function copiarEnlace(practica: string) {
  try {
    const enlace = await moodleCursosService.enlacePractica(practica);
    await navigator.clipboard.writeText(enlace);
    notifications.show({ title: 'Enlace copiado', message: 'Pégalo en la descripción de la tarea de Moodle (como enlace o en el texto).', color: 'green' });
  } catch (e) {
    notifications.show({ title: 'No se pudo copiar el enlace', message: mensajeDe(e), color: 'red' });
  }
}

function fechaCorta(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** El estado de la entrega en el color del texto: calificada en verde, sin enviar apagada. */
const colorEstado = (estado: string | null) =>
  estado === 'graded' || estado === 'released' || estado === 'readyforrelease' ? 'text-ui-bien-texto'
    : !estado || estado === 'notgraded' || estado === 'notmarked' ? 'text-ui-apagado' : 'text-ui-tinta-2';

function FilaPractica({ p, cursoId, docente, primera }: { p: MoodlePractica; cursoId: number; docente: boolean; primera: boolean }) {
  const [verEstudiantes, setVerEstudiantes] = useState(false);
  const [refrescar, setRefrescar] = useState(0);
  return (
    <li className={primera ? '' : 'border-t border-ui-pista'}>
      <div className="flex items-center gap-4 py-3 pr-5">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13px] font-semibold text-ui-tinta" title={p.nombre}>{p.nombre}</span>
          <span className="text-[12px] text-ui-apagado">Práctica <span className="font-ui-num">{p.practica}</span></span>
          {docente && !p.flujoRevision && (
            <span className="text-[12px] text-ui-alerta-texto">Activa el «flujo de calificación» en la tarea de Moodle para recibir resultados.</span>
          )}
        </span>
        {docente ? (
          <span className="flex shrink-0 gap-2">
            <Boton aria-expanded={verEstudiantes} onClick={() => { setVerEstudiantes((v) => !v); setRefrescar((n) => n + 1); }}>
              {verEstudiantes ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />} Estudiantes
            </Boton>
            <Boton title="Copia el enlace para pegarlo en la tarea de Moodle: abre la práctica en la app" onClick={() => void copiarEnlace(p.practica)}>
              <Link2 size={14} aria-hidden /> Copiar enlace
            </Boton>
          </span>
        ) : (
          <span className={`shrink-0 whitespace-nowrap text-[13px] ${colorEstado(p.estado)}`}>{etiquetaEstado(p.estado)}</span>
        )}
      </div>
      {docente && verEstudiantes && <EntregasPanel cursoId={cursoId} cmid={p.cmid} refrescar={refrescar} />}
    </li>
  );
}

/** Lo que ve el docente de una práctica: quién la entregó, en qué estado está y con qué nota. Se carga al abrirla. */
function EntregasPanel({ cursoId, cmid, refrescar }: { cursoId: number; cmid: number; refrescar: number }) {
  const [datos, setDatos] = useState<EntregasPractica | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    let activo = true;
    setError(null);
    moodleCursosService.entregasPractica(cursoId, cmid)
      .then((r) => { if (activo) setDatos(r); })
      .catch((e: any) => { if (activo) setError(mensajeDe(e)); });
    return () => { activo = false; };
  }, [cursoId, cmid, refrescar]);

  const texto = 'm-0 pb-3 pr-5 text-[13px]';
  if (error) return <p className={`${texto} text-ui-critico-texto`} role="alert">{error}</p>;
  if (!datos) return <p className={`${texto} text-ui-apagado`} role="status">Cargando estudiantes…</p>;
  if (!datos.estudiantes.length) return <p className={`${texto} text-ui-apagado`}>Este curso no tiene estudiantes matriculados.</p>;

  const r = resumenEntregas(datos.estudiantes);
  const vista = paginar(datos.estudiantes, pagina, ESTUDIANTES_POR_PAGINA);
  const plantilla = 'grid-cols-[minmax(0,36fr)_minmax(0,24fr)_minmax(0,12fr)_minmax(0,28fr)]';
  return (
    <div className="pb-3 pr-5">
      <p className="m-0 mb-2 text-[12px] text-ui-apagado">
        {r.enviadas} de {r.total} enviaron{r.porRevisar > 0 ? `, ${r.porRevisar} por revisar en Moodle` : ''}. La nota final la decides tú en Moodle.
      </p>
      <div className="overflow-x-auto">
        <div role="table" aria-label="Entregas de la práctica" className="min-w-[560px]">
          <div role="row" className={`grid ${plantilla} gap-4 border-b border-ui-borde py-2`}>
            {['Estudiante', 'Estado', 'Nota', 'Última actualización'].map((t) => <span key={t} role="columnheader" className={ETIQUETA}>{t}</span>)}
          </div>
          {vista.filas.map((e, i) => (
            <div key={e.usuario} role="row" className={`grid ${plantilla} items-center gap-4 py-2 ${FILA} ${i ? 'border-t border-ui-pista' : ''}`}>
              <span role="cell" className="flex min-w-0 flex-col">
                <span className="truncate text-ui-tinta" title={e.nombre}>{e.nombre}</span>
                {e.nombre !== e.usuario && <span className="truncate text-[12px] text-ui-apagado">{e.usuario}</span>}
              </span>
              <span role="cell" className={yaEntrego(e) ? '' : 'text-ui-apagado'}>{etiquetaEstadoDocente(e)}</span>
              <span role="cell" className="font-ui-num">{textoNota(e.nota)}</span>
              <span role="cell" className="font-ui-num text-ui-apagado">{fechaCorta(e.fecha)}</span>
            </div>
          ))}
        </div>
      </div>
      {vista.paginas > 1 && <Paginador pagina={vista} onPagina={setPagina} unidad="estudiantes" margen="px-0" />}
    </div>
  );
}
