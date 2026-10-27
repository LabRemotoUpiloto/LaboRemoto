// features/reservas/ReservasPage.tsx — reservar una hora de laboratorio en dos pasos: elegir la práctica y luego el día y la hora.
// Todavía no hay servicio de reservas: los horarios se simulan (generarSlots) y las reservas viven solo mientras la página está
// abierta. Las prácticas sí son las reales (practicas_list_categories, el mismo comando que la página Prácticas).
import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ArrowLeft, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  Aviso, Boton, BotonIcono, BotonPrincipal, Desplegable, ETIQUETA, Encabezado, FILA, FilasCargando, Pagina, Paginador,
  RADIO, Seccion, Selector, TARJETA, paginar,
} from '@/components/ui';

// ── Tipos ──

type EstadoSlot = 'disponible' | 'ocupado' | 'mi-reserva' | 'bloqueado' | 'pasado';

interface Slot { hora: string; estado: EstadoSlot }

interface Practice {
  id: string;
  name: string;
  description: string;
  difficulty: string;
  panels: { camera: boolean; chat: boolean; chat_context: string; chat_tutorial: string };
  connection: any;
  terminal: any;
  moodle_assignment_id?: number;
}

interface PracticeCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  practices: Practice[];
}

interface PracticeOption { practice: Practice; category: PracticeCategory }

interface ReservaConfirmada {
  practice: Practice;
  categoryId: string;
  fecha: string;
  hora: string;
}

// ── Constantes ──

const HORAS = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
const DIAS_VISIBLES = 7;
const PRACTICAS_POR_PAGINA = 8;
const RESERVAS_POR_PAGINA = 5;

