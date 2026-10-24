// features/comandos/PanelComandos.tsx — los comandos guardados como herramienta de la sesión: buscar, ejecutar en la
// terminal (entra al historial como si se tecleara), pegar sin Enter, copiar, editar, borrar y crear sin salir de la sesión.
import { useEffect, useMemo, useState } from 'react';
import { Menu } from '@mantine/core';
import { Copy, CornerDownLeft, MoreHorizontal, Pencil, Play, Plus, Search, Trash2 } from 'lucide-react';
import { useToasts } from '@/app/providers/ToastContext';
import {
  Aviso, Boton, BotonIcono, BotonPeligro, BotonPrincipal, Buscador, Campo, Desplegable, Dialogo, Paginador, paginar,
} from '@/components/ui';
import { borrarComando, guardarComando, nuevoComando, sirveEn, useComandos, type Comando, type TipoTerminal } from './comandos';

const POR_PAGINA = 8;
const TODAS = '__todas__';

interface Props {
  /** La terminal de la sesión: filtra los comandos que sirven ahí y marca los nuevos. Sin ella, se ven todos. */
  terminal?: TipoTerminal;
  /** Sin sesión (página Comandos) no hay Ejecutar ni Pegar. */
  onEjecutar?: (comando: string) => void;
  onPegar?: (comando: string) => void;
  /** Cambia cada vez que se pide un comando nuevo desde afuera (el «+» de la barra del panel). */
  pedirNuevo?: number;
}

