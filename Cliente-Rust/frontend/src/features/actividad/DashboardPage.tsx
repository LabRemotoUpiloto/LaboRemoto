// features/actividad/DashboardPage.tsx — Actividad: quién usa el laboratorio remoto, qué hace y desde dónde. Para supervisión.
// Dos preguntas arriba y todo lo de abajo responde a ellas: cuándo (en vivo / histórico) y qué (prácticas, trabajo por SSH, la app).
// El mapa es el protagonista; a su lado, la lista de quién está (en vivo) o de quién estuvo (histórico). Las listas van paginadas.
import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import {
  Aviso, Boton, Buscador, Desplegable, Encabezado, ETIQUETA, NOTA, Num, Pagina, Paginador, Seccion, Selector,
  TARJETA, Tabla, paginar,
} from '@/components/ui';
import { sesionesService } from './sesiones.service';
import { dispositivosService } from './dispositivos.service';
import { haceTiempo } from './dispositivosStats';
import { useResumen } from './useResumen';
import MapaActividad, { type PuntoMapa } from './MapaActividad';
import {
  cuandoSeUsa, delFiltro, delPeriodo, desdeConexiones, desdeSesiones, diaCorto, enVivo, fechaCorta, lapso, lugares, nombreOperador,
  paraRevisar, personas, porDia, recientes, TEXTO_MOTIVO, TEXTO_TIPO, total, type Actividad, type Filtro, type Tipo,
} from './actividad';

type Cuando = 'vivo' | 'historico';
const ALTO = 'h-[min(640px,calc(100vh-300px))] min-h-[440px]';
const POR_PAGINA_VIVO = 8;
const POR_PAGINA_PERSONAS = 10;
const POR_PAGINA_HISTORIAL = 10;
const POR_PAGINA_REVISAR = 5;

export default function DashboardPage() {
  const [cuando, setCuando] = useState<Cuando>('vivo');
  const [filtro, setFiltro] = useState<Filtro>('todo');
  const [dias, setDias] = useState('30');
  const [recarga, setRecarga] = useState(0);
  // En vivo basta con lo reciente (y «lo último» si no hay nadie); el histórico pide su período.
  const diasPedidos = cuando === 'vivo' ? 7 : Number(dias);
  const refresco = cuando === 'vivo' ? 15_000 : 60_000;
  const sesiones = useResumen(sesionesService.resumen, diasPedidos, recarga, refresco);
  const equipos = useResumen(dispositivosService.resumen, diasPedidos, recarga, refresco);
  const ahora = Math.max(sesiones.ahora, equipos.ahora);
  const dispositivos = equipos.datos?.dispositivos ?? [];

  const todas = useMemo(() => {
    const deSesiones = desdeSesiones(sesiones.datos?.sesiones ?? []);
    const ssh = (equipos.datos?.dispositivos ?? []).flatMap((d) => {
      const vistas = new Set<string>();
      const conexiones = [...d.conectados, ...d.conexiones].filter((c) => !vistas.has(c.id) && !!vistas.add(c.id));
      return desdeConexiones(conexiones, d.nombre, deSesiones, ahora);
    });
    return [...deSesiones, ...ssh];
  }, [sesiones.datos, equipos.datos, ahora]);
  const delTipo = useMemo(() => todas.filter(delFiltro(filtro)), [todas, filtro]);

  return (
    <Pagina ancho="max-w-[1320px]">
      <Encabezado
        titulo="Actividad"
        descripcion="Quién usa el laboratorio remoto, qué hace y desde dónde."
        derecha={<>
          <Selector<Cuando> nombre="Cuándo" valor={cuando} onCambio={setCuando}
            opciones={[{ valor: 'vivo', etiqueta: 'En vivo' }, { valor: 'historico', etiqueta: 'Histórico' }]} />
          {cuando === 'historico' && (
            <Desplegable etiqueta="Período" valor={dias} onCambio={setDias} className="w-[180px]"
              opciones={[{ valor: '7', etiqueta: 'Últimos 7 días' }, { valor: '30', etiqueta: 'Últimos 30 días' }, { valor: '90', etiqueta: 'Últimos 90 días' }]} />
          )}
          <Boton onClick={() => setRecarga((n) => n + 1)}><RefreshCw size={14} aria-hidden /> Actualizar</Boton>
        </>}
      />

      {/* El estado de los equipos (en línea o no) está en Monitoreo: aquí solo quién los usa. */}
      <div>
        <Selector<Filtro> nombre="Qué actividad" valor={filtro} onCambio={setFiltro}
          opciones={[{ valor: 'todo', etiqueta: 'Todo' }, { valor: 'practica', etiqueta: 'Prácticas' }, { valor: 'ssh', etiqueta: 'Trabajando por SSH' }, { valor: 'app', etiqueta: 'En la app' }]} />
      </div>

      {dispositivos.filter((d) => d.noReconocidas.conexiones > 0).map((d) => (
        <Aviso key={d.id} nivel="alerta"
          titulo={`${d.noReconocidas.conexiones} ${d.noReconocidas.conexiones === 1 ? 'entrada' : 'entradas'} a ${d.nombre} con cuentas no reconocidas${d.noReconocidas.activas ? `, ${d.noReconocidas.activas} abierta(s) ahora` : ''}`}
          detalle={<>No son del directorio ni la cuenta compartida. La última: <span className="font-ui-num">{d.noReconocidas.ultimas[0].usuario}</span> desde{' '}
            <span className="font-ui-num">{d.noReconocidas.ultimas[0].ip}</span>, {haceTiempo(d.noReconocidas.ultimas[0].inicio, ahora)}.</>} />
      ))}
      {equipos.error && !equipos.datos && (
        <Aviso nivel="alerta" titulo="No se pudo leer el trabajo por SSH" detalle={`Se muestran las prácticas y el uso de la app. Detalle: ${equipos.error}`} />
      )}

      {sesiones.error && !sesiones.datos ? (
        <Aviso nivel="critico" titulo="No se pudo cargar la actividad" detalle={sesiones.error}
          accion={<Boton onClick={() => setRecarga((n) => n + 1)}>Reintentar</Boton>} />
      ) : sesiones.cargando && !sesiones.datos ? (
        <div className={`grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] ${ALTO}`} role="status" aria-busy="true">
          <span className="sr-only">Cargando…</span>
          <div className={`${TARJETA} bg-ui-pista`} /><div className={`${TARJETA} bg-ui-pista`} />
        </div>
      ) : cuando === 'vivo' ? (
        <EnVivo todas={delTipo} ahora={ahora} />
      ) : (
        <Historico actividades={delPeriodo(delTipo, Number(dias), ahora)} dias={Number(dias)} ahora={ahora} filtro={filtro} />
      )}
    </Pagina>
  );
}

