// components/practicas/linux/MedalIcon.tsx
//
// Insignia de medalla real -- path de Phosphor Icons ("medal", peso
// duotone/fill; MIT, sin atribución requerida: https://github.com/phosphor-icons/core),
// no un escudo dibujado a mano. Dos capas de color (aro+cinta / disco
// central) para poder pintarlas distinto según ganada/bloqueada.
import React from 'react';

const RING_PATH =
  'M216,96A88,88,0,1,0,72,163.83V240a8,8,0,0,0,11.58,7.16L128,225l44.43,22.21A8.07,8.07,0,0,0,176,248a8,8,0,0,0,8-8V163.83A87.85,87.85,0,0,0,216,96ZM56,96a72,72,0,1,1,72,72A72.08,72.08,0,0,1,56,96ZM168,227.06l-36.43-18.21a8,8,0,0,0-7.16,0L88,227.06V174.37a87.89,87.89,0,0,0,80,0ZM128,152A56,56,0,1,0,72,96,56.06,56.06,0,0,0,128,152Zm0-96A40,40,0,1,1,88,96,40,40,0,0,1,128,56Z';
const DISC_PATH = 'M176,96a48,48,0,1,1-48-48A48,48,0,0,1,176,96Z';
const CHECK_PATH =
  'M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,1,1,17-17L96,183,215.51,63.51a12,12,0,0,1,17,17Z';

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
      </>
    )}
  </svg>
);
