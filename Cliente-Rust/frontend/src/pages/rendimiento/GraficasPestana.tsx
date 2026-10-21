// pages/rendimiento/GraficasPestana.tsx — «Gráficas» de la Pi 4, en dos vistas:
// · Por estudiantes: cada medida contra cuántos estudiantes había (responde «¿con cuántos falla?»).
// · En el tiempo: tramos de 30 s con promedio y rango, para cualquier prueba (también de software).
// Escalas fijas (0–100 %, etc.): ajustarlas a los datos haría que un 4 % → 8 % pareciera una catástrofe.
import React, { useMemo, useState } from 'react';
import type { MuestraPi } from '../../services/rendimiento.service';
import type { PruebaRendimiento } from '../../services/pruebaRendimiento';
import { INDICADORES, estudiantesEn, type Indicador, type ResumenPrueba } from './rendimientoStats';
import { agruparPorEstudiantes, formatoValor, hora24, tramosEnElTiempo } from './monitoreo';
import { NOTA, Punto, Selector, TARJETA } from './Piezas';

type Vista = 'estudiantes' | 'tiempo';
type Ventana = '300' | '900' | '1800' | 'prueba';

interface Medida {
  id: string;
  titulo: string;
  unidad: string;
  piso: number;
  techo: number;
  valor: (m: MuestraPi) => number | null;
  umbral?: Indicador;
}

const ind = (id: string) => INDICADORES.find((i) => i.id === id)!;
const MEDIDAS: Medida[] = [
  { id: 'cpu', titulo: 'CPU', unidad: '%', piso: 0, techo: 100, valor: ind('cpu').valor, umbral: ind('cpu') },
  { id: 'ram', titulo: 'RAM', unidad: '%', piso: 0, techo: 100, valor: ind('ram').valor, umbral: ind('ram') },
  // La temperatura no se lee contra 0 °C.
  { id: 'temperatura', titulo: 'Temperatura', unidad: '°C', piso: 30, techo: 90, valor: ind('temperatura').valor, umbral: ind('temperatura') },
  { id: 'subida', titulo: 'Red de subida', unidad: 'Mbps', piso: 0, techo: 25, valor: ind('subida').valor, umbral: ind('subida') },
  { id: 'latencia', titulo: 'API (p95)', unidad: 'ms', piso: 0, techo: 1500, valor: ind('latencia').valor, umbral: ind('latencia') },
];
const ESTUDIANTES: Medida = { id: 'estudiantes', titulo: 'Estudiantes', unidad: '', piso: 0, techo: 30, valor: estudiantesEn };

const ANCHO = 1000; // unidades del viewBox; el SVG se estira al ancho disponible

