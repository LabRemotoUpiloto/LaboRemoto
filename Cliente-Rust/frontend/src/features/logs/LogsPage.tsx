// features/logs/LogsPage.tsx — Sesiones SSH: una tabla por día (hora local), una fila por sesión.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileDown, Monitor, RefreshCw, ScrollText, Search, Trash2 } from 'lucide-react';
import { useToasts } from '@/app/providers/ToastContext';
import {
  Aviso, Boton, BotonIcono, BotonPeligro, Buscador, Dialogo, Encabezado, ETIQUETA, FILA, FilasCargando, Num, Pagina, Paginador,
  Selector, TARJETA, paginar,
} from '@/components/ui';
import { deleteSessionLog, listSessionLogs } from './session.service';
import { agrupar, desdeMetadata, duracionTexto, equipoDe, filtrarYOrdenar, horaDe, type Orden, type SessionLog } from './sesiones';
import { guardarReporteComandos } from './reporte';

const COLUMNAS = 'grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)_130px_90px_100px]';
const TITULOS = ['Hora', 'Usuario', 'Equipo', 'Duración', 'Comandos', ''];
// Con uso diario la lista solo crece: se pagina (el costo es el DOM, no la consulta).
const POR_PAGINA = 20;

interface LogsPageProps {
  onOpenLog?: (session: SessionLog) => void;
}

export default function LogsPage({ onOpenLog }: LogsPageProps) {
  const { push } = useToasts();
  const [sesiones, setSesiones] = useState<SessionLog[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usuario, setUsuario] = useState('');
  const [equipo, setEquipo] = useState('');
  const [orden, setOrden] = useState<Orden>('recientes');
  const [pagina, setPagina] = useState(1);
  const [borrar, setBorrar] = useState<SessionLog | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setSesiones((await listSessionLogs()).map(desdeMetadata));
    } catch (err) {
      setError(String(err));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);
  // Cambiar filtro u orden vuelve a la primera página: si no, quedarías «en la página 5» de otro resultado.
  useEffect(() => { setPagina(1); }, [usuario, equipo, orden]);

  const filtradas = useMemo(() => filtrarYOrdenar(sesiones, usuario, equipo, orden), [sesiones, usuario, equipo, orden]);
  // paginar ajusta la página si ya no existe (p. ej. al borrar la última sesión de la última página)
  const pag = useMemo(() => paginar(filtradas, pagina, POR_PAGINA), [filtradas, pagina]);
  const grupos = useMemo(() => agrupar(pag.filas, orden), [pag, orden]);

  const descargarPdf = async (s: SessionLog) => {
    push({ type: 'info', message: 'Preparando el reporte de comandos…' });
    try {
      push({ type: 'success', message: `Reporte guardado: ${await guardarReporteComandos(s)}` });
    } catch (err) {
      push({ type: 'error', message: `No se pudo generar el reporte: ${err}` });
    }
  };

  const confirmarBorrado = async () => {
    if (!borrar) return;
    try {
      await deleteSessionLog(borrar.id);
      setSesiones((prev) => prev.filter((s) => s.id !== borrar.id));
      push({ type: 'success', message: 'Registro de la sesión eliminado' });
    } catch (err) {
      push({ type: 'error', message: `No se pudo eliminar el registro: ${err}` });
    } finally {
      setBorrar(null);
    }
  };

  const filtrando = !!(usuario.trim() || equipo.trim());

  return (
    <Pagina>
      <Encabezado
        titulo="Sesiones SSH"
        descripcion="Historial de las sesiones SSH: quién entró, a qué equipo, cuánto duró y qué comandos usó."
        derecha={!error && <BotonIcono etiqueta="Recargar" onClick={() => void cargar()} disabled={cargando}><RefreshCw size={15} /></BotonIcono>}
      />

      {error ? (
        <Aviso nivel="critico" titulo="No se pudo leer el historial de sesiones"
          detalle={<>Vuelve a intentarlo en un momento. Detalle: <span className="font-ui-num">{error}</span></>}
          accion={<Boton onClick={() => void cargar()}><RefreshCw size={14} aria-hidden /> Reintentar</Boton>} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Buscador icono={Search} valor={usuario} onCambio={setUsuario} placeholder="Usuario" etiqueta="Buscar por usuario" ancho="w-[180px]" />
            <Buscador icono={Monitor} valor={equipo} onCambio={setEquipo} placeholder="Equipo o IP" etiqueta="Buscar por equipo o IP" ancho="w-[180px]" />
            <Selector<Orden> nombre="Orden" valor={orden} onCambio={setOrden}
              opciones={[{ valor: 'recientes', etiqueta: 'Más recientes' }, { valor: 'largas', etiqueta: 'Más largas' }]} />
          </div>

          {cargando ? (
            <FilasCargando plantilla={COLUMNAS} columnas={6} filas={8} />
          ) : filtradas.length === 0 ? (
            filtrando
              ? <Aviso titulo="Ninguna sesión coincide con la búsqueda" detalle="Prueba con otra parte del usuario, del nombre del equipo o de la IP." />
              : <Aviso titulo="Todavía no hay sesiones SSH registradas"
                  detalle="Cada vez que alguien se conecta por SSH desde la app, la sesión aparece aquí con su duración y sus comandos." />
          ) : (
            <div className={TARJETA} role="table" aria-label="Sesiones SSH">
              <div role="row" className={`grid ${COLUMNAS} gap-4 border-b border-ui-borde px-5 py-2.5`}>
                {TITULOS.map((t, k) => (
                  <span key={k} role="columnheader" className={`${ETIQUETA} ${k === 3 || k === 4 ? 'text-right' : ''}`}>
                    {t || <span className="sr-only">Acciones</span>}
                  </span>
                ))}
              </div>
              {grupos.map((g) => (
                <div key={g.titulo} role="rowgroup">
                  <div className="border-b border-ui-pista bg-ui-fondo px-5 pb-1.5 pt-4 text-[13px] font-semibold text-ui-tinta">{g.titulo}</div>
                  {g.sesiones.map((s, k) => (
                    <FilaSesion key={s.id} sesion={s} primera={k === 0}
                      onVer={() => onOpenLog?.(s)} onPdf={() => void descargarPdf(s)} onBorrar={() => setBorrar(s)} />
                  ))}
                </div>
              ))}
              <Paginador pagina={pag} onPagina={setPagina} unidad="sesiones" />
            </div>
          )}
        </>
      )}

      {borrar && (
        <Dialogo
          titulo="¿Eliminar el registro?"
          descripcion={<>Se borra la sesión de <strong className="text-ui-tinta">{borrar.user}</strong> del{' '}
            {new Date(borrar.startedAt).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}, con sus comandos. No se puede deshacer.</>}
          onCerrar={() => setBorrar(null)}
          acciones={<>
            <Boton onClick={() => setBorrar(null)}>Cancelar</Boton>
            <BotonPeligro onClick={() => void confirmarBorrado()}>Eliminar</BotonPeligro>
          </>}
        />
      )}
    </Pagina>
  );
}