export default function PanelComandos({ terminal, onEjecutar, onPegar, pedirNuevo = 0 }: Props) {
  const { push } = useToasts();
  const { comandos, error, recargar } = useComandos();
  const [q, setQ] = useState('');
  const [categoria, setCategoria] = useState(TODAS);
  const [pagina, setPagina] = useState(1);
  const [editando, setEditando] = useState<Comando | null>(null);
  const [borrar, setBorrar] = useState<Comando | null>(null);
  useEffect(() => { if (pedirNuevo) setEditando(nuevoComando({ titulo: '', comando: '', terminal: terminal ?? null })); }, [pedirNuevo, terminal]);
  useEffect(() => { setPagina(1); }, [q, categoria]);

  const propios = useMemo(() => (comandos ?? []).filter((c) => sirveEn(c, terminal)), [comandos, terminal]);
  const categorias = useMemo(() => [...new Set(propios.map((c) => c.categoria).filter((c): c is string => !!c))].sort(), [propios]);
  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return propios.filter((c) => (categoria === TODAS || c.categoria === categoria)
      && (!t || `${c.titulo} ${c.descripcion ?? ''} ${c.comando} ${c.categoria ?? ''}`.toLowerCase().includes(t)));
  }, [propios, q, categoria]);
  const pag = paginar(visibles, pagina, POR_PAGINA);

  const copiar = async (c: Comando) => {
    try { await navigator.clipboard.writeText(c.comando); push({ type: 'success', message: 'Comando copiado' }); }
    catch { push({ type: 'error', message: 'No se pudo copiar' }); }
  };

  const confirmarBorrado = async () => {
    if (!borrar) return;
    try { await borrarComando(borrar.id); push({ type: 'success', message: `«${borrar.titulo}» borrado` }); }
    catch (e) { push({ type: 'error', message: `No se pudo borrar: ${e}` }); }
    finally { setBorrar(null); }
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {editando && <Formulario comando={editando} onCerrar={() => setEditando(null)} />}

      {!!propios.length && (
        <div className="flex flex-col gap-2 p-3 pb-2">
          <Buscador icono={Search} valor={q} onCambio={setQ} placeholder="Buscar comando" etiqueta="Buscar comando" ancho="w-full" />
          {categorias.length > 0 && (
            <Desplegable etiqueta="Categoría" valor={categoria} onCambio={setCategoria}
              opciones={[{ valor: TODAS, etiqueta: 'Todas las categorías' }, ...categorias.map((c) => ({ valor: c, etiqueta: c }))]} />
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {comandos === null ? (
          <p className="m-0 p-3 text-[13px] text-ui-apagado" role="status">Cargando comandos…</p>
        ) : error ? (
          <div className="p-3"><Aviso nivel="critico" titulo="No se pudieron leer los comandos" detalle={error}
            accion={<Boton onClick={() => void recargar()}>Reintentar</Boton>} /></div>
        ) : !propios.length ? (
          <div className="p-3">
            <Aviso titulo="Aún no guardaste comandos"
              detalle="Guarda los que repites seguido y ejecútalos con un clic. También puedes pedirle al chat «guárdame esto como comando»."
              accion={!editando && <Boton onClick={() => setEditando(nuevoComando({ titulo: '', comando: '', terminal: terminal ?? null }))}><Plus size={14} aria-hidden /> Nuevo</Boton>} />
          </div>
        ) : !visibles.length ? (
          <p className="m-0 p-3 text-[13px] text-ui-tinta-2">Ningún comando coincide con la búsqueda.</p>
        ) : (
          <ul className="m-0 list-none p-0" aria-label="Comandos guardados">
            {pag.filas.map((c, i) => (
              <li key={c.id} className={`flex items-start gap-2 px-3 py-2.5 hover:bg-[color-mix(in_srgb,var(--accent-primary)_6%,transparent)] ${i ? 'border-t border-ui-pista' : ''}`}>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[13px] text-ui-tinta" title={c.titulo}>{c.titulo}</span>
                  {c.descripcion && <span className="line-clamp-2 text-[12px] text-ui-tinta-2" title={c.descripcion}>{c.descripcion}</span>}
                  <code className="truncate font-ui-num text-[12px] text-ui-tinta-2" title={c.comando}>{c.comando}</code>
                  {c.categoria && <span className="text-[11px] text-ui-apagado">{c.categoria}</span>}
                </span>
                <span className="flex shrink-0 items-center">
                  {onEjecutar && <BotonIcono etiqueta={`Ejecutar ${c.titulo}`} onClick={() => onEjecutar(c.comando)}><Play size={14} /></BotonIcono>}
                  {onPegar && <BotonIcono etiqueta={`Pegar ${c.titulo} sin ejecutar`} onClick={() => onPegar(c.comando)}><CornerDownLeft size={14} /></BotonIcono>}
                  <Menu position="bottom-end" withinPortal shadow="md" width={170}>
                    <Menu.Target>
                      <BotonIcono etiqueta={`Más opciones de ${c.titulo}`}><MoreHorizontal size={14} /></BotonIcono>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item leftSection={<Copy size={14} />} onClick={() => void copiar(c)}>Copiar</Menu.Item>
                      <Menu.Item leftSection={<Pencil size={14} />} onClick={() => setEditando(c)}>Editar</Menu.Item>
                      <Menu.Item leftSection={<Trash2 size={14} />} c="var(--color-ui-critico-texto)" onClick={() => setBorrar(c)}>Borrar</Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {visibles.length > POR_PAGINA && <Paginador pagina={pag} onPagina={setPagina} unidad="comandos" />}

      {borrar && (
        <Dialogo titulo={`¿Borrar «${borrar.titulo}»?`} descripcion="Se quita de tus comandos guardados. No se puede deshacer." onCerrar={() => setBorrar(null)}
          acciones={<><Boton onClick={() => setBorrar(null)}>Cancelar</Boton><BotonPeligro onClick={() => void confirmarBorrado()}>Borrar</BotonPeligro></>} />
      )}
    </div>
  );
}

/** Nuevo o editar, arriba de la lista (no tapa la terminal). */
function Formulario({ comando, onCerrar }: { comando: Comando; onCerrar: () => void }) {
  const { push } = useToasts();
  const [titulo, setTitulo] = useState(comando.titulo);
  const [texto, setTexto] = useState(comando.comando);
  const [descripcion, setDescripcion] = useState(comando.descripcion ?? '');
  const [categoria, setCategoria] = useState(comando.categoria ?? '');
  const [guardando, setGuardando] = useState(false);
  const esNuevo = !comando.titulo && !comando.comando;

  const guardar = async () => {
    if (!texto.trim()) return;
    setGuardando(true);
    try {
      await guardarComando({ ...comando, titulo, comando: texto, descripcion: descripcion.trim() || null, categoria: categoria.trim() || null });
      push({ type: 'success', message: esNuevo ? 'Comando guardado' : 'Cambios guardados' });
      onCerrar();
    } catch (e) {
      push({ type: 'error', message: `No se pudo guardar: ${e}` });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form className="flex flex-col gap-3 border-b border-ui-pista p-3" aria-label={esNuevo ? 'Nuevo comando' : 'Editar comando'}
      onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
      <Campo etiqueta="Nombre" placeholder="Por ejemplo: Temperatura" value={titulo} maxLength={120} autoFocus
        onChange={(e) => setTitulo(e.currentTarget.value)} />
      <Campo etiqueta="Comando" mono filas={3} value={texto} placeholder="vcgencmd measure_temp"
        onChange={(e) => setTexto(e.currentTarget.value)} />
      <Campo etiqueta="Para qué sirve" filas={2} value={descripcion} maxLength={300}
        placeholder="Por ejemplo: muestra la temperatura del procesador de la Pi"
        onChange={(e) => setDescripcion(e.currentTarget.value)} />
      <Campo etiqueta="Categoría (opcional)" placeholder="Por ejemplo: Servicios" value={categoria}
        onChange={(e) => setCategoria(e.currentTarget.value)} />
      <span className="flex justify-end gap-2">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <BotonPrincipal type="submit" disabled={!texto.trim() || guardando}>{guardando ? 'Guardando…' : 'Guardar'}</BotonPrincipal>
      </span>
    </form>
  );
}