// ── En vivo ───────────────────────────────────────────────────────────────────

function EnVivo({ todas, ahora }: { todas: Actividad[]; ahora: number }) {
  const ahoraMismo = useMemo(() => enVivo(todas), [todas]);
  const ultimas = useMemo(() => recientes(todas), [todas]);
  const [marcado, setMarcado] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const pag = paginar(ahoraMismo, pagina, POR_PAGINA_VIVO);
  const puntos: PuntoMapa[] = useMemo(() => ahoraMismo.flatMap((a) => (a.lat != null && a.lon != null
    ? [{ id: a.id, lat: a.lat, lon: a.lon, etiqueta: a.nombre.split(' ')[0], tipo: a.tipo }] : [])), [ahoraMismo]);

  return (
    <>
      <p className="m-0 text-[15px] text-ui-tinta-2">
        {ahoraMismo.length
          ? <>En este momento hay {enFrase(ahoraMismo)}.</>
          : <>Nadie está usando el laboratorio en este momento.{ultimas[0] && <> La última actividad terminó hace {lapso(ahora - ultimas[0].fin!)}.</>}</>}
      </p>
      <div className={`grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] ${ALTO}`}>
        <MapaActividad puntos={puntos} marcado={marcado} onMarcar={setMarcado} vacio="Cuando alguien se conecte, aparece aquí." />
        <div className={`${TARJETA} flex min-h-0 flex-col`}>
          <h3 className={`${ETIQUETA} border-b border-ui-borde px-5 py-3`}>{ahoraMismo.length ? 'Conectados ahora' : 'Lo último'}</h3>
          <ul className="m-0 flex-1 list-none overflow-auto p-0">
            {ahoraMismo.length
              ? pag.filas.map((a, i) => (
                <li key={a.id} className={i ? 'border-t border-ui-pista' : ''}>
                  <button type="button" onClick={() => setMarcado(a.id)} aria-pressed={marcado === a.id}
                    className="flex w-full gap-3 px-5 py-3 text-left hover:bg-ui-hover aria-pressed:bg-[color-mix(in_srgb,var(--accent-primary)_8%,transparent)]">
                    <Fila a={a} nota={`desde hace ${lapso(ahora - a.inicio)}, ${a.lugar}`} />
                  </button>
                </li>
              ))
              : !ultimas.length
                ? <li className="px-5 py-3 text-[13px] text-ui-tinta-2">Todavía no hay registros de este tipo.</li>
                : ultimas.map((a, i) => (
                // Sin nadie conectado: lo último que pasó, para saber cuándo se usó por última vez y quién
                <li key={a.id} className={`flex gap-3 px-5 py-3 ${i ? 'border-t border-ui-pista' : ''}`}>
                  <Fila a={a} nota={`terminó hace ${lapso(ahora - a.fin!)}, ${a.lugar}`} />
                </li>
              ))}
          </ul>
          {ahoraMismo.length > POR_PAGINA_VIVO && <Paginador pagina={pag} onPagina={setPagina} unidad="personas" />}
        </div>
      </div>
      <Leyenda />
    </>
  );
}

