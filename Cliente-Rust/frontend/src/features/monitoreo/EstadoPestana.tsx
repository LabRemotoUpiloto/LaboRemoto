// features/monitoreo/EstadoPestana.tsx — «Estado» de la Pi 4: cómo está ahora, sus servicios, quién
// está conectado y la prueba de carga (en curso o su resumen).

import type { ServicioPi } from './rendimiento.service';
import type { PruebaRendimiento } from './pruebaRendimiento';
import { ENLACE_SUBIDA_MBPS, INDICADORES, estadoDe, estudiantesEn, type ResumenPrueba } from './rendimientoStats';
import { DISCO, duracion, formatoValor, frenadaAhora, hora24 } from './monitoreo';
import { Barra, Boton, NOTA, Punto, Seccion, TARJETA, TEXTO_NIVEL, type Nivel } from '@/components/ui';
import type { DatosPi } from './useDatosLab';

const NIVEL_DE: Record<string, Nivel> = { bueno: 'bien', alerta: 'alerta', critico: 'critico' };

/** Qué hace cada servicio vigilado, en palabras de cualquiera. */
const QUE_HACE: Record<string, string> = {
  'practicas-linux-api': 'API de prácticas y métricas',
  mediamtx: 'Video de las cámaras',
  'broker-gateway': 'Entrada de los brokers',
  'broker-camaras': 'Cámaras, PTZ y WebRTC',
  'broker-sesiones': 'Registro de sesiones de práctica',
  'cameras-api': 'Lista de cámaras',
  'nvr-broker-tunnel': 'Túnel hacia AWS',
  'arduino-bridge': 'Puente de domótica (Arduino)',
  mosquitto: 'Mensajería MQTT',
};

function porQueCaido(s: ServicioPi): string {
  if (s.detalle === 'auto-restart') return s.reinicios ? `se reinicia en bucle (${s.reinicios.toLocaleString('es-CO')} veces)` : 'se reinicia en bucle';
  if (s.estado === 'failed') return 'caído';
  if (s.estado === 'activating') return 'arrancando';
  return 'detenido';
}

interface Fila {
  nombre: string;
  valor: string;
  frac: number | null;
  alerta?: number;
  critico?: number;
  nivel: Nivel | null;
  detalle: string;
}