const DIFICULTAD: Record<string, string> = { beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado' };

/** Cómo se lee cada horario: la palabra va debajo de la hora, en el color de su estado. */
const ESTADO: Record<EstadoSlot, { texto: string; color: string }> = {
  disponible: { texto: 'Libre', color: 'text-ui-tinta-2' },
  'mi-reserva': { texto: 'Tu reserva', color: 'text-ui-bien-texto' },
  ocupado: { texto: 'Ocupado', color: 'text-ui-apagado' },
  bloqueado: { texto: 'Cerrado', color: 'text-ui-fantasma' },
  pasado: { texto: 'Ya pasó', color: 'text-ui-fantasma' },
};

// ── Ayudas ──

/** AAAA-MM-DD en la hora local (toISOString daría el día UTC: en Colombia, después de las 7 p. m. ya es mañana). */
function formatFecha(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const fechaLarga = (d: Date) => d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
const fechaDeTexto = (s: string) => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };
const finDeHora = (hora: string) => `${String(parseInt(hora, 10) + 1).padStart(2, '0')}:00`;
const sumarDias = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

function horaActual() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

/** Horarios simulados, siempre los mismos para una práctica y una fecha. Si la fecha es hoy, las horas que ya empezaron no se ofrecen. */
function generarSlots(practiceId: string, fecha: string, reservasUsuario: ReservaConfirmada[], esHoy: boolean): Slot[] {
  const seed = practiceId.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + fecha.charCodeAt(8);
  const ahora = esHoy ? horaActual() : -1;
  return HORAS.map((hora, i) => {
    if (hora === '12:00') return { hora, estado: 'bloqueado' };
    if (reservasUsuario.some((r) => r.practice.id === practiceId && r.fecha === fecha && r.hora === hora)) return { hora, estado: 'mi-reserva' };
    if (parseInt(hora, 10) * 60 <= ahora) return { hora, estado: 'pasado' };
    return { hora, estado: (seed + i * 7) % 10 < 3 ? 'ocupado' : 'disponible' };
  });
}

const proximoLibre = (slots: Slot[]) => slots.find((s) => s.estado === 'disponible')?.hora ?? null;

// ── Página ──

export default function ReservasPage() {
  const hoy = useMemo(() => new Date(), []);
  const [categories, setCategories] = useState<PracticeCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categoria, setCategoria] = useState('todas');
  const [paginaPracticas, setPaginaPracticas] = useState(1);
  const [picked, setPicked] = useState<PracticeOption | null>(null);
  const [inicio, setInicio] = useState<Date>(hoy);
  const [fecha, setFecha] = useState<Date>(hoy);
  const [slotSel, setSlotSel] = useState<string | null>(null);
  const [reservas, setReservas] = useState<ReservaConfirmada[]>([]);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cats = await invoke<PracticeCategory[]>('practicas_list_categories');
        if (!cancelled) setCategories(cats);
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const allPractices: PracticeOption[] = useMemo(
    () => categories.flatMap((c) => c.practices.map((p) => ({ practice: p, category: c }))),
    [categories],
  );
  const filtradas = categoria === 'todas' ? allPractices : allPractices.filter((o) => o.category.id === categoria);
  const vistaPracticas = paginar(filtradas, paginaPracticas, PRACTICAS_POR_PAGINA);

  const fechaStr = formatFecha(fecha);
  const esHoy = fechaStr === formatFecha(hoy);
  const slots = useMemo(() => (picked ? generarSlots(picked.practice.id, fechaStr, reservas, esHoy) : []), [picked, fechaStr, reservas, esHoy]);
  const proximo = proximoLibre(slots);
  const slotActual = slots.find((s) => s.hora === slotSel);

  const dias = useMemo(() => Array.from({ length: DIAS_VISIBLES }, (_, i) => sumarDias(inicio, i)), [inicio]);
  const moverSemana = (delta: number) => {
    const nuevo = sumarDias(inicio, delta * DIAS_VISIBLES);
    const desde = nuevo < hoy ? hoy : nuevo;
    setInicio(desde);
    setFecha(desde);
    setSlotSel(null);
  };

  const elegir = (opt: PracticeOption) => {
    setPicked(opt);
    setInicio(hoy);
    setFecha(hoy);
    setSlotSel(null);
  };

  const confirmarReserva = async () => {
    if (!picked || !slotSel || slotActual?.estado !== 'disponible') return;
    setConfirmando(true);
    await new Promise((r) => setTimeout(r, 500));
    setReservas((prev) => [...prev, { practice: picked.practice, categoryId: picked.category.id, fecha: fechaStr, hora: slotSel }]);
    setSlotSel(null);
    setConfirmando(false);
  };

  const misReservas = (
    <MisReservas reservas={reservas} onCancel={(i) => setReservas((prev) => prev.filter((_, j) => j !== i))} />
  );

  return (
    <Pagina>
      <Encabezado titulo="Reservas"
        descripcion={picked
          ? 'Elige el día y la hora. Cada reserva aparta el equipo durante una hora.'
          : 'Elige la práctica que quieres hacer; luego el día y la hora.'} />

      {loading ? (
        <FilasCargando plantilla="grid-cols-[minmax(0,1fr)_120px]" columnas={2} filas={5} />
      ) : error ? (
        <Aviso nivel="critico" titulo="No se pudieron cargar las prácticas" detalle={error} />
      ) : !picked ? (
        // ── Paso 1: la práctica ──
        <div data-tour="reservas-pagina" className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-6">
          <Seccion titulo="Prácticas disponibles"
            derecha={categories.length > 1 && (
              <Desplegable etiqueta="Categoría" valor={categoria}
                onCambio={(v) => { setCategoria(v); setPaginaPracticas(1); }}
                opciones={[{ valor: 'todas', etiqueta: 'Todas las categorías' }, ...categories.map((c) => ({ valor: c.id, etiqueta: c.name }))]} />
            )}>
            {!vistaPracticas.total ? (
              <Aviso titulo="No hay prácticas configuradas todavía" />
            ) : (
              <div className={TARJETA}>
                <ul className="m-0 list-none p-0">
                  {vistaPracticas.filas.map((o, i) => (
                    <li key={`${o.category.id}/${o.practice.id}`} className={`flex items-center gap-4 px-5 py-3.5 ${FILA} ${i ? 'border-t border-ui-pista' : ''}`}>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[14px] font-semibold text-ui-tinta" title={o.practice.name}>{o.practice.name}</span>
                        <span className="line-clamp-2 text-[12px] text-ui-tinta-2">{o.practice.description}</span>
                        <span className="text-[12px] text-ui-apagado">
                          {o.category.name}, nivel {(DIFICULTAD[o.practice.difficulty] ?? DIFICULTAD.beginner).toLowerCase()}
                        </span>
                      </span>
                      <Boton onClick={() => elegir(o)}>Reservar</Boton>
                    </li>
                  ))}
                </ul>
                <Paginador pagina={vistaPracticas} onPagina={setPaginaPracticas} unidad="prácticas" />
              </div>
            )}
          </Seccion>
          {misReservas}
        </div>
      ) : (
        // ── Paso 2: el día y la hora ──
        <div data-tour="reservas-pagina" className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-6">
          <div className="flex min-w-0 flex-col gap-7">
            <div className={`${TARJETA} flex items-center gap-4 px-5 py-4`}>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={ETIQUETA}>{picked.category.name}</span>
                <span className="truncate text-[15px] font-semibold text-ui-tinta">{picked.practice.name}</span>
              </span>
              <Boton onClick={() => { setPicked(null); setSlotSel(null); }}><ArrowLeft size={14} aria-hidden /> Cambiar práctica</Boton>
            </div>

            <Seccion titulo="Día"
              derecha={
                <span className="flex gap-1">
                  <BotonIcono etiqueta="Semana anterior" disabled={formatFecha(inicio) === formatFecha(hoy)} onClick={() => moverSemana(-1)}
                    className="disabled:cursor-default disabled:text-ui-fantasma disabled:hover:bg-transparent">
                    <ChevronLeft size={14} aria-hidden />
                  </BotonIcono>
                  <BotonIcono etiqueta="Semana siguiente" onClick={() => moverSemana(1)}><ChevronRight size={14} aria-hidden /></BotonIcono>
                </span>
              }>
              <div>
                <Selector nombre="Día de la reserva" valor={fechaStr}
                  onCambio={(v) => { setFecha(fechaDeTexto(v)); setSlotSel(null); }}
                  opciones={dias.map((d) => ({
                    valor: formatFecha(d),
                    etiqueta: formatFecha(d) === formatFecha(hoy) ? 'Hoy' : d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' }),
                  }))} />
              </div>
            </Seccion>

            <Seccion titulo={`Horarios del ${fechaLarga(fecha)}`}
              derecha={proximo
                ? <span className="text-[13px] text-ui-tinta-2">Próximo libre: <span className="font-ui-num">{proximo}–{finDeHora(proximo)}</span></span>
                : undefined}>
              {!proximo && (
                <Aviso nivel="alerta" titulo="No quedan horarios libres este día" detalle="Prueba con otro día." />
              )}
              <div role="group" aria-label="Horarios" className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2">
                {slots.map((s) => {
                  const libre = s.estado === 'disponible';
                  const elegido = slotSel === s.hora;
                  return (
                    <button key={s.hora} type="button" disabled={!libre} aria-pressed={elegido}
                      aria-label={`${s.hora} a ${finDeHora(s.hora)}, ${ESTADO[s.estado].texto.toLowerCase()}`}
                      onClick={() => setSlotSel(elegido ? null : s.hora)}
                      className={`flex flex-col items-start gap-0.5 ${RADIO} border-[length:var(--card-border-width,1px)] border-ui-borde bg-ui-superficie px-3 py-2 text-left transition-colors enabled:cursor-pointer enabled:hover:border-ui-acento-texto disabled:cursor-default disabled:bg-transparent aria-pressed:border-ui-acento-texto aria-pressed:shadow-[inset_0_0_0_1px_var(--accent-primary)]`}>
                      <span className={`font-ui-num text-[13px] ${libre ? 'text-ui-tinta' : 'text-ui-apagado'}`}>{s.hora}</span>
                      <span className={`text-[11px] ${elegido ? 'text-ui-acento-texto' : ESTADO[s.estado].color}`}>{elegido ? 'Elegido' : ESTADO[s.estado].texto}</span>
                    </button>
                  );
                })}
              </div>
            </Seccion>
          </div>

          <div className="flex flex-col gap-7">
            <Seccion titulo="Confirmar reserva">
              <div className={TARJETA}>
                {slotSel && slotActual?.estado === 'disponible' ? (
                  <>
                    <dl className="m-0">
                      {[
                        ['Práctica', picked.practice.name],
                        ['Día', fechaLarga(fecha)],
                        ['Hora', `${slotSel}–${finDeHora(slotSel)}`],
                      ].map(([k, v], i) => (
                        <div key={k} className={`grid grid-cols-[72px_minmax(0,1fr)] items-baseline gap-3 px-5 py-2.5 ${i ? 'border-t border-ui-pista' : ''}`}>
                          <dt className="text-[13px] text-ui-apagado">{k}</dt>
                          <dd className={`m-0 text-[13px] text-ui-tinta ${k === 'Hora' ? 'font-ui-num' : ''}`}>{v}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="flex justify-end gap-2 border-t border-ui-pista px-5 py-3">
                      <Boton onClick={() => setSlotSel(null)}>Cancelar</Boton>
                      <BotonPrincipal disabled={confirmando} onClick={() => void confirmarReserva()}>
                        {confirmando ? 'Reservando…' : 'Confirmar reserva'}
                      </BotonPrincipal>
                    </div>
                  </>
                ) : (
                  <p className="m-0 px-5 py-4 text-[13px] text-ui-apagado">Elige un horario libre para continuar.</p>
                )}
              </div>
            </Seccion>
            {misReservas}
          </div>
        </div>
      )}
    </Pagina>
  );
}

// ── Mis reservas (en los dos pasos) ──

function MisReservas({ reservas, onCancel }: {
  reservas: ReservaConfirmada[];
  onCancel: (index: number) => void;
}) {
  const [pagina, setPagina] = useState(1);
  const vista = paginar(reservas, pagina, RESERVAS_POR_PAGINA);
  const base = (vista.pagina - 1) * RESERVAS_POR_PAGINA;
  return (
    <Seccion titulo="Mis reservas">
      {!reservas.length ? (
        <Aviso titulo="No tienes reservas activas" detalle="Elige una práctica para empezar." />
      ) : (
        <div className={TARJETA}>
          <ul className="m-0 list-none p-0">
            {vista.filas.map((r, i) => (
              <li key={`${r.practice.id}/${r.fecha}/${r.hora}`} className={`flex items-center gap-3 px-5 py-3 ${FILA} ${i ? 'border-t border-ui-pista' : ''}`}>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[13px] font-semibold text-ui-tinta" title={r.practice.name}>{r.practice.name}</span>
                  <span className="text-[12px] text-ui-apagado">
                    {fechaLarga(fechaDeTexto(r.fecha))}, <span className="font-ui-num">{r.hora}–{finDeHora(r.hora)}</span>
                  </span>
                </span>
                <BotonIcono etiqueta="Cancelar la reserva" onClick={() => onCancel(base + i)}><X size={14} aria-hidden /></BotonIcono>
              </li>
            ))}
          </ul>
          {vista.paginas > 1 && <Paginador pagina={vista} onPagina={setPagina} unidad="reservas" />}
        </div>
      )}
    </Seccion>
  );
}