function FilaSesion({ sesion: s, primera, onVer, onPdf, onBorrar }: {
  sesion: SessionLog; primera: boolean; onVer: () => void; onPdf: () => void; onBorrar: () => void;
}) {
  const e = equipoDe(s.host, s.port);
  const [nombre] = s.user.split('@');
  return (
    <div role="row" className={`grid ${COLUMNAS} items-center gap-4 px-5 py-2 ${FILA} ${primera ? '' : 'border-t border-ui-pista'}`}>
      <span role="cell"><Num>{horaDe(s.startedAt)}</Num></span>
      <span role="cell" title={s.user} className="truncate font-ui-num text-[12px] text-ui-tinta">{nombre}</span>
      <span role="cell" title={`${s.host}:${s.port}`} className="truncate">
        {e.nombre ? <span className="text-ui-tinta">{e.nombre}</span> : <span className="font-ui-num text-[12px]">{e.direccion}</span>}
      </span>
      <span role="cell" className="text-right">
        {s.endedAt ? <Num>{duracionTexto(s.duration ?? 0)}</Num> : <span className="text-ui-bien-texto">en curso</span>}
      </span>
      <span role="cell" className={`text-right ${s.totalCommands ? '' : 'text-ui-apagado'}`}>
        <Num acento={s.totalCommands > 0}>{s.totalCommands}</Num>
      </span>
      <span role="cell" className="flex justify-end gap-1">
        <BotonIcono etiqueta="Ver registro" onClick={onVer}><ScrollText size={15} /></BotonIcono>
        <BotonIcono etiqueta="Descargar PDF" onClick={onPdf}><FileDown size={15} /></BotonIcono>
        <BotonIcono etiqueta="Eliminar registro" onClick={onBorrar}><Trash2 size={15} /></BotonIcono>
      </span>
    </div>
  );
}