function Filas({ filas }: { filas: Fila[] }) {
  return (
    <div className={`${TARJETA} divide-y divide-ui-pista`}>
      {filas.map((f) => {
        const tinta = f.nivel === 'critico' || f.nivel === 'alerta' ? TEXTO_NIVEL[f.nivel] : f.valor === '—' ? 'text-ui-apagado' : 'text-ui-tinta';
        return (
          <div key={f.nombre} className="mx-4 grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2 px-2 py-3.5 md:grid-cols-[200px_130px_260px_1fr]">
            <span className="text-sm font-semibold text-ui-tinta">{f.nombre}</span>
            <span className={`font-ui-num text-xl ${tinta}`}>{f.valor}</span>
            {f.alerta != null || f.frac ? <Barra frac={f.frac} alerta={f.alerta} critico={f.critico} nivel={f.nivel} className="hidden md:block" /> : <span className="hidden md:block" />}
            <span className="col-span-2 text-[13px] text-ui-tinta-2 md:col-span-1">
              {(f.nivel === 'alerta' || f.nivel === 'critico') && (
                <b className={`mr-3 font-bold ${TEXTO_NIVEL[f.nivel]}`}>{f.nivel === 'alerta' ? 'Alerta' : 'Crítico'}</b>
              )}
              {f.detalle}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ResumenDePrueba({ resumen, onGuardar }: { resumen: ResumenPrueba; onGuardar: () => void }) {
  const q = resumen.quiebre;
  const a = resumen.primeraAlerta;
  const minutos = Math.max(1, Math.round((resumen.fin - resumen.inicio) / 60));
  return (
    <Seccion titulo="Última prueba" derecha={<span className={NOTA}>{hora24(resumen.inicio).slice(0, 5)} – {hora24(resumen.fin).slice(0, 5)} · {minutos} min · hasta {resumen.maxEstudiantes} estudiantes</span>}>
      <div className={TARJETA}>
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
          <div className="flex flex-col gap-2">
            {q ? (
              <Punto nivel="critico" fuerte={`Se degradó con ${q.estudiantes ?? '?'} estudiantes`}
                resto={`· ${q.indicador.titulo.toLowerCase()} llegó a ${formatoValor(q.valor, q.indicador.unidad)} (crítico desde ${formatoValor(q.indicador.critico, q.indicador.unidad)})`} />
            ) : (
              <Punto nivel="bien" fuerte="Nada llegó a crítico" resto={`· con hasta ${resumen.maxEstudiantes} estudiantes`} />
            )}
            {a && (!q || a.t < q.t) && (
              <Punto nivel="alerta" fuerte={`Primera alerta con ${a.estudiantes ?? '?'} estudiantes`}
                resto={`· ${a.indicador.titulo.toLowerCase()} pasó de ${formatoValor(a.indicador.alerta, a.indicador.unidad)}`} />
            )}
            {resumen.huboFrenado && <Punto nivel="alerta" fuerte="La Pi bajó su velocidad" resto="· por calor o voltaje; ese tramo no refleja su capacidad normal" />}
            <p className="m-0 mt-2 text-[13px] text-ui-tinta-2">Abre «Gráficas → Por estudiantes» para ver cada medida contra la cantidad de estudiantes.</p>
          </div>
          <Boton onClick={onGuardar}>Guardar Excel</Boton>
        </div>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-y border-ui-pista text-left text-[10px] font-bold uppercase tracking-[0.08em] text-ui-apagado">
              <th className="py-2.5 pl-6 font-bold">Medida</th>
              <th className="py-2.5 text-right font-bold">Pico</th>
              <th className="py-2.5 pl-4 font-bold" />
              <th className="py-2.5 text-right font-bold">Hora</th>
              <th className="py-2.5 pr-6 text-right font-bold">Estudiantes en ese momento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ui-pista">
            {resumen.picos.map((p) => {
              const e = estadoDe(p.indicador, p.valor);
              const nivel = e === 'critico' ? 'critico' : e === 'alerta' ? 'alerta' : null;
              return (
                <tr key={p.indicador.id}>
                  <td className="py-2 pl-6 text-ui-tinta">{p.indicador.titulo}</td>
                  <td className={`py-2 text-right font-ui-num ${nivel ? `font-semibold ${TEXTO_NIVEL[nivel]}` : 'text-ui-tinta'}`}>{formatoValor(p.valor, p.indicador.unidad)}</td>
                  <td className={`py-2 pl-4 text-xs font-bold ${nivel ? TEXTO_NIVEL[nivel] : ''}`}>{nivel === 'critico' ? 'Crítico' : nivel === 'alerta' ? 'Alerta' : ''}</td>
                  <td className="py-2 text-right font-ui-num text-ui-tinta-2">{hora24(p.t)}</td>
                  <td className="py-2 pr-6 text-right font-ui-num text-ui-tinta">{p.estudiantes ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className={`${NOTA} m-0 border-t border-ui-pista px-6 py-3 text-xs`}>
          {resumen.peticiones.toLocaleString('es-CO')} peticiones a la API, {resumen.errores.toLocaleString('es-CO')} con error.
        </p>
      </div>
    </Seccion>
  );
}

export default function EstadoPestana({ pi, prueba, resumen, onIniciar, onTerminar, onGuardarExcel }: {
  pi: DatosPi;
  prueba: PruebaRendimiento | null;
  resumen: ResumenPrueba | null;
  onIniciar: () => void;
  onTerminar: () => void;
  onGuardarExcel: () => void;
}) {
  const { ultima, informe, error } = pi;
  if (!ultima) return null; // la cabecera ya dice «Conectando…» o «Sin conexión»
  const enCurso = !!prueba && prueba.fin == null;

  const ind = (id: string) => INDICADORES.find((i) => i.id === id)!;
  const fila = (id: string, techo: number, detalle: string, piso = 0): Fila => {
    const i = ind(id);
    const v = i.valor(ultima);
    const f = (x: number) => (x - piso) / (techo - piso);
    return { nombre: i.titulo, valor: formatoValor(v, i.unidad), frac: v == null ? null : f(v), alerta: f(i.alerta), critico: f(i.critico), nivel: NIVEL_DE[estadoDe(i, v) ?? ''] ?? null, detalle };
  };
  const mem = ultima.memoria;
  const errores = ind('errores');
  const pctErrores = errores.valor(ultima);
  const filas: Fila[] = [
    fila('cpu', 100, ultima.carga ? `carga ${ultima.carga[0].toFixed(2)}` : ''),
    fila('ram', 100, mem ? `${mem.usada_mb.toLocaleString('es-CO')} de ${mem.total_mb.toLocaleString('es-CO')} MB` : ''),
    // La Pi 4 empieza a bajar la velocidad sola hacia los 80-85 °C.
    fila('temperatura', 90, 'se frena sola hacia los 80 °C'),
  ];
  if (ultima.disco) {
    const d = ultima.disco;
    filas.push({
      nombre: 'Disco', valor: formatoValor(d.pct, '%'), frac: d.pct / 100, alerta: DISCO.alerta / 100, critico: DISCO.critico / 100,
      nivel: d.pct >= DISCO.critico ? 'critico' : d.pct >= DISCO.alerta ? 'alerta' : null, detalle: `${d.usado_gb} de ${d.total_gb} GB`,
    });
  }
  filas.push(
    fila('subida', ENLACE_SUBIDA_MBPS, `de ${ENLACE_SUBIDA_MBPS} Mbps del enlace${ultima.red_rx_kbps != null ? ` · recibe ${(ultima.red_rx_kbps / 1000).toFixed(1)} Mbps` : ''}`),
    fila('latencia', 3500, ultima.api.peticiones ? `${ultima.api.peticiones} pedidos en los últimos 2 s` : 'sin pedidos en los últimos 2 s'),
    {
      nombre: errores.titulo, valor: formatoValor(pctErrores, '%'), frac: null, nivel: NIVEL_DE[estadoDe(errores, pctErrores) ?? ''] ?? null,
      detalle: ultima.api.errores ? `${ultima.api.errores} de ${ultima.api.peticiones} pedidos fallaron` : `${ultima.api.en_curso} pedidos en curso`,
    },
  );

  const servicios = informe?.servicios ?? null;
  const caidos = (servicios ?? []).filter((s) => !s.activo);
  const mitad = servicios ? Math.ceil(servicios.length / 2) : 0;
  const ssh = ultima.sesiones_ssh;

  return (
    <div className="flex flex-col gap-8">
      {frenadaAhora(ultima) && (
        <div className={`${TARJETA} relative py-3.5 pl-7 pr-6 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-ui-critico before:content-['']`}>
          <p className="m-0 text-sm font-bold text-ui-critico-texto">La Pi está bajando su velocidad</p>
          <p className="m-0 mt-1 text-[13px] text-ui-tinta-2">
            {ultima.frenado!.bajo_voltaje ? 'Le llega voltaje bajo (revisar la fuente). ' : ''}
            {ultima.frenado!.frenada || ultima.frenado!.limite_temperatura ? 'Está caliente y se frena para protegerse. ' : ''}
            Lo que se mida ahora no refleja su capacidad normal.
          </p>
        </div>
      )}

      {prueba?.fin != null && resumen && <ResumenDePrueba resumen={resumen} onGuardar={onGuardarExcel} />}

      <Seccion titulo="Ahora" derecha={<span className={NOTA}>se actualiza cada 2 s</span>}>
        <Filas filas={filas} />
      </Seccion>

      {servicios && servicios.length > 0 && (
        <Seccion titulo="Servicios" derecha={<span className={NOTA}>{servicios.length - caidos.length} de {servicios.length} activos</span>}>
          <div className={`${TARJETA} grid md:grid-cols-2`}>
            {[servicios.slice(0, mitad), servicios.slice(mitad)].map((col, k) => (
              <ul key={k} className={`m-0 list-none divide-y divide-ui-pista p-0 px-6 py-1 ${k ? 'md:border-l md:border-ui-pista' : ''}`}>
                {col.map((s) => (
                  <li key={s.unidad} className="grid grid-cols-[auto_1fr] items-center gap-x-3 py-2.5 text-xs sm:grid-cols-[auto_170px_1fr_auto]">
                    <span aria-hidden className={`h-[7px] w-[7px] rounded-full ${s.activo ? 'bg-ui-bien' : 'bg-ui-critico'}`} />
                    <span className="font-ui-num text-ui-tinta">{s.unidad}</span>
                    <span className="hidden text-ui-tinta-2 sm:inline">{QUE_HACE[s.unidad] ?? ''}</span>
                    {!s.activo && <b className="col-span-2 font-bold text-ui-critico-texto sm:col-span-1">{porQueCaido(s)}</b>}
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </Seccion>
      )}

      <Seccion titulo="Conectados">
        <div className={`${TARJETA} grid grid-cols-2 md:grid-cols-4`}>
          {[
            [estudiantesEn(ultima), 'estudiantes conectados'],
            [ssh?.estudiantes, 'con la terminal abierta'],
            [ssh?.tuneles_app, 'apps conectadas'],
            [ultima.camaras?.total, 'conexiones viendo cámaras *'],
          ].map(([n, texto], i) => (
            <div key={texto as string} className={`flex flex-col gap-1 px-6 py-5 ${i ? 'md:border-l md:border-ui-pista' : ''}`}>
              <span className="font-ui-num text-[26px] leading-none text-ui-tinta">{n ?? '—'}</span>
              <span className="text-[13px] text-ui-tinta-2">{texto}</span>
            </div>
          ))}
        </div>
        <p className="m-0 text-[11px] text-ui-apagado">* incluye las grabaciones de Shinobi, aunque nadie esté mirando.</p>
      </Seccion>

      <Seccion titulo="Prueba de carga">
        <div className={`${TARJETA} flex flex-wrap items-center justify-between gap-4 px-6 py-4`}>
          {enCurso ? (
            <div className="flex flex-col gap-1">
              <Punto nivel="critico" fuerte={`Grabando desde las ${hora24(prueba!.inicio)}`}
                resto={`· ${duracion(ultima.t - prueba!.inicio)} · ${estudiantesEn(ultima) ?? 0} estudiantes ahora`} />
              <span className="text-[13px] text-ui-tinta-2">Se sigue grabando aunque cambies de sección o cierres la app.</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1 text-[13px]">
              <span className="text-ui-tinta">Graba todo desde que la inicias hasta que la terminas, aunque cambies de sección o cierres la app.</span>
              <span className="text-ui-tinta-2">Al final dice con cuántos estudiantes algo llegó a crítico y se puede guardar en Excel.</span>
            </div>
          )}
          {enCurso ? <Boton onClick={onTerminar}>Terminar prueba</Boton> : <Boton onClick={onIniciar} disabled={!!error}>Iniciar prueba</Boton>}
        </div>
      </Seccion>
    </div>
  );
}