function enFrase(actividades: Actividad[]): string {
  const n = (t: Tipo) => actividades.filter((a) => a.tipo === t).length;
  const partes = [
    n('practica') && `${n('practica')} en práctica`,
    n('ssh') && `${n('ssh')} trabajando por SSH`,
    n('app') && `${n('app')} en la app`,
  ].filter(Boolean) as string[];
  return partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}` : partes[0];
}

function Fila({ a, nota }: { a: Actividad; nota: string }) {
  return (
    <>
      <Marca tipo={a.tipo} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[13px] font-semibold text-ui-tinta">{a.nombre}</span>
        <span className="truncate text-[13px] text-ui-tinta-2">{a.detalle}</span>
        <span className={NOTA}>{nota}</span>
      </span>
    </>
  );
}

// ── Histórico ─────────────────────────────────────────────────────────────────

function Historico({ actividades, dias, ahora, filtro }: { actividades: Actividad[]; dias: number; ahora: number; filtro: Filtro }) {
  const [elegido, setElegido] = useState<string | null>(null);
  // Tocar un lugar del mapa muestra las conexiones desde ahí (con IP, operador y cómo se ubicó).
  const [lugar, setLugar] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [paginaPersonas, setPaginaPersonas] = useState(1);
  const [paginaHistorial, setPaginaHistorial] = useState(1);
  const [paginaRevisar, setPaginaRevisar] = useState(1);
  useEffect(() => { setPaginaPersonas(1); }, [busqueda, filtro, dias]);
  useEffect(() => { setPaginaHistorial(1); }, [elegido, lugar, filtro, dias]);
  useEffect(() => { setPaginaRevisar(1); }, [filtro, dias]);

  const dePersona = useMemo(() => (elegido ? actividades.filter((a) => a.persona === elegido) : actividades), [actividades, elegido]);
  const vista = useMemo(() => (lugar ? dePersona.filter((a) => a.lugar === lugar) : dePersona), [dePersona, lugar]);
  const revisar = useMemo(() => paraRevisar(actividades), [actividades]);
  const pagRevisar = paginar(revisar, paginaRevisar, POR_PAGINA_REVISAR);
  const todasLasPersonas = useMemo(() => personas(actividades, ahora), [actividades, ahora]);
  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return todasLasPersonas.filter((p) => !q || `${p.nombre} ${p.persona}`.toLowerCase().includes(q));
  }, [todasLasPersonas, busqueda]);
  const pagPersonas = paginar(lista, paginaPersonas, POR_PAGINA_PERSONAS);
  const puntos: PuntoMapa[] = useMemo(() => {
    const ls = lugares(dePersona);
    const max = Math.max(1, ...ls.map((l) => l.veces));
    return ls.map((l) => ({ id: l.id, lat: l.lat, lon: l.lon, etiqueta: `${l.lugar}, ${l.veces}`, peso: l.veces / max }));
  }, [dePersona]);
  const elegidoNombre = todasLasPersonas.find((p) => p.persona === elegido)?.nombre;
  const historial = useMemo(() => [...vista].sort((a, b) => b.inicio - a.inicio), [vista]);
  const pagHistorial = paginar(historial, paginaHistorial, POR_PAGINA_HISTORIAL);

  if (!actividades.length) {
    return <Aviso titulo={`No hubo actividad ${filtro === 'todo' ? '' : 'de este tipo '}en los últimos ${dias} días`} />;
  }
  return (
    <>
      <p className="m-0 text-[15px] text-ui-tinta-2">
        {elegido || lugar
          ? <>{[elegidoNombre, lugar && `desde ${lugar}`].filter(Boolean).join(' ')}: {vista.length} {vista.length === 1 ? 'vez' : 'veces'} en los últimos {dias} días, {total(vista.reduce((s, a) => s + Math.max(0, (a.fin ?? ahora) - a.inicio), 0))} en total.</>
          : <>En los últimos {dias} días, {todasLasPersonas.length} {todasLasPersonas.length === 1 ? 'persona usó' : 'personas usaron'} el laboratorio {actividades.length} {actividades.length === 1 ? 'vez' : 'veces'}.</>}
      </p>
      {revisar.length > 0 && (
        <Seccion titulo="Para revisar">
          <Tabla
            plantilla="grid-cols-[minmax(0,1fr)_140px_minmax(0,1.6fr)_60px_110px_70px]"
            columnas={[{ titulo: 'Persona' }, { titulo: 'Motivo' }, { titulo: 'Lo que se vio' }, { titulo: 'Veces', derecha: true }, { titulo: 'Última', derecha: true }, { titulo: '' }]}
            claves={pagRevisar.filas.map((x) => x.id)}
            filas={pagRevisar.filas.map((x) => [
              <span className="block truncate font-semibold text-ui-tinta" title={x.nombre}>{x.nombre}</span>,
              <span>{TEXTO_MOTIVO[x.motivo]}</span>,
              <span className="flex min-w-0 flex-col">{x.lineas.map((l) => <span key={l} className="block truncate" title={l}>{l}</span>)}</span>,
              <Num>{x.veces}</Num>,
              <Num>{fechaCorta(x.ultima)}</Num>,
              <span className="flex justify-end"><Boton onClick={() => { setElegido(x.persona); setLugar(x.lugar); }}>Ver</Boton></span>,
            ])}
            pie={revisar.length > POR_PAGINA_REVISAR && <Paginador pagina={pagRevisar} onPagina={setPaginaRevisar} unidad="avisos" />}
          />
        </Seccion>
      )}

      <div className={`grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] ${ALTO}`}>
        <MapaActividad puntos={puntos} marcado={lugar} onMarcar={(id) => setLugar((l) => (l === id ? null : id))} vacio="Sin ubicación en el período." />
        <div className={`${TARJETA} flex min-h-0 flex-col`}>
          <div className="flex items-center justify-between gap-2 border-b border-ui-borde px-5 py-2.5">
            <h3 className={ETIQUETA}>Personas</h3>
            {(elegido || lugar) && <Boton onClick={() => { setElegido(null); setLugar(null); }}>Ver a todas</Boton>}
          </div>
          <div className="px-4 py-3"><Buscador icono={Search} valor={busqueda} onCambio={setBusqueda} placeholder="Buscar persona" ancho="w-full" /></div>
          <ul className="m-0 flex-1 list-none overflow-auto p-0">
            {pagPersonas.filas.map((p, i) => (
              <li key={p.persona} className={i ? 'border-t border-ui-pista' : ''}>
                <button type="button" onClick={() => setElegido(elegido === p.persona ? null : p.persona)} aria-pressed={elegido === p.persona}
                  className="flex w-full flex-col gap-0.5 px-5 py-2.5 text-left hover:bg-ui-hover aria-pressed:bg-[color-mix(in_srgb,var(--accent-primary)_8%,transparent)]">
                  <span className="truncate text-[13px] font-semibold text-ui-tinta">{p.nombre}</span>
                  <span className={NOTA}>{p.veces} {p.veces === 1 ? 'vez' : 'veces'}, {total(p.ms)} en total, la última el {fechaCorta(p.ultima)}</span>
                </button>
              </li>
            ))}
            {!lista.length && <li className="px-5 py-3 text-[13px] text-ui-tinta-2">Nadie coincide con «{busqueda.trim()}».</li>}
          </ul>
          {lista.length > POR_PAGINA_PERSONAS && <Paginador pagina={pagPersonas} onPagina={setPaginaPersonas} unidad="personas" />}
        </div>
      </div>
      <Leyenda lugares />

      {elegido || lugar ? (
        <Seccion titulo={elegido && lugar ? `${elegidoNombre} desde ${lugar}` : elegido ? `Historial de ${elegidoNombre}` : `Conexiones desde ${lugar}`}
          derecha={lugar && <Boton onClick={() => setLugar(null)}>Quitar el lugar</Boton>}>
          <TablaConexiones filas={pagHistorial.filas} conQuien={!elegido} ahora={ahora}
            pie={<Paginador pagina={pagHistorial} onPagina={setPaginaHistorial} unidad="registros" />} />
        </Seccion>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <PorDia actividades={vista} dias={dias} ahora={ahora} filtro={filtro} />
          <CuandoSeUsa actividades={vista} />
        </div>
      )}
    </>
  );
}

// ── Piezas ────────────────────────────────────────────────────────────────────

/** Cada conexión con lo necesario para entender de dónde vino: IP, operador de la red y cómo se ubicó. */
function TablaConexiones({ filas, conQuien, ahora, pie }: { filas: Actividad[]; conQuien: boolean; ahora: number; pie: React.ReactNode }) {
  return (
    <Tabla
      plantilla={conQuien
        ? 'grid-cols-[110px_minmax(0,1fr)_minmax(0,1.2fr)_90px_minmax(0,1fr)_minmax(0,1.2fr)]'
        : 'grid-cols-[110px_minmax(0,1.2fr)_90px_minmax(0,1fr)_minmax(0,1.2fr)]'}
      columnas={[
        { titulo: 'Cuándo' }, ...(conQuien ? [{ titulo: 'Quién' }] : []), { titulo: 'Qué' }, { titulo: 'Duración', derecha: true },
        { titulo: 'IP y operador' }, { titulo: 'Ubicación' },
      ]}
      claves={filas.map((a) => a.id)}
      filas={filas.map((a) => [
        <Num>{fechaCorta(a.inicio)}</Num>,
        ...(conQuien ? [<span className="block truncate text-ui-tinta" title={a.nombre}>{a.nombre}</span>] : []),
        <span className="flex min-w-0 items-start gap-2"><Marca tipo={a.tipo} /><span className="block truncate" title={a.detalle}>{a.detalle}</span></span>,
        a.fin === null ? <span className="text-ui-bien-texto">en curso</span> : <Num>{lapso((a.fin ?? ahora) - a.inicio)}</Num>,
        <span className="flex min-w-0 flex-col">
          <span className="block truncate font-ui-num text-[12px] text-ui-tinta">{a.ip ?? 'Sin IP'}</span>
          {a.operador && <span className="block truncate text-[11px] text-ui-apagado" title={a.operador}>{nombreOperador(a.operador)}</span>}
        </span>,
        <span className="flex min-w-0 flex-col">
          <span className="block truncate">{a.lugar}</span>
          <span className={`block truncate text-[11px] ${a.dudosa ? 'text-ui-alerta-texto' : 'text-ui-apagado'}`}
            title={a.dudosa ? `El equipo dijo ${a.lugarEquipo}` : undefined}>
            {a.dudosa ? `Dudosa: el equipo dijo ${a.lugarEquipo}`
              : a.ubicadoPor === 'equipo' ? `Por el equipo${a.precisionM ? `, ±${Math.max(a.precisionM, 110)} m` : ''}`
              : a.ubicadoPor === 'ip' ? 'Por la IP (ciudad)' : ''}
          </span>
        </span>,
      ])}
      pie={pie}
    />
  );
}

/** La marca de cada tipo, igual que en el mapa: círculo relleno = práctica, contorno = SSH, cuadrado = app. */
const MARCA: Record<Tipo, string> = {
  practica: 'rounded-full bg-ui-acento-texto',
  ssh: 'rounded-full bg-ui-superficie ring-2 ring-inset ring-ui-acento-texto',
  app: 'rounded-[2px] border-2 border-ui-acento-texto bg-[color-mix(in_srgb,var(--accent-primary)_40%,transparent)]',
};
/** En las barras: práctica en el acento, SSH en el acento suave y la app en gris. */
const BARRA: Record<Tipo, string> = {
  practica: 'bg-ui-acento-texto',
  ssh: 'bg-[color-mix(in_srgb,var(--accent-primary)_35%,transparent)]',
  app: 'bg-ui-tinta-2',
};

function Marca({ tipo }: { tipo: Tipo }) {
  return <span aria-label={TEXTO_TIPO[tipo]} className={`mt-1 h-2.5 w-2.5 shrink-0 ${MARCA[tipo]}`} />;
}

function Leyenda({ lugares: deLugares }: { lugares?: boolean }) {
  return (
    <div className="-mt-3 flex flex-wrap gap-5 text-[12px] text-ui-tinta-2">
      {deLugares
        ? <span>El tamaño del círculo es cuántas veces se conectaron desde ese lugar.</span>
        : (Object.keys(TEXTO_TIPO) as Tipo[]).map((t) => <span key={t} className="flex items-center gap-2"><Marca tipo={t} />{TEXTO_TIPO[t]}</span>)}
    </div>
  );
}

function PorDia({ actividades, dias, ahora, filtro }: { actividades: Actividad[]; dias: number; ahora: number; filtro: Filtro }) {
  const tipos: Tipo[] = filtro === 'todo' ? ['practica', 'ssh', 'app'] : [filtro];
  const filas = porDia(actividades, dias, ahora);
  const max = Math.max(1, ...filas.map((f) => f.total));
  return (
    <Seccion titulo="Por día" derecha={tipos.length > 1 && (
      <span className="flex gap-4 text-[12px] text-ui-tinta-2">
        {tipos.map((t) => <span key={t} className="flex items-center gap-1.5"><i className={`block h-2.5 w-2.5 rounded-sm ${BARRA[t]}`} />{TEXTO_TIPO[t]}</span>)}
      </span>
    )}>
      <div className={`${TARJETA} flex flex-col gap-2 px-5 pb-3 pt-5`}>
        <div className="flex h-[140px] items-end gap-[3px]" role="img"
          aria-label={`Actividad por día en los últimos ${dias} días, ${filas.reduce((s, f) => s + f.total, 0)} en total`}>
          {filas.map((f) => (
            <div key={f.dia.getTime()} className="flex h-full flex-1 flex-col-reverse" title={`${diaCorto(f.dia)}: ${f.total}`}>
              {f.total === 0 && <i className="block h-px bg-ui-pista" />}
              {tipos.map((t) => f.por[t] > 0 && <i key={t} className={`block ${BARRA[t]}`} style={{ height: `${(f.por[t] / max) * 100}%` }} />)}
            </div>
          ))}
        </div>
        <div className="flex justify-between border-t border-ui-pista pt-2">
          <span className={NOTA}>{diaCorto(filas[0].dia)}</span>
          <span className={NOTA}>hoy</span>
        </div>
      </div>
    </Seccion>
  );
}

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function CuandoSeUsa({ actividades }: { actividades: Actividad[] }) {
  const celdas = cuandoSeUsa(actividades);
  const max = Math.max(1, ...celdas.flat());
  return (
    <Seccion titulo="Cuándo se usa">
      <div className={`${TARJETA} flex flex-col gap-1 px-5 pb-3 pt-5`} role="img" aria-label="Cuántas veces empezó algo en cada día de la semana y hora">
        {celdas.map((fila, i) => (
          <div key={i} className="grid grid-cols-[32px_repeat(24,minmax(0,1fr))] items-center gap-[2px]">
            <span className={NOTA}>{DIAS_SEMANA[i]}</span>
            {fila.map((v, h) => (
              <i key={h} title={`${DIAS_SEMANA[i]} ${h}:00, ${v}`} className="block h-[14px] rounded-[2px]"
                style={{ background: v ? `color-mix(in srgb, var(--accent-primary) ${15 + 85 * (v / max)}%, transparent)` : 'var(--border-subtle)' }} />
            ))}
          </div>
        ))}
        <div className="grid grid-cols-[32px_repeat(24,minmax(0,1fr))] gap-[2px] pt-1">
          <span />
          {Array.from({ length: 24 }, (_, h) => <span key={h} className={`${NOTA} text-center`}>{h % 6 === 0 ? `${h}h` : ''}</span>)}
        </div>
      </div>
    </Seccion>
  );
}
