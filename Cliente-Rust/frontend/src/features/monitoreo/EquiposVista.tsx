// features/monitoreo/EquiposVista.tsx — «Equipos del laboratorio»: la primera vista de Monitoreo.
// Arriba lo que ya envía datos (Pi 4 y cámaras); abajo lo que todavía no, como «Próximamente».
import React from 'react';
import type { CamaraAdmin } from '@/features/camaras/camarasAdmin.service';
import { INDICADORES, estadoDe } from './rendimientoStats';
import { duracion, estadoPi, formatoValor, hora24 } from './monitoreo';
import { Barra, Boton, ETIQUETA, NOTA, Punto, TARJETA, TARJETA_APAGADA, type Nivel } from '@/components/ui';
import { Camara, ModuloDomotica, PlacaJetson, PlacaPi4, PlacaPi5 } from './Dibujos';
import type { DatosCamaras, DatosPi } from './useDatosLab';

const NIVEL_DE: Record<string, Nivel> = { bueno: 'bien', alerta: 'alerta', critico: 'critico' };

function Lectura({ nombre, valor, frac, alerta, critico, nivel }: {
  nombre: string; valor: string; frac: number | null; alerta?: number; critico?: number; nivel?: Nivel | null;
}) {
  const tinta = nivel === 'critico' ? 'text-ui-critico-texto' : nivel === 'alerta' ? 'text-ui-alerta-texto' : valor === '—' ? 'text-ui-apagado' : 'text-ui-tinta';
  return (
    <div className="flex min-w-[116px] flex-col gap-2">
      <span className={ETIQUETA}>{nombre}</span>
      <span className={`font-ui-num text-[22px] leading-none ${tinta}`}>{valor}</span>
      <Barra frac={frac} alerta={alerta} critico={critico} nivel={nivel} className="mt-1 w-[116px]" />
    </div>
  );
}

function Pi4Tarjeta({ pi, onAbrir }: { pi: DatosPi; onAbrir: () => void }) {
  const { ultima, informe, error } = pi;
  const estado = estadoPi(ultima, informe?.servicios, error);
  const sinDatos = !ultima || !!error;
  const lectura = (id: string, techo: number, piso = 0) => {
    const ind = INDICADORES.find((i) => i.id === id)!;
    const v = ultima && !error ? ind.valor(ultima) : null;
    const f = (x: number) => (x - piso) / (techo - piso);
    return (
      <Lectura key={id} nombre={id === 'latencia' ? 'API (p95)' : ind.titulo} valor={formatoValor(v, ind.unidad)}
        frac={v == null ? null : f(v)} alerta={f(ind.alerta)} critico={f(ind.critico)} nivel={NIVEL_DE[estadoDe(ind, v) ?? ''] ?? null} />
    );
  };
  const mem = ultima?.memoria;
  const ramGb = mem ? Math.round(mem.total_mb / 1024) : null;
  const encendida = informe?.info.encendida_desde;
  const pie = sinDatos
    ? (ultima ? `último dato: ${hora24(ultima.t)}` : '')
    : [
        ultima.carga && `carga ${ultima.carga[0].toFixed(2)}`,
        mem && `${mem.usada_mb.toLocaleString('es-CO')} de ${mem.total_mb.toLocaleString('es-CO')} MB`,
        ultima.red_rx_kbps != null && `recibe ${(ultima.red_rx_kbps / 1000).toFixed(1)} Mbps`,
        encendida && `encendida hace ${duracion(Date.now() / 1000 - encendida)}`,
      ].filter(Boolean).join(', ');

  return (
    <article className={`${TARJETA} grid gap-6 p-8 md:grid-cols-[280px_1fr]`}>
      <div className="flex flex-col gap-3">
        <PlacaPi4 apagado={sinDatos} className="w-full max-w-[260px]" />
        <span className={NOTA + ' text-[10px]'}>
          {[(informe?.info.modelo ?? 'Raspberry Pi 4').replace(/ Rev [\d.]+$/, ''), informe?.info.nucleos && `${informe.info.nucleos} núcleos`, ramGb && `${ramGb} GB`].filter(Boolean).join(', ')}
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h2 className="m-0 font-ui-titulo text-xl font-bold text-ui-tinta">Raspberry Pi 4</h2>
            <p className="m-0 text-[13px] text-ui-tinta-2">Servidor de prácticas: terminales, API y cámaras</p>
            <Punto nivel={estado.nivel} fuerte={estado.fuerte} resto={estado.resto && `(${estado.resto})`} />
          </div>
          <Boton onClick={onAbrir}>Abrir rendimiento</Boton>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-5">
          {lectura('cpu', 100)}
          {lectura('ram', 100)}
          {lectura('temperatura', 90)}
          {lectura('subida', 25)}
          {lectura('latencia', 3500)}
        </div>
        {pie && <p className={`${NOTA} m-0 border-t border-ui-pista pt-3`}>{pie}</p>}
      </div>
    </article>
  );
}

const SHINOBI: Record<string, string> = { active: 'activa', connecting: 'conectando', offline: 'sin conexión' };

