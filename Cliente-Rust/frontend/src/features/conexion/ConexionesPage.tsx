// features/conexion/ConexionesPage.tsx — Conexiones: una sola página para conectarse. Junta lo que eran Nueva conexión,
// Terminal local, Equipos guardados y Sesiones SSH (pestaña «Registros»). Cada rol ve solo su parte: conectarse es de
// semillerista y administrador (permiso 'hosts'); los registros, del personal y el docente (permiso 'logs'); las prácticas
// de los estudiantes guardadas en la Pi, de administrador, semillerista y docente (permiso 'registros-estudiantes').
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Pencil, Plus, Search, SquareTerminal, Trash2 } from 'lucide-react';
import { useToasts } from '@/app/providers/ToastContext';
import {
  Aviso, Boton, BotonIcono, BotonPeligro, BotonPrincipal, Buscador, Dialogo, Encabezado, FilasCargando, Pagina, Paginador,
  Pestanas, Seccion, Tabla, paginar,
} from '@/components/ui';
import { canAccessPage, useEffectiveRole } from '@/features/cuenta/usePermissions';
import LogsPage from '@/features/logs/LogsPage';
import RegistrosEstudiantes from '@/features/registros/RegistrosEstudiantes';
import type { SessionLog } from '@/features/logs/sesiones';
import { KNOWN_DEVICES, getDeviceLabel, isRaspberryPi4 } from '@/lib/devices';
import { deleteHostFile, listHostEntries, type SavedHostFileEntry } from '@/lib/storage.service';
import NuevaConexionDialogo, { type EquipoRapido } from './NuevaConexionDialogo';
import { useConectarGuardado } from './useConectarGuardado';
import { useRecentConnections, type RecentConnection } from './useRecentConnections';
import { precargar } from '@/app/diferidos';

export type PestanaConexiones = 'equipos' | 'registros' | 'estudiantes';
const POR_PAGINA = 8;

const PI: EquipoRapido = {
  id: 'pi4', name: KNOWN_DEVICES.RASPBERRY_PI_4.label, host: KNOWN_DEVICES.RASPBERRY_PI_4.host, port: KNOWN_DEVICES.RASPBERRY_PI_4.port,
};

/** Qué abre el diálogo: vacío (nueva), la Pi, una reciente o un equipo guardado para editar. */
type QueAbre =
  | { tipo: 'nueva' }
  | { tipo: 'pi' }
  | { tipo: 'reciente'; conexion: RecentConnection }
  | { tipo: 'editar'; entrada: SavedHostFileEntry };

