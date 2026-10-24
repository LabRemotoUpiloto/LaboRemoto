// features/monitoreo/RegistrosPanel.tsx — registros en vivo de la Pi para el panel de Monitoreo:
// cada petición a la API de prácticas y cada evento de SSH (quién entró, contraseñas fallidas,
// conexiones rechazadas por exceso o cortadas). Sirve para ver qué pasa justo cuando algo falla.
// Paginado y agrupado por día (el auth.log abarca varios). En la página 1 se actualiza en vivo; en
// las demás la lista se queda quieta para poder leerla, y avisa cuántos eventos nuevos llegaron.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { rendimientoLogs, type EventoSsh, type RegistroApi } from './rendimiento.service';
import {
  EVENTOS_SSH, claveApi, claveSsh, contarEventos, eventoConProblema, peticionConProblema, unirRegistros,
  type Gravedad,
} from './registros';
import { Paginador, paginar } from '@/components/ui';
import { agruparPorDia, hora24 } from './monitoreo';
import { Boton, ETIQUETA, NOTA, Selector, TARJETA } from '@/components/ui';

const SONDEO_MS = 3000;
const POR_PAGINA = 15;

/** Color solo para lo que es problema; «Entró» va en negrita y «Salió» en gris. */
const TEXTO_GRAVEDAD: Record<Gravedad, string> = {
  bueno: 'font-semibold text-ui-tinta',
  neutro: 'text-ui-tinta-2',
  alerta: 'font-bold text-ui-alerta-texto',
  critico: 'font-bold text-ui-critico-texto',
};

const tamano = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);

function estadoPeticion(r: RegistroApi): Gravedad {
  if (r.estado === 0 || r.estado >= 500) return 'critico';
  if (r.estado >= 400 || r.ms > 1000) return 'alerta';
  return 'bueno';
}

type Tipo = 'ssh' | 'api';