function CamarasTarjeta({ datos, pi, onAbrir }: { datos: DatosCamaras; pi: DatosPi; onAbrir: () => void }) {
  const { camaras, error } = datos;
  const viendo = pi.ultima && !pi.error ? pi.ultima.camaras?.por_camara ?? null : null;
  const sinVideo = (c: CamaraAdmin) => c.habilitada && c.video !== 'transmitiendo';
  const lista = camaras ?? [];
  const activas = lista.filter((c) => c.habilitada);
  const caidas = activas.filter(sinVideo);
  // Sin la Pi 4 no hay de dónde saber nada de las cámaras: MediaMTX y el broker corren ahí.
  const sinDatos = !camaras || !!error;

  let resumen: React.ReactNode;
  if (sinDatos) {
    resumen = <Punto nivel="apagado" fuerte="Sin datos" resto={error ? '(su estado llega a través de la Pi 4, que no responde)' : '(consultando…)'} />;
  } else if (caidas.length) {
    resumen = <Punto nivel="critico" fuerte={`${activas.length - caidas.length} de ${activas.length} transmitiendo`} resto={`(${caidas.map((c) => c.nombre).join(', ')} sin video)`} />;
  } else {
    const total = viendo ? Object.values(viendo).reduce((s, n) => s + n, 0) : null;
    resumen = <Punto nivel="bien" fuerte={`${activas.length} de ${activas.length} transmitiendo`} resto={total != null ? `con ${total} conexiones viendo video` : undefined} />;
  }

  return (
    <article className={`${TARJETA} grid gap-6 p-8 md:grid-cols-[280px_1fr]`}>
      <div className="grid grid-cols-2 content-start justify-items-start gap-x-8 gap-y-5">
        {(lista.length ? lista : [{ id: 'a', nombre: '' }, { id: 'b', nombre: '' }, { id: 'c', nombre: '' }, { id: 'd', nombre: '' }] as CamaraAdmin[])
          .map((c) => <Camara key={c.id} nombre={c.nombre} apagado={sinDatos || !c.habilitada} sinVideo={!sinDatos && sinVideo(c)} />)}
        <span className={NOTA + ' col-span-2 text-[10px]'}>video con MediaMTX y grabación con Shinobi</span>
      </div>
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h2 className="m-0 font-ui-titulo text-xl font-bold text-ui-tinta">Cámaras</h2>
            <p className="m-0 text-[13px] text-ui-tinta-2">Video en vivo para las prácticas y grabación del laboratorio</p>
            {resumen}
          </div>
          <Boton onClick={onAbrir}>Abrir vigilancia</Boton>
        </div>
        {!sinDatos && (
          <div className="grid grid-cols-2 gap-y-5 lg:grid-cols-4">
            {lista.map((c, i) => {
              const mal = sinVideo(c);
              return (
                <div key={c.id} className={`flex flex-col gap-1 pr-4 ${i % 4 ? 'lg:border-l lg:border-ui-pista lg:pl-4' : ''}`}>
                  <span className={ETIQUETA}>{c.nombre}</span>
                  <span className={`text-[15px] font-bold ${!c.habilitada ? 'text-ui-apagado' : mal ? 'text-ui-critico-texto' : 'text-ui-tinta'}`}>
                    {!c.habilitada ? 'Deshabilitada' : mal ? 'Sin video' : 'Transmitiendo'}
                  </span>
                  {c.habilitada && (
                    <span className={`text-xs ${c.estado && c.estado !== 'active' ? 'text-ui-critico-texto' : 'text-ui-tinta-2'}`}>
                      Shinobi: {c.estado ? SHINOBI[c.estado] ?? c.estado : 'sin dato'}
                    </span>
                  )}
                  {viendo && <span className={NOTA + ' text-xs'}>{viendo[c.ruta] ?? 0} viendo</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </article>
  );
}

const PROXIMOS = [
  { nombre: 'Raspberry Pi 5', texto: 'Puente hacia los robots EV3.', Dibujo: PlacaPi5 },
  { nombre: 'NVIDIA Jetson', texto: 'Visión por computador e IA.', Dibujo: PlacaJetson },
  { nombre: 'Módulo de domótica', texto: 'Arduino con relés y sensores.', Dibujo: ModuloDomotica },
];

export default function EquiposVista({ pi, camaras, onAbrirPi4, onAbrirVigilancia }: {
  pi: DatosPi;
  camaras: DatosCamaras;
  onAbrirPi4: () => void;
  onAbrirVigilancia: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-6 pb-10 pt-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className={ETIQUETA}>Monitoreo</span>
          <h1 className="m-0 font-ui-titulo text-2xl font-bold text-ui-tinta">Equipos del laboratorio</h1>
          <p className="m-0 text-[13px] text-ui-tinta-2">El hardware que usan las prácticas: cómo está cada equipo ahora mismo.</p>
        </div>
      </header>

      <Pi4Tarjeta pi={pi} onAbrir={onAbrirPi4} />
      <CamarasTarjeta datos={camaras} pi={pi} onAbrir={onAbrirVigilancia} />

      <section className="mt-4 flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className={ETIQUETA}>Sin monitoreo todavía</h3>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {PROXIMOS.map(({ nombre, texto, Dibujo }) => (
            <article key={nombre} aria-disabled className={`${TARJETA_APAGADA} flex flex-col`}>
              <div className="flex justify-center border-b border-ui-pista bg-ui-terciario px-5 py-5">
                <Dibujo apagado className="w-[170px]" />
              </div>
              <div className="flex flex-1 flex-col gap-1 px-5 pt-5">
                <h4 className="m-0 font-ui-titulo text-[15px] font-bold text-ui-tinta-2">{nombre}</h4>
                <p className="m-0 text-xs text-ui-apagado">{texto}</p>
              </div>
              <div className="mx-5 mt-8 border-t border-ui-pista py-3">
                <span className={ETIQUETA}>Próximamente</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
