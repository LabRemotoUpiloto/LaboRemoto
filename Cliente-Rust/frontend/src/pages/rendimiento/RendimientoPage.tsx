// pages/rendimiento/RendimientoPage.tsx — Rendimiento de la Pi4 (solo admin_lab).
//
// Para mirar en vivo una prueba con estudiantes reales: cuántos hay conectados, CPU, RAM,
// temperatura, red, cámaras y qué tan rápido responde la API. «Iniciar prueba» marca el
// comienzo; al terminar se ve el resumen (picos y con cuántos estudiantes algo llegó a
// crítico) y se puede guardar en CSV. Los datos salen de metrics_svc.py en la Pi.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Group, Loader, Paper, ScrollArea, SegmentedControl, SimpleGrid, Table, Tabs, Text, Title } from '@mantine/core';
import { Activity, AlertTriangle, CheckCircle2, Cpu, Download, LineChart, Octagon, Play, ScrollText, Square } from 'lucide-react';
import { rendimientoPi, type InformePi, type MuestraPi } from '../../services/rendimiento.service';
import { iniciarPrueba, terminarPrueba, usePrueba } from '../../services/pruebaRendimiento';
import RegistrosPanel from './RegistrosPanel';
import { guardarExcelDePrueba } from './exportarPrueba';
import {
  INDICADORES, estadoDe, estudiantesEn, resumirPrueba, unirMuestras,
  type Estado, type Indicador, type ResumenPrueba,
} from './rendimientoStats';

const SONDEO_MS = 2000;

type Pestana = 'estado' | 'graficas' | 'registros' | 'procesos';
const CLAVE_PESTANA = 'labo:rendimiento:pestana';
const NOMBRE_SERVICIO: Record<string, string> = {
  ssh: 'Terminales y apps (SSH)',
  api: 'API de prácticas',
  camaras: 'Cámaras en vivo (MediaMTX)',
  shinobi: 'Grabación de cámaras (Shinobi)',
};
const VENTANAS = [
  { value: '300', label: '5 min' },
  { value: '900', label: '15 min' },
  { value: '1800', label: '30 min' },
  { value: 'prueba', label: 'Prueba' },
];

// Serie: azul de la paleta validada (claro / oscuro). El acento del tema puede ser rojo y
// se confundiría con «crítico».
const SERIE = 'stroke-[#2a78d6] [[data-mantine-color-scheme=dark]_&]:stroke-[#3987e5]';
const AREA = 'fill-[#2a78d6] opacity-[0.08] [[data-mantine-color-scheme=dark]_&]:fill-[#3987e5] [[data-mantine-color-scheme=dark]_&]:opacity-[0.14]';
const TEXTO_EJE = 'fill-[var(--text-muted)] text-[10px]';

const ESTILO_ESTADO: Record<Estado, { clase: string; texto: string; icono: React.ReactNode }> = {
  bueno: { clase: 'text-[#0ca30c]', texto: 'Bien', icono: <CheckCircle2 size={13} /> },
  alerta: { clase: 'text-[#b07700] [[data-mantine-color-scheme=dark]_&]:text-[#fab219]', texto: 'Alerta', icono: <AlertTriangle size={13} /> },
  critico: { clase: 'text-[#d03b3b]', texto: 'Crítico', icono: <Octagon size={13} /> },
};

const hora = (t: number) => new Date(t * 1000).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const formato = (v: number | null | undefined, unidad: string) => {
  if (v == null) return '—';
  const dec = unidad === 'Mbps' ? 1 : unidad === '%' && v < 1 && v > 0 ? 2 : 0;
  return `${v.toFixed(dec)}${unidad === '%' || unidad === '°C' ? '' : ' '}${unidad}`;
};

/** Qué mide cada tarjeta, en palabras de cualquiera. */
const QUE_MIDE: Record<string, string> = {
  cpu: 'Qué tan ocupado está el procesador',
  ram: 'Memoria de la Pi en uso',
  temperatura: 'Calor del procesador',
  subida: 'Datos que envía la Pi: video y cámaras',
  latencia: 'Lo que tarda en responder (el 5 % más lento)',
  errores: 'Pedidos de los estudiantes que fallaron',
};