function haceCuanto(t: number): string {
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 60) return min < 1 ? 'hace un momento' : `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

interface Props {
  onConnected: (session: { id: string; label: string }) => void;
  onOpenLog?: (session: SessionLog) => void;
  pestanaInicial?: PestanaConexiones;
}

export default function ConexionesPage({ onConnected, onOpenLog, pestanaInicial = 'equipos' }: Props) {
  const role = useEffectiveRole();
  const conEquipos = canAccessPage('hosts', role);
  const conRegistros = canAccessPage('logs', role);
  const conTerminal = canAccessPage('local-terminal-new', role);
  const conEstudiantes = canAccessPage('registros-estudiantes', role);
  const opciones = useMemo(() => ([
    conEquipos && { valor: 'equipos', etiqueta: 'Equipos' },
    conRegistros && { valor: 'registros', etiqueta: 'Registros' },
    conEstudiantes && { valor: 'estudiantes', etiqueta: 'Prácticas de estudiantes' },
  ].filter(Boolean) as { valor: PestanaConexiones; etiqueta: string }[]), [conEquipos, conRegistros, conEstudiantes]);
  // la pestaña pedida, si este rol la tiene; si no, la primera que sí
  const inicial = opciones.some((o) => o.valor === pestanaInicial) ? pestanaInicial : (opciones[0]?.valor ?? 'registros');
  const [pestana, setPestana] = useState<PestanaConexiones>(inicial);
  useEffect(() => { setPestana(inicial); }, [inicial]);

  return (
    <Pagina>
      <Encabezado titulo="Conexiones"
        descripcion={conEquipos
          ? 'Entra por SSH a un equipo del laboratorio o a tu propio servidor, o abre una terminal en este computador.'
          : conEstudiantes
            ? 'Historial de las sesiones SSH y lo que hizo cada estudiante en la terminal durante sus prácticas.'
            : 'Historial de las sesiones SSH: quién entró, a qué equipo, cuánto duró y qué comandos usó.'}
        derecha={conEquipos && <>
          {conTerminal && (
            <Boton onClick={() => window.dispatchEvent(new CustomEvent('app:open-local-terminal'))}>
              <SquareTerminal size={14} aria-hidden /> Terminal local
            </Boton>
          )}
          <BotonPrincipal data-tour="nueva-conexion" onClick={() => window.dispatchEvent(new CustomEvent('conexiones:nueva'))}>
            <Plus size={15} aria-hidden /> Nueva conexión
          </BotonPrincipal>
        </>}
        pestanas={opciones.length > 1 && (
          <Pestanas<PestanaConexiones> valor={pestana} onCambio={setPestana} nombre="Secciones de Conexiones" opciones={opciones} />
        )} />

      {pestana === 'registros' ? <LogsPage incrustada onOpenLog={onOpenLog} />
        : pestana === 'estudiantes' ? <RegistrosEstudiantes />
        : <Equipos onConnected={onConnected} />}
    </Pagina>
  );
}

/** Equipos: los del laboratorio, los guardados y los recientes. Cada uno se conecta desde su fila. */
function Equipos({ onConnected }: { onConnected: Props['onConnected'] }) {
  const { push } = useToasts();
  const [entradas, setEntradas] = useState<SavedHostFileEntry[] | null>(null);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [pagina, setPagina] = useState(1);
  const [dialogo, setDialogo] = useState<QueAbre | null>(null);
  const [borrar, setBorrar] = useState<SavedHostFileEntry | null>(null);
  const { recentConnections, saveConnection, clearConnections } = useRecentConnections();
  const { conectar, conectando } = useConectarGuardado(onConnected);

  const cargar = useCallback(async () => {
    setErrorLista(null);
    try {
      setEntradas((await listHostEntries()) ?? []);
    } catch (e) {
      setErrorLista(String(e));
      setEntradas([]);
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  // quien abre Conexiones suele conectarse: la sesión y el chat se adelantan (app/diferidos.ts)
  useEffect(() => { precargar('sesion', 'lectores'); }, []);
  useEffect(() => { setPagina(1); }, [q]);
  // «Nueva conexión» está en el encabezado (fuera de esta parte): llega por evento
  useEffect(() => {
    const abrir = () => setDialogo({ tipo: 'nueva' });
    window.addEventListener('conexiones:nueva', abrir);
    return () => window.removeEventListener('conexiones:nueva', abrir);
  }, []);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (entradas ?? []).filter(({ payload: h }) => !t || `${h.name ?? ''} ${h.description ?? ''} ${h.host} ${h.user ?? ''}`.toLowerCase().includes(t));
  }, [entradas, q]);
  const pag = paginar(visibles, pagina, POR_PAGINA);

  const confirmarBorrado = async () => {
    if (!borrar) return;
    try {
      await deleteHostFile(borrar.file);
      setEntradas((prev) => (prev ?? []).filter((e) => e.file !== borrar.file));
      push({ type: 'success', message: 'Equipo eliminado' });
    } catch {
      push({ type: 'error', message: 'No se pudo eliminar el equipo' });
    } finally {
      setBorrar(null);
    }
  };

  const nombreDe = (e: SavedHostFileEntry) => e.payload.name || getDeviceLabel(e.payload.host, Number(e.payload.port));

  return (
    <>
      <Seccion titulo="Del laboratorio">
        <div data-tour="quick-hosts-panel">
          <Tabla plantilla="grid-cols-[minmax(0,1fr)_minmax(0,1fr)_130px]"
            columnas={[{ titulo: 'Equipo' }, { titulo: 'Dirección' }, { titulo: '' }]}
            claves={[PI.id]}
            filas={[[
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-ui-tinta">{PI.name}</span>
                <span className="text-[11px] text-ui-apagado">Entras con tu usuario institucional</span>
              </span>,
              <span className="truncate font-ui-num text-[12px] text-ui-tinta">{PI.host}:{PI.port}</span>,
              <span className="flex justify-end">
                <Boton className="quick-host-pill" onClick={() => setDialogo({ tipo: 'pi' })}>Conectar <ArrowRight size={14} aria-hidden /></Boton>
              </span>,
            ]]} />
        </div>
      </Seccion>

      <Seccion titulo="Guardados" derecha={!!entradas?.length &&
        <Buscador icono={Search} valor={q} onCambio={setQ} placeholder="Buscar por nombre, descripción o IP" ancho="w-[260px]" etiqueta="Buscar equipos guardados" />}>
        {entradas === null ? (
          <FilasCargando plantilla="grid-cols-[minmax(0,1fr)_minmax(0,1fr)_200px]" columnas={3} filas={3} />
        ) : errorLista ? (
          <Aviso nivel="critico" titulo="No se pudieron leer los equipos guardados" detalle={errorLista}
            accion={<Boton onClick={() => void cargar()}>Reintentar</Boton>} />
        ) : entradas.length === 0 ? (
          <Aviso titulo="Aún no guardaste ningún equipo"
            detalle="Al conectarte a un servidor puedes guardarlo para entrar con un clic. La contraseña queda cifrada en este computador."
            accion={<Boton onClick={() => setDialogo({ tipo: 'nueva' })}><Plus size={14} aria-hidden /> Nueva conexión</Boton>} />
        ) : visibles.length === 0 ? (
          <Aviso titulo="Ningún equipo coincide con la búsqueda" detalle="Prueba con otra parte del nombre, de la descripción, del usuario o de la IP." />
        ) : (
          <Tabla plantilla="grid-cols-[minmax(0,1fr)_minmax(0,1fr)_200px]"
            columnas={[{ titulo: 'Nombre' }, { titulo: 'Usuario y dirección' }, { titulo: '' }]}
            claves={pag.filas.map((e) => e.file)}
            filas={pag.filas.map((e) => {
              const h = e.payload;
              return [
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-ui-tinta" title={nombreDe(e)}>{nombreDe(e)}</span>
                  {h.description
                    ? <span className="truncate text-[11px] text-ui-apagado" title={h.description}>{h.description}</span>
                    : isRaspberryPi4(h.host, Number(h.port)) && <span className="text-[11px] text-ui-apagado">Raspberry Pi 4 del laboratorio</span>}
                </span>,
                <span className="block truncate font-ui-num text-[12px] text-ui-tinta" title={`${h.user ?? ''}@${h.host}:${h.port}`}>
                  {h.user}<span className="text-ui-apagado">@</span>{h.host}<span className="text-ui-apagado">:{h.port}</span>
                </span>,
                <span className="flex items-center justify-end gap-1">
                  <Boton disabled={conectando} onClick={() => void conectar(h.host, h.port, h.user, h.password)}>
                    Conectar <ArrowRight size={14} aria-hidden />
                  </Boton>
                  <BotonIcono etiqueta={`Editar ${nombreDe(e)}`} onClick={() => setDialogo({ tipo: 'editar', entrada: e })}><Pencil size={14} /></BotonIcono>
                  <BotonIcono etiqueta={`Eliminar ${nombreDe(e)}`} onClick={() => setBorrar(e)}><Trash2 size={14} /></BotonIcono>
                </span>,
              ];
            })}
            pie={visibles.length > POR_PAGINA && <Paginador pagina={pag} onPagina={setPagina} unidad="equipos" />} />
        )}
      </Seccion>

      {recentConnections.length > 0 && (
        <Seccion titulo="Recientes" derecha={<Boton onClick={clearConnections}>Borrar recientes</Boton>}>
          <Tabla plantilla="grid-cols-[minmax(0,1fr)_160px_130px]"
            columnas={[{ titulo: 'Usuario y equipo' }, { titulo: 'Última vez' }, { titulo: '' }]}
            claves={recentConnections.map((r) => r.id)}
            filas={recentConnections.map((r) => [
              <span className="block truncate font-ui-num text-[12px] text-ui-tinta" title={`${r.user}@${r.host}:${r.port}`}>
                {r.user.split('\\').pop()}<span className="text-ui-apagado">@</span>{getDeviceLabel(r.host, r.port)}
              </span>,
              <span>{haceCuanto(r.lastConnected)}</span>,
              <span className="flex justify-end">
                <Boton onClick={() => setDialogo({ tipo: 'reciente', conexion: r })}>Conectar <ArrowRight size={14} aria-hidden /></Boton>
              </span>,
            ])} />
        </Seccion>
      )}

      {dialogo && (
        <NuevaConexionDialogo
          onCerrar={() => setDialogo(null)}
          onConnected={onConnected}
          quickHost={dialogo.tipo === 'pi' ? PI : null}
          recentConnection={dialogo.tipo === 'reciente' ? dialogo.conexion : null}
          initialPayload={dialogo.tipo === 'editar' ? { ...dialogo.entrada.payload, _originalFile: dialogo.entrada.file } : null}
          recentConnections={recentConnections}
          onConnectionSuccess={saveConnection}
          onGuardado={() => void cargar()}
        />
      )}

      {borrar && (
        <Dialogo titulo={`¿Eliminar «${nombreDe(borrar)}»?`}
          descripcion={<>Se borra de este computador con su contraseña guardada. El servidor <span className="font-ui-num">{borrar.payload.host}</span> no cambia.</>}
          onCerrar={() => setBorrar(null)}
          acciones={<>
            <Boton onClick={() => setBorrar(null)}>Cancelar</Boton>
            <BotonPeligro onClick={() => void confirmarBorrado()}><Trash2 size={14} aria-hidden /> Eliminar</BotonPeligro>
          </>} />
      )}
    </>
  );
}
