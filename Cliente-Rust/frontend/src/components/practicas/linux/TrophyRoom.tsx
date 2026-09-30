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
import { MedalIcon } from './MedalIcon';
import './TrophyRoom.css';

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
            <MedalIcon
              locked={!isEarned}
              ringColor="var(--tr-medal-ring)"
              discColor="var(--tr-medal-disc)"
              code={rank.code}
              className="tr-medal"
            />
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
