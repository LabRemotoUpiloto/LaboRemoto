// components/practicas/badges/Insignia.tsx
//
// Marco común de toda insignia de práctica: disco de fondo + sombra +
// rotación, como un sello apoyado sobre la esquina de una tarjeta. Nunca se
// usa solo -- cada práctica tiene su propia insignia (ver insigniaRegistry.tsx)
// que envuelve este marco y le pasa SU contenido (ícono, color, código). Eso
// es lo que "hereda de Insignia": el marco es siempre el mismo, el contenido
// de adentro es polimórfico según la práctica.
//
// A propósito NO vive dentro de <Card> en PracticeCard.tsx -- Mantine le
// pone `overflow: hidden` a <Card> por defecto (para recortar los bordes de
// Card.Section), así que cualquier hijo posicionado para sobresalir de la
// esquina queda cortado. Esta insignia se renderiza como HERMANA de la
// card, dentro de un wrapper sin overflow, para quedar siempre completa y
// por encima, nunca recortada ni "metida" en la card.
import React from 'react';

interface InsigniaProps {
  /** Para el tooltip/aria-label -- qué insignia es, en texto plano. */
  label: string;
  /** Ícono/contenido específico de esta práctica. */
  children: React.ReactNode;
  /** Grados de inclinación -- cada insignia puede "estamparse" distinto. */
  rotation?: number;
}

export const Insignia: React.FC<InsigniaProps> = ({ label, children, rotation = -14 }) => (
  <div
    className="absolute flex items-center justify-center rounded-full"
    style={{
      top: -14,
      right: -14,
      width: 46,
      height: 46,
      background: 'var(--background-primary, #fff)',
      boxShadow: '0 3px 10px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.05)',
      transform: `rotate(${rotation}deg)`,
      zIndex: 10,
      pointerEvents: 'auto',
    }}
    role="img"
    aria-label={label}
    title={label}
  >
    {children}
  </div>
);