/** Una fila: rótulos a la izquierda (HTML, para que el texto no se deforme) y la gráfica a la derecha. */
function Fila({ titulo, valor, techo, piso, unidad, alto, vacio, children }: {
  titulo: string; valor: React.ReactNode; techo: number; piso: number; unidad: string; alto: number;
  /** Texto en lugar de la línea cuando no hay datos en la ventana. */
  vacio?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[150px_44px_1fr] items-stretch gap-x-3 px-6 md:grid-cols-[190px_56px_1fr]">
      <div className="flex flex-col justify-center gap-1 py-2">
        <span className="text-[13px] font-semibold text-mon-tinta">{titulo}</span>
        <span className="font-mon-num text-base text-mon-tinta">{valor}</span>
      </div>
      <div className="flex flex-col justify-between py-2 text-right font-mon-num text-[10px] text-mon-apagado">
        <span>{techo}{unidad && ` ${unidad}`}</span>
        <span>{piso}</span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${ANCHO} ${alto}`} preserveAspectRatio="none" className="block h-full w-full overflow-visible py-2" style={{ height: alto + 16 }}>
          {children}
        </svg>
        {vacio && <span className="absolute inset-0 flex items-center justify-center text-xs text-mon-apagado">{vacio}</span>}
      </div>
    </div>
  );
}

/** Líneas punteadas de alerta y crítico (solo si caen dentro de la escala). */
function Umbrales({ m, Y }: { m: Medida; Y: (v: number) => number }) {
  if (!m.umbral) return null;
  return (
    <>
      {[[m.umbral.alerta, 'stroke-mon-umbral-alerta'], [m.umbral.critico, 'stroke-mon-umbral-critico']].map(([u, clase]) =>
        (u as number) < m.techo ? (
          <line key={clase as string} x1={0} x2={ANCHO} y1={Y(u as number)} y2={Y(u as number)} className={`${clase} [stroke-dasharray:4_3]`} vectorEffect="non-scaling-stroke" />
        ) : null,
      )}
    </>
  );
}

function Leyenda({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <div className="flex flex-wrap justify-end gap-x-5 gap-y-1 text-xs text-mon-tinta-2">
      {items.map(([texto, muestra]) => (
        <span key={texto} className="inline-flex items-center gap-2">{muestra}{texto}</span>
      ))}
    </div>
  );
}
const trazo = (clase: string) => <span aria-hidden className={`inline-block w-[18px] ${clase}`} />;
const LEYENDA_UMBRALES: [string, React.ReactNode][] = [
  ['alerta', trazo('border-t border-dashed border-mon-alerta')],
  ['crítico', trazo('border-t border-dashed border-mon-critico')],
];

// ── Por estudiantes ──────────────────────────────────────────────────────

function PorEstudiantes({ muestras, resumen, enCurso }: { muestras: MuestraPi[]; resumen: ResumenPrueba | null; enCurso: boolean }) {
  const maxN = Math.max(1, ...muestras.map((m) => estudiantesEn(m) ?? 0));
  const quiebre = resumen?.quiebre?.estudiantes ?? null;
  const X = (n: number) => 10 + (n / maxN) * (ANCHO - 20);
  const paso = Math.max(1, Math.ceil(maxN / 6));
  const alto = 76;

  return (
    <>
      {resumen && (
        <div className={`${TARJETA} flex flex-col gap-2 px-6 py-4`}>
          {resumen.quiebre ? (
            <Punto nivel="critico" fuerte={`Se degradó con ${resumen.quiebre.estudiantes ?? '?'} estudiantes`}
              resto={`· ${resumen.quiebre.indicador.titulo.toLowerCase()} llegó a ${formatoValor(resumen.quiebre.valor, resumen.quiebre.indicador.unidad)} (crítico desde ${formatoValor(resumen.quiebre.indicador.critico, resumen.quiebre.indicador.unidad)})`} />
          ) : (
            <Punto nivel="bien" fuerte="Nada llegó a crítico" resto={`· con hasta ${resumen.maxEstudiantes} estudiantes`} />
          )}
          {resumen.primeraAlerta && (!resumen.quiebre || resumen.primeraAlerta.t < resumen.quiebre.t) && (
            <Punto nivel="alerta" fuerte={`Primera alerta con ${resumen.primeraAlerta.estudiantes ?? '?'} estudiantes`}
              resto={`· ${resumen.primeraAlerta.indicador.titulo.toLowerCase()} pasó de ${formatoValor(resumen.primeraAlerta.indicador.alerta, resumen.primeraAlerta.indicador.unidad)}`} />
          )}
        </div>
      )}
      {enCurso && !resumen && <p className="m-0 text-[13px] text-mon-tinta-2">Prueba en curso: la gráfica se completa a medida que entran más estudiantes.</p>}

      <div className={`${TARJETA} relative divide-y divide-mon-pista`}>
        {MEDIDAS.map((m) => {
          const grupos = agruparPorEstudiantes(muestras, m.valor);
          const Y = (v: number) => alto - ((Math.min(Math.max(v, m.piso), m.techo) - m.piso) / (m.techo - m.piso)) * alto;
          const enQuiebre = quiebre != null ? grupos.find((g) => g.estudiantes === quiebre) : null;
          const d = grupos.map((g, i) => `${i ? 'L' : 'M'}${X(g.estudiantes).toFixed(1)},${Y(g.mediana).toFixed(1)}`).join(' ');
          return (
            <Fila key={m.id} titulo={m.titulo} techo={m.techo} piso={m.piso} unidad={m.unidad} alto={alto}
              valor={enQuiebre ? <span className="text-[13px] text-mon-tinta-2">con {quiebre}: {formatoValor(enQuiebre.maximo, m.unidad)}</span> : <span className="text-mon-apagado">—</span>}>
              <line x1={0} x2={ANCHO} y1={alto} y2={alto} className="stroke-mon-pista" vectorEffect="non-scaling-stroke" />
              <Umbrales m={m} Y={Y} />
              {grupos.map((g) => {
                const estado = m.umbral && g.maximo >= m.umbral.critico ? 'stroke-mon-critico' : m.umbral && g.maximo >= m.umbral.alerta ? 'stroke-mon-alerta' : 'stroke-mon-rango';
                return <line key={g.estudiantes} x1={X(g.estudiantes)} x2={X(g.estudiantes)} y1={Y(g.minimo)} y2={Math.min(Y(g.maximo), Y(g.minimo) - 1)} className={estado} strokeWidth={3} vectorEffect="non-scaling-stroke" />;
              })}
              {d && <path d={d} className="fill-none stroke-mon-tinta [stroke-linejoin:round]" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
              {quiebre != null && <line x1={X(quiebre)} x2={X(quiebre)} y1={-8} y2={alto + 8} className="stroke-mon-critico [stroke-dasharray:2_3]" vectorEffect="non-scaling-stroke" />}
            </Fila>
          );
        })}
        <div className="grid grid-cols-[150px_44px_1fr] gap-x-3 px-6 pb-3 pt-2 md:grid-cols-[190px_56px_1fr]">
          <span />
          <span />
          <div className="relative h-8 font-mon-num text-[11px] text-mon-apagado">
            {Array.from({ length: Math.floor(maxN / paso) + 1 }, (_, i) => i * paso).map((n) => (
              <span key={n} className="absolute -translate-x-1/2" style={{ left: `${(X(n) / ANCHO) * 100}%` }}>{n}</span>
            ))}
            {quiebre != null && (
              <span className="absolute bottom-0 -translate-x-1/2 rounded-sm bg-mon-critico px-1.5 font-mon-num text-[11px] text-mon-superficie" style={{ left: `${(X(quiebre) / ANCHO) * 100}%` }}>
                se degradó con {quiebre}
              </span>
            )}
          </div>
        </div>
      </div>
      <p className="m-0 text-right text-[11px] text-mon-apagado">eje horizontal: estudiantes conectados</p>
      <Leyenda items={[
        ['mediana', trazo('border-t-[1.5px] border-mon-tinta')],
        ['mínimo a máximo', <span key="r" aria-hidden className="inline-block h-3 w-[3px] bg-mon-rango" />],
        ...LEYENDA_UMBRALES,
      ]} />
    </>
  );
}

// ── En el tiempo ─────────────────────────────────────────────────────────

function EnElTiempo({ muestras, desde, hasta }: { muestras: MuestraPi[]; desde: number; hasta: number }) {
  const [cursor, setCursor] = useState<number | null>(null);
  const X = (t: number) => ((t - desde) / Math.max(hasta - desde, 1)) * ANCHO;
  const alto = 48;
  const filas = [ESTUDIANTES, ...MEDIDAS];
  const ultima = muestras.length ? muestras[muestras.length - 1] : null;
  const enCursor = cursor == null ? null : muestras.reduce<MuestraPi | null>((mejor, m) => (!mejor || Math.abs(m.t - cursor) < Math.abs(mejor.t - cursor) ? m : mejor), null);
  const marcas: number[] = [];
  const pasoMarcas = hasta - desde > 1200 ? 600 : 300;
  for (let t = Math.ceil(desde / pasoMarcas) * pasoMarcas; t <= hasta; t += pasoMarcas) marcas.push(t);

  const mover = (e: React.MouseEvent<HTMLDivElement>) => {
    const svg = (e.currentTarget.querySelector('svg') as SVGSVGElement | null)?.getBoundingClientRect();
    if (!svg) return;
    const f = (e.clientX - svg.left) / svg.width;
    setCursor(f < 0 || f > 1 ? null : desde + f * (hasta - desde));
  };

  return (
    <>
      <div className={`${TARJETA} relative divide-y divide-mon-pista`} onMouseMove={mover} onMouseLeave={() => setCursor(null)}>
        {filas.map((m) => {
          const tramos = tramosEnElTiempo(muestras, m.valor, desde, hasta);
          const Y = (v: number) => alto - ((Math.min(Math.max(v, m.piso), m.techo) - m.piso) / (m.techo - m.piso)) * alto;
          const banda = tramos.length
            ? `M${tramos.map((t) => `${X(t.t).toFixed(1)},${Y(t.maximo).toFixed(1)}`).join(' L')} L${[...tramos].reverse().map((t) => `${X(t.t).toFixed(1)},${Y(t.minimo).toFixed(1)}`).join(' L')} Z`
            : '';
          const linea = tramos.map((t, i) => `${i ? 'L' : 'M'}${X(t.t).toFixed(1)},${Y(t.promedio).toFixed(1)}`).join(' ');
          const muestra = enCursor ?? ultima;
          return (
            <Fila key={m.id} titulo={m.titulo} techo={m.techo} piso={m.piso} unidad={m.unidad === '%' ? '' : m.unidad} alto={alto}
              valor={muestra ? formatoValor(m.valor(muestra), m.unidad) : '—'}
              vacio={tramos.length ? undefined : m.id === 'latencia' ? 'Sin pedidos en esta ventana' : 'Sin datos en esta ventana'}>
              <line x1={0} x2={ANCHO} y1={alto} y2={alto} className="stroke-mon-pista" vectorEffect="non-scaling-stroke" />
              <Umbrales m={m} Y={Y} />
              {banda && <path d={banda} className="fill-mon-banda" />}
              {linea && <path d={linea} className="fill-none stroke-mon-tinta [stroke-linejoin:round]" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
              {enCursor && <line x1={X(enCursor.t)} x2={X(enCursor.t)} y1={-8} y2={alto + 8} className="stroke-mon-tinta-2" vectorEffect="non-scaling-stroke" />}
            </Fila>
          );
        })}
        <div className="grid grid-cols-[150px_44px_1fr] gap-x-3 px-6 pb-3 pt-2 md:grid-cols-[190px_56px_1fr]">
          <span className={NOTA}>{enCursor ? hora24(enCursor.t) : ''}</span>
          <span />
          <div className="relative h-5 font-mon-num text-[11px] text-mon-apagado">
            {marcas.map((t) => (
              <span key={t} className="absolute -translate-x-1/2" style={{ left: `${(X(t) / ANCHO) * 100}%` }}>{hora24(t).slice(0, 5)}</span>
            ))}
          </div>
        </div>
      </div>
      <Leyenda items={[
        ['promedio cada 30 s', trazo('border-t-[1.5px] border-mon-tinta')],
        ['mínimo a máximo', <span key="b" aria-hidden className="inline-block h-2.5 w-[18px] bg-mon-banda" />],
        ...LEYENDA_UMBRALES,
      ]} />
    </>
  );
}

// ── Pestaña ──────────────────────────────────────────────────────────────

export default function GraficasPestana({ muestras, prueba, muestrasPrueba, resumen }: {
  muestras: MuestraPi[];
  prueba: PruebaRendimiento | null;
  muestrasPrueba: MuestraPi[];
  resumen: ResumenPrueba | null;
}) {
  // Sin ninguna prueba, «Por estudiantes» estaría vacía: se abre en el tiempo.
  const [vista, setVista] = useState<Vista>(() => (prueba ? 'estudiantes' : 'tiempo'));
  const [ventana, setVentana] = useState<Ventana>(() => (prueba && prueba.fin == null ? 'prueba' : '900'));
  const ultima = muestras.length ? muestras[muestras.length - 1] : null;

  const { desde, hasta, visibles } = useMemo(() => {
    if (ventana === 'prueba' && prueba) {
      const fin = prueba.fin ?? ultima?.t ?? Date.now() / 1000;
      return { desde: prueba.inicio, hasta: fin, visibles: muestrasPrueba };
    }
    const h = ultima?.t ?? Date.now() / 1000;
    const d = h - Number(ventana === 'prueba' ? 900 : ventana);
    return { desde: d, hasta: h, visibles: muestras.filter((m) => m.t >= d) };
  }, [ventana, prueba, muestrasPrueba, muestras, ultima]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Selector<Vista> nombre="Vista" valor={vista} onCambio={setVista}
          opciones={[{ valor: 'estudiantes', etiqueta: 'Por estudiantes' }, { valor: 'tiempo', etiqueta: 'En el tiempo' }]} />
        {vista === 'tiempo' && (
          <>
            <span aria-hidden className="h-5 w-px bg-mon-pista" />
            <Selector<Ventana> nombre="Ventana de tiempo" valor={ventana} onCambio={setVentana}
              opciones={[
                { valor: '300', etiqueta: '5 min' }, { valor: '900', etiqueta: '15 min' }, { valor: '1800', etiqueta: '30 min' },
                { valor: 'prueba', etiqueta: 'Prueba', deshabilitada: !prueba },
              ]} />
          </>
        )}
        {vista === 'estudiantes' && prueba && (
          <span className={`${NOTA} ml-auto text-xs`}>
            prueba · {hora24(prueba.inicio).slice(0, 5)}{prueba.fin ? ` – ${hora24(prueba.fin).slice(0, 5)}` : ' – en curso'} · hasta {Math.max(0, ...muestrasPrueba.map((m) => estudiantesEn(m) ?? 0))} estudiantes
          </span>
        )}
      </div>

      {vista === 'estudiantes' ? (
        prueba && muestrasPrueba.length ? (
          <PorEstudiantes muestras={muestrasPrueba} resumen={prueba.fin ? resumen : null} enCurso={prueba.fin == null} />
        ) : (
          <div className={`${TARJETA} flex flex-col items-center gap-2 px-6 py-12 text-center`}>
            <span className="font-mon-titulo text-[15px] font-bold text-mon-tinta">Todavía no hay ninguna prueba</span>
            <span className="text-[13px] text-mon-tinta-2">Aquí se ve con cuántos estudiantes cada medida llega a crítico. Inicia una prueba desde Estado.</span>
          </div>
        )
      ) : (
        <EnElTiempo muestras={visibles} desde={desde} hasta={hasta} />
      )}
    </div>
  );
}
