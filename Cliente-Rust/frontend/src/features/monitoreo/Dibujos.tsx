// pages/rendimiento/Dibujos.tsx — dibujos de línea de cada equipo, con la tinta del tema.
// `apagado`: punteados y en gris, para los equipos que todavía no envían datos.


function trazos(apagado: boolean) {
  return {
    linea: apagado ? 'fill-none stroke-ui-fantasma [stroke-dasharray:3_3]' : 'fill-none stroke-ui-tinta-2',
    relleno: apagado ? 'fill-ui-fantasma' : 'fill-ui-tinta-2',
    chip: apagado ? 'fill-none stroke-ui-fantasma [stroke-dasharray:3_3]' : 'fill-ui-tinta',
  };
}

export function PlacaPi4({ apagado = false, className = '' }: { apagado?: boolean; className?: string }) {
  const { linea, relleno, chip } = trazos(apagado);
  return (
    <svg viewBox="-2 -2 262 182" className={`block overflow-visible ${className}`} strokeWidth={1.25} role="img" aria-label="Raspberry Pi 4">
      <rect width={250} height={168} rx={10} className={linea} />
      {[[12, 12], [188, 12], [12, 156], [188, 156]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r={4} className={linea} />)}
      {Array.from({ length: 40 }, (_, i) => <rect key={i} x={30 + (i % 20) * 7.4} y={6 + Math.floor(i / 20) * 7} width={4} height={4} className={relleno} />)}
      <rect x={56} y={58} width={50} height={50} rx={3} className={chip} />
      <rect x={120} y={64} width={34} height={38} rx={2} className={linea} />
      <rect x={212} y={22} width={46} height={34} rx={2} className={linea} />
      <rect x={212} y={66} width={46} height={34} rx={2} className={linea} />
      <rect x={208} y={110} width={50} height={44} rx={2} className={linea} />
      <rect x={22} y={158} width={18} height={14} rx={2} className={linea} />
      <rect x={52} y={158} width={14} height={12} rx={2} className={linea} />
      <rect x={76} y={158} width={14} height={12} rx={2} className={linea} />
      <circle cx={128} cy={166} r={6} className={linea} />
    </svg>
  );
}

export function PlacaPi5({ apagado = false, className = '' }: { apagado?: boolean; className?: string }) {
  const { linea, chip } = trazos(apagado);
  return (
    <svg viewBox="-2 -2 182 118" className={`block overflow-visible ${className}`} strokeWidth={1.25} role="img" aria-label="Raspberry Pi 5">
      <rect width={170} height={114} rx={8} className={linea} />
      {Array.from({ length: 20 }, (_, i) => <rect key={i} x={18 + i * 6.6} y={5} width={3} height={3} className={linea} />)}
      <rect x={34} y={38} width={38} height={38} rx={3} className={chip} />
      <circle cx={102} cy={57} r={18} className={linea} />
      <circle cx={102} cy={57} r={5} className={linea} />
      <rect x={144} y={16} width={32} height={24} rx={2} className={linea} />
      <rect x={144} y={46} width={32} height={24} rx={2} className={linea} />
      <rect x={144} y={76} width={32} height={30} rx={2} className={linea} />
    </svg>
  );
}

export function PlacaJetson({ apagado = false, className = '' }: { apagado?: boolean; className?: string }) {
  const { linea, chip } = trazos(apagado);
  return (
    <svg viewBox="-2 -2 182 118" className={`block overflow-visible ${className}`} strokeWidth={1.25} role="img" aria-label="NVIDIA Jetson">
      <rect width={170} height={114} rx={8} className={linea} />
      <rect x={28} y={14} width={96} height={82} rx={4} className={linea} />
      {Array.from({ length: 9 }, (_, i) => <line key={i} x1={38 + i * 9.5} y1={22} x2={38 + i * 9.5} y2={88} className={linea} />)}
      <circle cx={76} cy={55} r={22} className={apagado ? linea : `${linea} !fill-ui-superficie`} />
      <circle cx={76} cy={55} r={6} className={chip} />
      <rect x={144} y={16} width={32} height={26} rx={2} className={linea} />
      <rect x={144} y={50} width={32} height={26} rx={2} className={linea} />
    </svg>
  );
}

/** Módulo de domótica: cuatro relés con sus bornes. `encendidos`: índices de los relés activos. */
export function ModuloDomotica({ apagado = false, encendidos = [], className = '' }: { apagado?: boolean; encendidos?: number[]; className?: string }) {
  const { linea, chip } = trazos(apagado);
  return (
    <svg viewBox="-2 -2 182 118" className={`block overflow-visible ${className}`} strokeWidth={1.25} role="img" aria-label="Módulo de domótica">
      <rect width={170} height={114} rx={8} className={linea} />
      {[0, 1, 2, 3].map((i) => {
        const x = 14 + i * 39;
        return (
          <g key={i}>
            <rect x={x} y={22} width={32} height={44} rx={3} className={encendidos.includes(i) ? chip : linea} />
            {[9, 23].map((dx) => (
              <g key={dx}>
                <circle cx={x + dx} cy={86} r={5} className={linea} />
                <line x1={x + dx - 3} y1={86} x2={x + dx + 3} y2={86} className={linea} />
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/** Una cámara; `sinVideo` la tacha con el color de crítico. */
export function Camara({ nombre, apagado = false, sinVideo = false }: { nombre: string; apagado?: boolean; sinVideo?: boolean }) {
  const { linea, relleno } = trazos(apagado);
  return (
    <figure className="m-0 flex flex-col items-center gap-1">
      <svg viewBox="-2 -2 68 42" className="block w-16 overflow-visible" strokeWidth={1.25} role="img" aria-label={nombre}>
        <rect width={64} height={38} rx={6} className={linea} />
        <circle cx={30} cy={19} r={12} className={linea} />
        <circle cx={30} cy={19} r={4} className={relleno} />
        <rect x={48} y={6} width={8} height={4} className={linea} />
        {sinVideo && <line x1={4} y1={34} x2={60} y2={4} className="stroke-ui-critico" strokeWidth={1.5} />}
      </svg>
      <figcaption className="font-ui-num text-[10px] text-ui-apagado">{nombre}</figcaption>
    </figure>
  );
}
