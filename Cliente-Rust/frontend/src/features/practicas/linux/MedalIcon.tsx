// components/practicas/linux/MedalIcon.tsx
//
// Insignia de medalla real -- path de Phosphor Icons ("medal", peso
// duotone/fill; MIT, sin atribución requerida: https://github.com/phosphor-icons/core),
// no un escudo dibujado a mano. Dos capas de color (aro+cinta / disco
// central) para poder pintarlas distinto según ganada/bloqueada.
//
// `tier` (1, 2, 3...) arma una CADENA evolutiva entre módulos: cada nivel
// suma un elemento nuevo ENCIMA del anterior (nunca reemplaza nada), para
// que la serie de insignias se sienta como una progresión real en vez de
// "mismo ícono, código distinto". Tier 1 es la medalla tal cual ya existía
// (no cambia para nadie que ya la tenga ganada); tier 2 suma un resplandor
// radial detrás del aro; tier 3 además una estrella de logro arriba.
import React from 'react';

const RING_PATH =
  'M216,96A88,88,0,1,0,72,163.83V240a8,8,0,0,0,11.58,7.16L128,225l44.43,22.21A8.07,8.07,0,0,0,176,248a8,8,0,0,0,8-8V163.83A87.85,87.85,0,0,0,216,96ZM56,96a72,72,0,1,1,72,72A72.08,72.08,0,0,1,56,96ZM168,227.06l-36.43-18.21a8,8,0,0,0-7.16,0L88,227.06V174.37a87.89,87.89,0,0,0,80,0ZM128,152A56,56,0,1,0,72,96,56.06,56.06,0,0,0,128,152Zm0-96A40,40,0,1,1,88,96,40,40,0,0,1,128,56Z';
const DISC_PATH = 'M176,96a48,48,0,1,1-48-48A48,48,0,0,1,176,96Z';
const CHECK_PATH =
  'M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,1,1,17-17L96,183,215.51,63.51a12,12,0,0,1,17,17Z';

/** Polígono de puntas alternadas (radio largo/corto) centrado en (cx,cy) -- el resplandor del tier 2+. */
function burstPoints(cx: number, cy: number, spikes: number, rOuter: number, rInner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const angle = (Math.PI / spikes) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/** Estrella de 5 puntas centrada en (cx,cy) -- el topper del tier 3+. */
function starPoints(cx: number, cy: number, rOuter: number, rInner: number): string {
  return burstPoints(cx, cy, 5, rOuter, rInner);
}

interface MedalIconProps {
  locked?: boolean;
  ringColor?: string;
  discColor?: string;
  checkColor?: string;
  lockedColor?: string;
  showCheck?: boolean;
  /** Código corto de la práctica ganada (ej. "M1") -- si se pasa, reemplaza
   * el check genérico dentro del disco: la medalla queda ligada a QUÉ
   * práctica se ganó, no solo a "completaste algo". */
  code?: string;
  /** Nivel de evolución de la serie (default 1 = medalla simple, sin cambios
   * respecto a la versión original). 2 agrega resplandor radial, 3 agrega
   * además una estrella de logro arriba del aro. */
  tier?: 1 | 2 | 3;
  /** Color del resplandor (tier 2+); por defecto usa `ringColor` a menor opacidad. */
  burstColor?: string;
  /** Color de la estrella (tier 3+); por defecto usa `discColor`. */
  starColor?: string;
  className?: string;
  ariaLabel?: string;
}

export const MedalIcon: React.FC<MedalIconProps> = ({
  locked = false,
  ringColor = '#e21f19',
  discColor = '#f7cd3d',
  checkColor = '#fff',
  lockedColor = 'currentColor',
  showCheck = true,
  code,
  tier = 1,
  burstColor,
  starColor,
  className,
  ariaLabel,
}) => (
  <svg
    viewBox="0 0 256 256"
    className={className}
    role="img"
    aria-label={ariaLabel ?? (locked ? 'Insignia bloqueada' : code ? `Insignia ${code}` : 'Insignia')}
  >
    {locked ? (
      <path d={RING_PATH} fill="none" stroke={lockedColor} strokeWidth={5} strokeDasharray="8 7" opacity={0.5} />
    ) : (
      <>
        {tier >= 2 && (
          <polygon points={burstPoints(128, 96, 14, 122, 98)} fill={burstColor ?? ringColor} opacity={0.3} />
        )}
        <path d={RING_PATH} fill={ringColor} />
        <path d={DISC_PATH} fill={discColor} />
        {code ? (
          <text
            x="128"
            y="97"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={code.length > 2 ? 30 : 40}
            fontWeight={800}
            fontFamily="'Segoe UI', Arial, sans-serif"
            fill={checkColor}
          >
            {code}
          </text>
        ) : (
          showCheck && (
            <g transform="translate(128 96) scale(0.34) translate(-128 -128)">
              <path d={CHECK_PATH} fill={checkColor} />
            </g>
          )
        )}
        {tier >= 3 && (
          <polygon
            points={starPoints(128, 10, 18, 7)}
            fill={starColor ?? discColor}
            stroke={ringColor}
            strokeWidth={3}
            strokeLinejoin="round"
          />
        )}
      </>
    )}
  </svg>
);