const RegistrosPanel: React.FC = () => {
  const [api, setApi] = useState<RegistroApi[]>([]);
  const [ssh, setSsh] = useState<EventoSsh[]>([]);
  const [sinAuthLog, setSinAuthLog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipo, setTipo] = useState<Tipo>('ssh');
  const [soloProblemas, setSoloProblemas] = useState(false);
  const [pausado, setPausado] = useState(false);
  const [pagina, setPagina] = useState(1);
  /** Fuera de la página 1, la lista se corta en este instante para que no se corra mientras se lee. */
  const [corte, setCorte] = useState<number | null>(null);
  const ultimos = useRef<{ api?: number; ssh?: number }>({});

  useEffect(() => {
    if (pausado) return;
    let vivo = true;
    let enVuelo = false;
    const pedir = async () => {
      if (enVuelo) return;
      enVuelo = true;
      try {
        // SSH: desde un segundo antes (el auth.log no trae fracciones); los repetidos se descartan.
        const desdeSsh = ultimos.current.ssh != null ? ultimos.current.ssh - 1 : undefined;
        const r = await rendimientoLogs(ultimos.current.api, desdeSsh);
        if (!vivo) return;
        if (r.api.length) {
          ultimos.current.api = r.api[r.api.length - 1].t;
          setApi((prev) => unirRegistros(prev, r.api, claveApi));
        }
        if (r.ssh === null) setSinAuthLog(true);
        else if (r.ssh.length) {
          ultimos.current.ssh = r.ssh[r.ssh.length - 1].t;
          setSsh((prev) => unirRegistros(prev, r.ssh!, claveSsh));
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
  }, [pausado]);

  const cincoMin = Date.now() / 1000 - 300;
  const cuenta = useMemo(() => contarEventos(ssh, cincoMin), [ssh, Math.floor(cincoMin / 30)]); // eslint-disable-line react-hooks/exhaustive-deps
  const problemasApi = useMemo(() => api.filter((r) => r.t >= cincoMin && peticionConProblema(r)).length, [api, Math.floor(cincoMin / 30)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lo más nuevo primero, filtrado y cortado si se está leyendo una página vieja.
  const todos = useMemo(() => {
    const base = tipo === 'ssh'
      ? (soloProblemas ? ssh.filter(eventoConProblema) : ssh)
      : (soloProblemas ? api.filter(peticionConProblema) : api);
    return [...base].reverse() as (EventoSsh | RegistroApi)[];
  }, [tipo, soloProblemas, ssh, api]);
  const visibles = corte == null ? todos : todos.filter((r) => r.t <= corte);
  const nuevos = corte == null ? 0 : todos.length - visibles.length;
  const pag = paginar(visibles, pagina, POR_PAGINA);

  const irA = (p: number) => {
    if (p <= 1) { setCorte(null); setPagina(1); return; }
    if (corte == null) setCorte(todos.length ? todos[0].t : null);
    setPagina(p);
  };
  // Cambiar de tipo o de filtro vuelve a la página 1, en vivo.
  useEffect(() => { setPagina(1); setCorte(null); }, [tipo, soloProblemas]);

  const resumen: { texto: string; n: number; gravedad: Gravedad }[] = [
    { texto: 'entradas', n: cuenta.entrada ?? 0, gravedad: 'bueno' },
    { texto: 'contraseñas incorrectas', n: (cuenta.clave_incorrecta ?? 0) + (cuenta.usuario_inexistente ?? 0), gravedad: 'alerta' },
    { texto: 'rechazadas por exceso', n: cuenta.rechazada_por_exceso ?? 0, gravedad: 'critico' },
    { texto: 'cortadas o sin terminar', n: (cuenta.cortada ?? 0) + (cuenta.tiempo_agotado ?? 0) + (cuenta.cerrada_sin_entrar ?? 0), gravedad: 'critico' },
    { texto: 'peticiones con problema', n: problemasApi, gravedad: 'alerta' },
  ];

  const columnas = tipo === 'ssh'
    ? ['Hora', 'Qué pasó', 'Usuario', 'Desde', 'Mensaje de sshd']
    : ['Hora', 'Petición', 'Estado', 'Tiempo', 'Tamaño'];

  const vacio = tipo === 'ssh' && sinAuthLog
    ? 'La API no puede leer el auth.log de la Pi: el usuario del servicio necesita permiso de lectura (grupo adm).'
    : pag.total === 0 ? (soloProblemas ? 'Sin problemas registrados.' : 'Todavía no hay registros.') : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Selector<Tipo> nombre="Tipo de registro" valor={tipo} onCambio={setTipo}
          opciones={[{ valor: 'ssh', etiqueta: 'Conexiones SSH' }, { valor: 'api', etiqueta: 'Peticiones a la API' }]} />
        <div className="flex items-center gap-5">
          <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-ui-tinta-2">
            <input type="checkbox" checked={soloProblemas} onChange={(e) => setSoloProblemas(e.currentTarget.checked)} className="h-3.5 w-3.5 accent-[var(--text-primary)]" />
            Solo problemas
          </label>
          <Boton onClick={() => setPausado((p) => !p)}>{pausado ? 'Seguir' : 'Pausar'}</Boton>
        </div>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-xs">
        <span className={ETIQUETA}>Últimos 5 min</span>
        {resumen.map((r) => (
          <span key={r.texto} className={r.n > 0 && r.gravedad !== 'bueno' ? TEXTO_GRAVEDAD[r.gravedad] : 'text-ui-tinta-2'}>
            <b className="font-ui-num font-bold">{r.n}</b> {r.texto}
          </span>
        ))}
        <span className={`${NOTA} ml-auto`}>{pausado ? 'en pausa' : 'se actualiza cada 3 s'}</span>
      </div>

      {error && <p className="m-0 text-xs text-ui-critico-texto">No se pudieron leer los registros: {error}</p>}

      <div className={TARJETA}>
        {vacio ? (
          <p className="m-0 px-6 py-5 text-[13px] text-ui-tinta-2">{vacio}</p>
        ) : (
          <table className="w-full table-fixed border-collapse text-[13px]">
            <colgroup>
              {(tipo === 'ssh' ? ['96px', '200px', '22%', '140px', 'auto'] : ['96px', 'auto', '90px', '90px', '90px']).map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <thead>
              <tr>
                {columnas.map((c, i) => (
                  <th key={c} className={`border-b border-ui-pista px-3 pb-2.5 pt-3.5 text-left text-[10px] font-bold uppercase tracking-[0.08em] text-ui-apagado first:pl-6 last:pr-6 ${tipo === 'api' && i >= 2 ? 'text-right' : ''}`}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agruparPorDia(pag.filas).map((g) => (
                <React.Fragment key={g.dia + g.filas[0].t}>
                  <tr>
                    <td colSpan={5} className="bg-ui-terciario px-6 pb-2 pt-2.5 text-[10px] font-bold tracking-[0.08em] text-ui-tinta-2">{g.dia}</td>
                  </tr>
                  {g.filas.map((r) => {
                    if (tipo === 'ssh') {
                      const e = r as EventoSsh;
                      const info = EVENTOS_SSH[e.tipo] ?? { texto: e.tipo, gravedad: 'neutro' as Gravedad };
                      return (
                        <tr key={claveSsh(e)} className="border-t border-ui-pista">
                          <td className="py-[7px] pl-6 pr-3 font-ui-num text-xs text-ui-tinta-2">{hora24(e.t)}</td>
                          <td className={`truncate px-3 ${TEXTO_GRAVEDAD[info.gravedad]}`}>{info.texto}</td>
                          <td className="truncate px-3 text-ui-tinta" title={e.usuario ?? ''}>{e.usuario ?? <span className="text-ui-apagado">—</span>}</td>
                          <td className="px-3 font-ui-num text-xs text-ui-tinta-2">{e.ip ?? <span className="text-ui-apagado">—</span>}</td>
                          <td className="truncate px-3 pr-6 font-ui-num text-[11px] text-ui-apagado" title={e.mensaje}>{e.mensaje}</td>
                        </tr>
                      );
                    }
                    const p = r as RegistroApi;
                    const g2 = estadoPeticion(p);
                    return (
                      <tr key={claveApi(p)} className="border-t border-ui-pista">
                        <td className="py-[7px] pl-6 pr-3 font-ui-num text-xs text-ui-tinta-2">{hora24(p.t)}</td>
                        <td className="truncate px-3 font-ui-num text-xs text-ui-tinta" title={p.ruta ?? ''}>
                          <span className="mr-2 text-ui-apagado">{p.tipo}</span>{p.metodo} {p.ruta}
                        </td>
                        <td className={`px-3 text-right font-ui-num ${g2 === 'bueno' ? 'text-ui-tinta' : TEXTO_GRAVEDAD[g2]}`}>{p.estado === 0 ? 'falló' : p.estado}</td>
                        <td className={`px-3 text-right font-ui-num ${p.ms > 1000 ? TEXTO_GRAVEDAD.alerta : 'text-ui-tinta'}`}>{Math.round(p.ms)} ms</td>
                        <td className="px-3 pr-6 text-right font-ui-num text-ui-tinta-2">{tamano(p.bytes)}</td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
        {!vacio && (
          <Paginador pagina={pag} onPagina={irA} unidad={tipo === 'ssh' ? (soloProblemas ? 'problemas' : 'eventos') : 'peticiones'}
            extra={<>
              {' (se guardan los últimos 500)'}
              {nuevos > 0 && (
                <button type="button" onClick={() => irA(1)} className="ml-3 cursor-pointer border-none bg-transparent p-0 font-ui-num text-xs font-bold text-ui-tinta underline">
                  {nuevos} nuevos
                </button>
              )}
            </>} />
        )}
      </div>
    </div>
  );
};

export default RegistrosPanel;