const FONDO_ESTADO: Record<Estado, string> = {
  bueno: 'bg-[#0ca30c]/10',
  alerta: 'bg-[#fab219]/15',
  critico: 'bg-[#d03b3b]/10',
};

/** Estado en «píldora»: color de fondo + ícono + palabra, nunca solo color. */
function PildoraEstado({ estado }: { estado: Estado | null }) {
  if (!estado) return <span className="inline-flex rounded-full bg-[var(--background-tertiary)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">Sin dato</span>;
  const e = ESTILO_ESTADO[estado];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${FONDO_ESTADO[estado]} ${e.clase}`}>{e.icono}{e.texto}</span>;
}

function Tarjeta({ titulo, valor, estado, explicacion, detalle }: {
  titulo: string; valor: string; estado?: Estado | null; explicacion?: string; detalle?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--background-secondary)] p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--text-primary)]">{titulo}</span>
        {estado !== undefined && <PildoraEstado estado={estado} />}
      </div>
      <span className="text-[30px] font-semibold leading-tight text-[var(--text-primary)]">{valor}</span>
      {explicacion && <span className="text-xs text-[var(--text-secondary)]">{explicacion}</span>}
      {detalle && <span className="text-xs text-[var(--text-muted)]">{detalle}</span>}
    </div>
  );
}

/** Título de sección dentro de una pestaña, con una línea que dice para qué sirve. */
function Seccion({ titulo, ayuda, derecha, children }: { titulo: string; ayuda?: string; derecha?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="m-0 text-base font-semibold text-[var(--text-primary)]">{titulo}</h3>
          {ayuda && <p className="m-0 text-sm text-[var(--text-secondary)]">{ayuda}</p>}
        </div>
        {derecha}
      </div>
      {children}
    </section>
  );
}

/** Serie de tiempo de una métrica, con sus umbrales y la cruz compartida entre gráficas. */
function SerieTiempo({
  titulo, muestras, valor, unidad, techo, piso = 0, relleno = true, umbrales, desde, hasta, cursor, onCursor,
}: {
  titulo: string;
  muestras: MuestraPi[];
  valor: (m: MuestraPi) => number | null;
  unidad: string;
  techo: number;
  /** Inicio del eje: la temperatura no se lee contra 0 °C, así que arranca más arriba. */
  piso?: number;
  /** Relleno bajo la línea: solo cuando el cero tiene sentido (cantidades), no en niveles como RAM o temperatura. */
  relleno?: boolean;
  umbrales?: { alerta: number; critico: number };
  desde: number;
  hasta: number;
  cursor: number | null;
  onCursor: (t: number | null) => void;
}) {
  const ancho = 520, alto = 130, izq = 34, der = 8, arriba = 8, abajo = 18;
  const maxDato = Math.max(piso, ...muestras.map((m) => valor(m) ?? piso));
  const minDato = Math.min(piso, ...muestras.map((m) => valor(m) ?? piso));
  const base0 = Math.min(piso, Math.floor(minDato));
  const tope = Math.max(techo, maxDato * 1.1);
  const rango = Math.max(tope - base0, 1);
  const x = (t: number) => izq + ((t - desde) / Math.max(hasta - desde, 1)) * (ancho - izq - der);
  const y = (v: number) => arriba + (1 - (v - base0) / rango) * (alto - arriba - abajo);

  // Línea cortada donde falta el dato (no se inventa la unión).
  const tramos: string[] = [];
  let actual = '';
  for (const m of muestras) {
    const v = valor(m);
    if (v == null) { if (actual) tramos.push(actual); actual = ''; continue; }
    actual += `${actual ? 'L' : 'M'}${x(m.t).toFixed(1)},${y(v).toFixed(1)}`;
  }
  if (actual) tramos.push(actual);
  const linea = tramos.join(' ');
  const base = y(base0);
  const area = tramos.map((d) => {
    const pts = d.slice(1).split(/L/);
    const primero = pts[0].split(',')[0], ultimo = pts[pts.length - 1].split(',')[0];
    return `${d} L${ultimo},${base} L${primero},${base} Z`;
  }).join(' ');

  const enCursor = cursor == null ? null : muestras.reduce<MuestraPi | null>((mejor, m) =>
    !mejor || Math.abs(m.t - cursor) < Math.abs(mejor.t - cursor) ? m : mejor, null);
  const valorCursor = enCursor ? valor(enCursor) : null;
  const ultimo = muestras.length ? valor(muestras[muestras.length - 1]) : null;

  const mover = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * ancho;
    if (px < izq) return onCursor(null);
    onCursor(desde + ((px - izq) / (ancho - izq - der)) * (hasta - desde));
  };

  return (
    <Paper withBorder radius="md" p="sm">
      <Group justify="space-between" mb={4} wrap="nowrap">
        <Text fz="sm" fw={600}>{titulo}</Text>
        <Text fz="xs" c="dimmed" className="tabular-nums">
          {enCursor ? `${hora(enCursor.t)} · ${formato(valorCursor, unidad)} · ${estudiantesEn(enCursor) ?? '—'} estudiantes` : `Ahora: ${formato(ultimo, unidad)}`}
        </Text>
      </Group>
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="block h-auto w-full" onMouseMove={mover} onMouseLeave={() => onCursor(null)} role="img" aria-label={`${titulo} en el tiempo`}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const v = base0 + rango * f;
          return (
            <g key={f}>
              <line x1={izq} x2={ancho - der} y1={y(v)} y2={y(v)} className="stroke-[var(--border-subtle)]" strokeWidth={1} />
              {f % 0.5 === 0 && <text x={izq - 4} y={y(v) + 3} textAnchor="end" className={TEXTO_EJE}>{Math.round(v)}</text>}
            </g>
          );
        })}
        {umbrales && umbrales.alerta < tope && (
          <line x1={izq} x2={ancho - der} y1={y(umbrales.alerta)} y2={y(umbrales.alerta)} className="stroke-[#fab219]" strokeDasharray="4 3" strokeWidth={1} />
        )}
        {umbrales && umbrales.critico < tope && (
          <line x1={izq} x2={ancho - der} y1={y(umbrales.critico)} y2={y(umbrales.critico)} className="stroke-[#d03b3b]" strokeDasharray="4 3" strokeWidth={1} />
        )}
        {relleno && area && <path d={area} className={AREA} />}
        {linea && <path d={linea} className={SERIE} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        <text x={izq} y={alto - 4} className={TEXTO_EJE}>{hora(desde)}</text>
        <text x={ancho - der} y={alto - 4} textAnchor="end" className={TEXTO_EJE}>{hora(hasta)}</text>
        {enCursor && (
          <g>
            <line x1={x(enCursor.t)} x2={x(enCursor.t)} y1={arriba} y2={alto - abajo} className="stroke-[var(--text-muted)]" strokeWidth={1} />
            {valorCursor != null && <circle cx={x(enCursor.t)} cy={y(valorCursor)} r={4} className={`${SERIE} fill-[var(--background-primary)]`} strokeWidth={2} />}
          </g>
        )}
        {!linea && <text x={ancho / 2} y={alto / 2} textAnchor="middle" className={TEXTO_EJE}>Sin datos todavía</text>}
      </svg>
    </Paper>
  );
}

function ResumenDePrueba({ resumen, onGuardar }: { resumen: ResumenPrueba; onGuardar: () => void }) {
  const minutos = Math.max(1, Math.round((resumen.fin - resumen.inicio) / 60));
  const q = resumen.quiebre;
  return (
    <Paper withBorder radius="md" p="md">
      <Group justify="space-between" mb="sm">
        <div>
          <Text fw={600}>Resumen de la prueba</Text>
          <Text fz="xs" c="dimmed">{hora(resumen.inicio)} – {hora(resumen.fin)} · {minutos} min · hasta {resumen.maxEstudiantes} estudiantes y {resumen.maxCamaras} espectadores de cámaras</Text>
        </div>
        <Button size="xs" variant="default" leftSection={<Download size={14} />} onClick={onGuardar}>Guardar Excel</Button>
      </Group>
      {q ? (
        <Alert color="red" variant="light" icon={<Octagon size={16} />} mb="sm" title={`Se degradó con ${q.estudiantes ?? '?'} estudiantes`}>
          A las {hora(q.t)} {q.indicador.titulo.toLowerCase()} llegó a {formato(q.valor, q.indicador.unidad)} (crítico desde {formato(q.indicador.critico, q.indicador.unidad)}).
        </Alert>
      ) : (
        <Alert color="green" variant="light" icon={<CheckCircle2 size={16} />} mb="sm" title="Nada llegó a crítico">
          {resumen.primeraAlerta
            ? `La primera alerta fue ${resumen.primeraAlerta.indicador.titulo.toLowerCase()} a las ${hora(resumen.primeraAlerta.t)}, con ${resumen.primeraAlerta.estudiantes ?? '?'} estudiantes.`
            : `Con ${resumen.maxEstudiantes} estudiantes todo se mantuvo en verde.`}
        </Alert>
      )}
      {resumen.huboFrenado && (
        <Alert color="orange" variant="light" icon={<AlertTriangle size={16} />} mb="sm" title="La Pi bajó su velocidad">
          En algún momento se frenó por calor o por voltaje bajo: los resultados de ese tramo no reflejan su capacidad normal.
        </Alert>
      )}
      <Table className="[&_td]:tabular-nums" verticalSpacing={4}>
        <Table.Thead>
          <Table.Tr><Table.Th>Métrica</Table.Th><Table.Th>Pico</Table.Th><Table.Th>Hora</Table.Th><Table.Th>Estudiantes en ese momento</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {resumen.picos.map((p) => (
            <Table.Tr key={p.indicador.id}>
              <Table.Td>{p.indicador.titulo}</Table.Td>
              <Table.Td><Group gap={8}>{formato(p.valor, p.indicador.unidad)} <PildoraEstado estado={estadoDe(p.indicador, p.valor)} /></Group></Table.Td>
              <Table.Td>{hora(p.t)}</Table.Td>
              <Table.Td>{p.estudiantes ?? '—'}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Text fz="xs" c="dimmed" mt="xs">{resumen.peticiones} peticiones a la API, {resumen.errores} con error.</Text>
    </Paper>
  );
}

const RendimientoPage: React.FC = () => {
  const [informe, setInforme] = useState<Omit<InformePi, 'muestras'> | null>(null);
  const [muestras, setMuestras] = useState<MuestraPi[]>([]);
  const [error, setError] = useState<string | null>(null);
  // La prueba vive en el equipo (pruebaRendimiento.ts): sobrevive a cambiar de sección o cerrar la app.
  const prueba = usePrueba();
  const [ventana, setVentana] = useState(() => (prueba && prueba.fin == null ? 'prueba' : '900'));
  const [cursor, setCursor] = useState<number | null>(null);
  // La pestaña elegida se recuerda en el equipo (comodidad: si no hay almacenamiento, abre Estado).
  const [pestana, setPestana] = useState<Pestana>(() => {
    try {
      const v = localStorage.getItem(CLAVE_PESTANA);
      return v === 'graficas' || v === 'registros' || v === 'procesos' ? v : 'estado';
    } catch { return 'estado'; }
  });
  const elegirPestana = (v: Pestana) => {
    setPestana(v);
    try { localStorage.setItem(CLAVE_PESTANA, v); } catch { /* sin almacenamiento: no pasa nada */ }
  };
  const ultimoRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    let enVuelo = false;
    const pedir = async () => {
      if (enVuelo) return;
      enVuelo = true;
      try {
        const r = await rendimientoPi(ultimoRef.current);
        if (!vivo) return;
        const { muestras: nuevas, ...resto } = r;
        setInforme(resto);
        if (nuevas.length) {
          ultimoRef.current = nuevas[nuevas.length - 1].t;
          setMuestras((prev) => unirMuestras(prev, nuevas));
        }
        setError(null);
      } catch (e: any) {
        if (vivo) setError(e?.message ?? String(e));
      } finally {
        enVuelo = false;
      }
    };
    pedir();
    const id = window.setInterval(pedir, SONDEO_MS);
    return () => { vivo = false; window.clearInterval(id); };
  }, []);

  const ultima = muestras.length ? muestras[muestras.length - 1] : null;
  // Lo grabado en segundo plano más lo que esta página acaba de recibir (lo más fresco).
  const muestrasPrueba = useMemo(() => {
    if (!prueba) return [];
    const enTramo = muestras.filter((m) => m.t >= prueba.inicio && (prueba.fin == null || m.t <= prueba.fin));
    return unirMuestras(prueba.muestras, enTramo, Number.MAX_SAFE_INTEGER);
  }, [muestras, prueba]);
  const resumen = useMemo(() => (prueba?.fin ? resumirPrueba(muestrasPrueba) : null), [prueba, muestrasPrueba]);

  const hasta = prueba?.fin && ventana === 'prueba' ? prueba.fin : (ultima?.t ?? Date.now() / 1000);
  const desde = ventana === 'prueba' && prueba ? prueba.inicio : hasta - Number(ventana);
  const visibles = useMemo(
    () => (ventana === 'prueba' ? muestrasPrueba : muestras.filter((m) => m.t >= desde && m.t <= hasta)),
    [ventana, muestrasPrueba, muestras, desde, hasta],
  );

  const guardarExcel = async () => {
    if (!resumen) return;
    try {
      await guardarExcelDePrueba(muestrasPrueba, resumen);
    } catch (e: any) {
      setError(`No se pudo guardar el Excel: ${e?.message ?? String(e)}`);
    }
  };

  const ind = (id: string) => INDICADORES.find((i) => i.id === id) as Indicador;
  const tarjeta = (id: string, detalle?: string) => {
    const i = ind(id);
    const v = ultima ? i.valor(ultima) : null;
    return <Tarjeta key={id} titulo={i.titulo} valor={formato(v, i.unidad)} estado={estadoDe(i, v)} explicacion={QUE_MIDE[id]} detalle={detalle} />;
  };
  const frenadoAhora = ultima?.frenado && (ultima.frenado.frenada || ultima.frenado.bajo_voltaje || ultima.frenado.frecuencia_limitada);
  const series: { id: string; titulo: string; valor: (m: MuestraPi) => number | null; unidad: string; techo: number; piso?: number; relleno?: boolean; umbral?: Indicador }[] = [
    { id: 'estudiantes', titulo: 'Estudiantes conectados', valor: estudiantesEn, unidad: '', techo: 30 },
    { id: 'cpu', titulo: 'CPU', valor: ind('cpu').valor, unidad: '%', techo: 100, umbral: ind('cpu') },
    { id: 'ram', titulo: 'RAM', valor: ind('ram').valor, unidad: '%', techo: 100, relleno: false, umbral: ind('ram') },
    { id: 'temperatura', titulo: 'Temperatura', valor: ind('temperatura').valor, unidad: '°C', techo: 90, piso: 30, relleno: false, umbral: ind('temperatura') },
    { id: 'subida', titulo: 'Red de subida', valor: ind('subida').valor, unidad: 'Mbps', techo: 25, umbral: ind('subida') },
    { id: 'latencia', titulo: 'Respuesta de la API (p95)', valor: ind('latencia').valor, unidad: 'ms', techo: 1500, umbral: ind('latencia') },
  ];

  // Estado general en una frase: lo peor de todas las medidas de la última muestra.
  const enProblema = ultima
    ? INDICADORES.map((i) => ({ i, e: estadoDe(i, i.valor(ultima)) })).filter((x) => x.e === 'alerta' || x.e === 'critico')
    : [];
  const peor: Estado | null = !ultima ? null : enProblema.some((x) => x.e === 'critico') || frenadoAhora ? 'critico' : enProblema.length ? 'alerta' : 'bueno';
  const fraseEstado = !ultima
    ? (error ? 'No se pudo leer la Pi' : 'Conectando con la Pi…')
    : peor === 'bueno'
      ? 'La Pi está bien'
      : `${peor === 'critico' ? 'Crítico' : 'Atención'}: ${frenadoAhora ? 'se está frenando por calor o voltaje' : enProblema.map((x) => x.i.titulo.toLowerCase()).join(', ')}`;
  const pruebaEnCurso = !!prueba && prueba.fin == null;

  const PESTANAS: { value: Pestana; label: string; icono: React.ReactNode }[] = [
    { value: 'estado', label: 'Estado', icono: <Activity size={15} /> },
    { value: 'graficas', label: 'Gráficas', icono: <LineChart size={15} /> },
    { value: 'registros', label: 'Registros', icono: <ScrollText size={15} /> },
    { value: 'procesos', label: 'Procesos', icono: <Cpu size={15} /> },
  ];

  return (
    // La página vive en un contenedor de alto fijo: arriba lo fijo (título, estado, pestañas) y
    // abajo el contenido de la pestaña con su propio scroll, con la barra siempre visible.
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-[var(--border-subtle)] bg-[var(--background-primary)]">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 px-6 pt-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <Title order={3}>Rendimiento de la Pi4</Title>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className={`inline-flex items-center gap-1.5 font-semibold ${peor ? ESTILO_ESTADO[peor].clase : 'text-[var(--text-secondary)]'}`}>
                  {peor ? ESTILO_ESTADO[peor].icono : <Loader size={12} />}{fraseEstado}
                </span>
                {ultima && (
                  <span className="text-[var(--text-secondary)]">
                    · {estudiantesEn(ultima) ?? 0} estudiantes conectados · actualizado {hora(ultima.t)}
                  </span>
                )}
              </div>
            </div>
            {pruebaEnCurso ? (
              <Button color="red" leftSection={<Square size={14} />} onClick={() => terminarPrueba(ultima?.t ?? Date.now() / 1000)}>
                Terminar prueba
              </Button>
            ) : (
              <Button leftSection={<Play size={14} />} disabled={!ultima} onClick={() => { iniciarPrueba(ultima!.t, muestras); setVentana('prueba'); }}>
                Iniciar prueba
              </Button>
            )}
          </div>

          {pruebaEnCurso && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[#d03b3b]/10 px-3 py-2 text-sm">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#d03b3b]" aria-hidden />
              <span className="font-semibold text-[var(--text-primary)]">Prueba en curso desde {hora(prueba!.inicio)}</span>
              <span className="text-[var(--text-secondary)]">· se sigue grabando aunque cambies de sección o cierres la app. Pulsa «Terminar prueba» al final.</span>
            </div>
          )}
          {error && ultima && (
            <Alert color="red" variant="light" icon={<AlertTriangle size={16} />} py={6}>
              No se pudo leer la Pi: {error}. Se muestran los últimos datos recibidos.
            </Alert>
          )}

          <Tabs value={pestana} onChange={(v) => v && elegirPestana(v as Pestana)}>
            <Tabs.List className="border-b-0">
              {PESTANAS.map((p) => (
                <Tabs.Tab key={p.value} value={p.value} leftSection={p.icono}>
                  {p.label}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs>
        </div>
      </header>

      <ScrollArea type="always" scrollbarSize={10} offsetScrollbars className="min-h-0 flex-1">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 py-5">
          {!ultima && (
            error
              ? <Alert color="red" variant="light" icon={<AlertTriangle size={16} />} title="No se pudo leer la Pi">{error}</Alert>
              : <Group gap="xs"><Loader size="sm" /><Text fz="sm" c="dimmed">Conectando con la Pi…</Text></Group>
          )}

          {/* ESTADO */}
          <div className={pestana === 'estado' ? 'flex flex-col gap-6' : 'hidden'}>
            {frenadoAhora && (
              <Alert color="red" variant="light" icon={<Octagon size={16} />} title="La Pi está bajando su velocidad">
                {ultima!.frenado!.bajo_voltaje ? 'Le llega voltaje bajo (revisar la fuente). ' : ''}
                {ultima!.frenado!.frenada || ultima!.frenado!.limite_temperatura ? 'Está caliente y se frena para protegerse. ' : ''}
                Lo que se mida ahora no refleja su capacidad normal.
              </Alert>
            )}
            {prueba?.fin && resumen && <ResumenDePrueba resumen={resumen} onGuardar={guardarExcel} />}

            {ultima && (
              <Seccion titulo="Ahora mismo" ayuda="Cómo está la Pi en este momento. Cada medida dice si está bien, en alerta o en crítico.">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="flex flex-col justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--background-secondary)] p-4 sm:col-span-2 lg:row-span-2">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">Estudiantes conectados</span>
                    <span className="text-[64px] font-semibold leading-none text-[var(--text-primary)]">{estudiantesEn(ultima) ?? '—'}</span>
                    <div className="grid grid-cols-3 gap-2 border-t border-[var(--border-subtle)] pt-3 text-xs text-[var(--text-secondary)]">
                      <div><div className="text-lg font-semibold text-[var(--text-primary)]">{ultima.sesiones_ssh?.estudiantes ?? '—'}</div>con la terminal abierta</div>
                      <div><div className="text-lg font-semibold text-[var(--text-primary)]">{ultima.sesiones_ssh?.tuneles_app ?? '—'}</div>apps conectadas</div>
                      <div><div className="text-lg font-semibold text-[var(--text-primary)]">{ultima.camaras?.total ?? '—'}</div>viendo cámaras*</div>
                    </div>
                    <span className="text-[11px] text-[var(--text-muted)]">* Incluye las grabaciones de Shinobi (unas 4) aunque nadie las esté viendo.</span>
                  </div>
                  {tarjeta('cpu', ultima.carga ? `Carga del sistema: ${ultima.carga[0].toFixed(2)}` : undefined)}
                  {tarjeta('ram', ultima.memoria ? `${ultima.memoria.usada_mb.toLocaleString('es-CO')} de ${ultima.memoria.total_mb.toLocaleString('es-CO')} MB` : undefined)}
                  {tarjeta('temperatura')}
                  {tarjeta('subida', ultima.red_rx_kbps != null ? `Recibe ${(ultima.red_rx_kbps / 1000).toFixed(1)} Mbps` : undefined)}
                  {tarjeta('latencia', `${ultima.api.peticiones} pedidos en los últimos 2 s`)}
                  {tarjeta('errores', `${ultima.api.en_curso} pedidos en curso`)}
                </div>
              </Seccion>
            )}

            {!pruebaEnCurso && (
              <Seccion titulo="¿Cómo hacer una prueba?" ayuda="Sirve para saber con cuántos estudiantes la Pi empieza a fallar.">
                <ol className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-3">
                  {[
                    ['Pulsa «Iniciar prueba»', 'Marca el comienzo. Desde ahí todo lo que pase queda grabado.'],
                    ['Que los estudiantes trabajen', 'Que entren, abran la práctica y vean las cámaras. Puedes ir mirando las pestañas Estado y Gráficas.'],
                    ['Pulsa «Terminar prueba»', 'Verás con cuántos estudiantes algo llegó a crítico, y podrás guardar todo en Excel.'],
                  ].map(([t, d], n) => (
                    <li key={t} className="flex gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--background-secondary)] p-4">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2a78d6] text-sm font-semibold text-white">{n + 1}</span>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold text-[var(--text-primary)]">{t}</span>
                        <span className="text-xs text-[var(--text-secondary)]">{d}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              </Seccion>
            )}
          </div>

          {/* GRÁFICAS */}
          <div className={pestana === 'graficas' ? 'flex flex-col gap-4' : 'hidden'}>
            <Seccion
              titulo="En el tiempo"
              ayuda="Pasa el mouse sobre una gráfica para ver la hora, el valor y cuántos estudiantes había."
              derecha={
                <SegmentedControl size="xs" value={ventana} onChange={(v) => setVentana(String(v))}
                  data={VENTANAS.map((v) => ({ ...v, disabled: v.value === 'prueba' && !prueba }))} aria-label="Ventana de tiempo" />
              }
            >
              <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-secondary)]">
                <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 rounded bg-[#2a78d6]" />Valor medido</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-[#fab219]" />Desde aquí: alerta</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-[#d03b3b]" />Desde aquí: crítico</span>
              </div>
              {ultima && (
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
                  {series.map((s) => (
                    <SerieTiempo key={s.id} titulo={s.titulo} muestras={visibles} valor={s.valor} unidad={s.unidad} techo={s.techo} piso={s.piso} relleno={s.relleno}
                      umbrales={s.umbral ? { alerta: s.umbral.alerta, critico: s.umbral.critico } : undefined}
                      desde={desde} hasta={hasta} cursor={cursor} onCursor={setCursor} />
                  ))}
                </SimpleGrid>
              )}
            </Seccion>
          </div>

          {/* REGISTROS: siempre montado para no perder lo recibido al cambiar de pestaña */}
          <div className={pestana === 'registros' ? 'flex flex-col gap-4' : 'hidden'}>
            <RegistrosPanel />
          </div>

          {/* PROCESOS */}
          <div className={pestana === 'procesos' ? 'flex flex-col gap-6' : 'hidden'}>
            <Seccion titulo="Lo que más consume ahora" ayuda="Los programas de la Pi que más procesador usan. Si aparece algo que no reconoces gastando CPU, revísalo: puede estar frenando la Pi.">
              <Paper withBorder radius="md" p={0} className="overflow-hidden">
                <Table striped verticalSpacing={6} horizontalSpacing="md" className="[&_td]:tabular-nums">
                  <Table.Thead><Table.Tr><Table.Th>Programa</Table.Th><Table.Th>Usuario</Table.Th><Table.Th>CPU</Table.Th><Table.Th>RAM</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {(informe?.procesos_top ?? []).map((p) => (
                      <Table.Tr key={`${p.comando}-${p.usuario}`}>
                        <Table.Td className="font-mono">{p.comando}{p.procesos > 1 ? ` ×${p.procesos}` : ''}</Table.Td>
                        <Table.Td>{p.usuario}</Table.Td>
                        <Table.Td>{p.cpu_pct.toFixed(1)} %</Table.Td>
                        <Table.Td>{Math.round(p.ram_mb)} MB</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Paper>
            </Seccion>
            {ultima && (
              <Seccion titulo="Conexiones abiertas por servicio" ayuda="Cuántas conexiones tiene abiertas cada servicio de la Pi en este momento.">
                <Paper withBorder radius="md" p={0} className="overflow-hidden">
                  <Table striped verticalSpacing={6} horizontalSpacing="md" className="[&_td]:tabular-nums">
                    <Table.Thead><Table.Tr><Table.Th>Servicio</Table.Th><Table.Th>Conexiones</Table.Th></Table.Tr></Table.Thead>
                    <Table.Tbody>
                      {Object.entries(ultima.conexiones ?? {}).map(([servicio, n]) => (
                        <Table.Tr key={servicio}><Table.Td>{NOMBRE_SERVICIO[servicio] ?? servicio}</Table.Td><Table.Td>{n}</Table.Td></Table.Tr>
                      ))}
                      {ultima.camaras && Object.entries(ultima.camaras.por_camara).map(([camara, n]) => (
                        <Table.Tr key={`cam-${camara}`}><Table.Td>Viendo la cámara {camara}</Table.Td><Table.Td>{n}</Table.Td></Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Paper>
                {!ultima.camaras && <Text fz="xs" c="dimmed">La API de MediaMTX no respondió: no se cuentan los espectadores de cámaras.</Text>}
              </Seccion>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

export default RendimientoPage;
