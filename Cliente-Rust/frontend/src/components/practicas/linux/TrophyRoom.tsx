// components/practicas/linux/TrophyRoom.tsx
//
// "Sala de trofeos" del Perfil: lista los 4 rangos de la práctica de Linux
// (ver services/badges.service.ts, RANKS) -- ganados (insignia sólida +
// fecha), bloqueados (el módulo existe pero todavía no se completó) o
// "próximamente" (el módulo todavía no existe en la Pi). Sin Mantine
// `Badge` -- tarjetas propias, mismo criterio que el resto de bloques de la
// práctica de Linux (ver BlockRenderer.tsx).
import React from 'react';
import { RANKS, useEarnedBadges } from '../../../services/badges.service';
import './TrophyRoom.css';

function ShieldIcon({ locked }: { locked: boolean }) {
  return (
    <svg viewBox="0 0 44 50" className="tr-shield" aria-hidden="true">
      <path
        d="M22 2 L40 10 V24 C40 36 32 45 22 48 C12 45 4 36 4 24 V10 Z"
        fill={locked ? 'transparent' : 'var(--tr-shield-fill)'}
        stroke={locked ? 'var(--tr-locked-stroke)' : 'var(--tr-shield-stroke)'}
        strokeWidth="2"
        strokeDasharray={locked ? '4 3' : undefined}
      />
      {!locked && (
        <path
          d="M14 24.5 L19.5 30 L30 17.5"
          fill="none"
          stroke="var(--tr-shield-stroke)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

function formatEarnedDate(ts: number): string {
  return new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const TrophyRoom: React.FC = () => {
  const earned = useEarnedBadges();

  return (
    <div className="tr-grid">
      {RANKS.map((rank) => {
        const earnedBadge = rank.moduleId ? earned[rank.moduleId] : undefined;
        const isEarned = !!earnedBadge;
        const isAvailable = !!rank.moduleId;

        return (
          <div key={rank.id} className={`tr-stand ${isEarned ? 'tr-stand--earned' : ''}`}>
            <ShieldIcon locked={!isEarned} />
            <div className="tr-stand-title">{rank.title}</div>
            <p className="tr-stand-desc">{rank.description}</p>
            {isEarned && earnedBadge ? (
              <div className="tr-stand-status tr-stand-status--earned">
                Ganada el {formatEarnedDate(earnedBadge.earnedAt)}
              </div>
            ) : isAvailable ? (
              <div className="tr-stand-status">Completá el módulo correspondiente para desbloquearla</div>
            ) : (
              <div className="tr-stand-status tr-stand-status--soon">Próximamente</div>
            )}
          </div>
        );
      })}
    </div>
  );
};
