// components/practicas/linux/TrophyRoom.tsx
//
// "Sala de trofeos" del Perfil: lista los rangos de la práctica de Linux
// (ver services/badges.service.ts, RANKS) -- ganados (insignia sólida +
// fecha), bloqueados (el módulo existe pero todavía no se completó) o
// "próximamente" (el módulo todavía no existe en la Pi). Sin Mantine
// `Badge` -- tarjetas propias, mismo criterio que el resto de bloques de la
// práctica de Linux (ver BlockRenderer.tsx). Estilos en Tailwind inline
// (mismo criterio que el resto del proyecto) -- nada de .css por componente.
//
// Además, una segunda sección con los "pósters premio" (ver
// services/posters.service.ts) -- coleccionables distintos de las
// insignias: una imagen real que el estudiante puede ver en grande y
// descargar cuando quiera, no una medalla de rango.
import React, { useEffect, useState } from 'react';
import { Download, Lock, X } from 'lucide-react';
import { RANKS, useEarnedBadges } from '../../../services/badges.service';
import { POSTERS, useUnlockedPosters, downloadPoster, type PosterDef } from '../../../services/posters.service';
import { linuxGetMedia } from '../../../services/linuxPractice.service';
import { MedalIcon } from './MedalIcon';
import { ZoomableImage } from './ZoomableImage';

const MEDAL_RING = '#e21f19';
const MEDAL_DISC = '#f7cd3d';

function formatEarnedDate(ts: number): string {
  return new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

function PosterThumb({ poster }: { poster: PosterDef }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    linuxGetMedia(poster.practiceId, poster.mediaPath)
      .then((media) => { if (!cancelled) setUrl(`data:${media.mime};base64,${media.base64}`); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [poster.practiceId, poster.mediaPath]);

  if (!url) {
    return <div className="aspect-[4/3] w-full animate-pulse rounded-lg bg-[#f4ead0]" aria-hidden="true" />;
  }
  return <img src={url} alt={poster.title} className="aspect-[4/3] w-full rounded-lg bg-[#f4ead0] object-cover" />;
}

function PosterViewer({ poster, onClose }: { poster: PosterDef; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    linuxGetMedia(poster.practiceId, poster.mediaPath)
      .then((media) => { if (!cancelled) setUrl(`data:${media.mime};base64,${media.base64}`); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [poster.practiceId, poster.mediaPath]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadPoster(poster);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="animate-fadeIn fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={poster.title}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl border shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
        style={{ background: 'var(--background-secondary, #1e2030)', borderColor: 'var(--border-subtle, rgba(255,255,255,0.1))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-3.5 py-3" style={{ borderColor: 'var(--border-subtle, rgba(255,255,255,0.1))' }}>
          <span className="text-[13.5px] font-bold" style={{ color: 'var(--text-primary, #f0f0f0)' }}>{poster.title}</span>
          <button className="flex p-1" style={{ color: 'var(--text-secondary, #9ca3af)' }} onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
        <div className="flex min-h-[320px] flex-1 items-center justify-center overflow-hidden bg-[#f4ead0]">
          {url ? <ZoomableImage src={url} alt={poster.title} /> : <div className="p-10 text-xs text-black/50">Cargando…</div>}
        </div>
        <div className="flex items-center justify-between gap-3 border-t px-3.5 py-2.5" style={{ borderColor: 'var(--border-subtle, rgba(255,255,255,0.1))' }}>
          <span className="text-[11px]" style={{ color: 'var(--text-secondary, #9ca3af)' }}>
            Rueda del mouse para acercar · arrastrar para mover · doble click para restablecer
          </span>
          <button
            className="flex items-center gap-1.5 rounded-lg bg-[#e21f19] px-4 py-2 text-[13px] font-bold text-white transition hover:brightness-110 disabled:cursor-default disabled:opacity-50"
            onClick={handleDownload}
            disabled={downloading || !url}
          >
            <Download size={14} />
            {downloading ? 'Guardando…' : 'Descargar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export const TrophyRoom: React.FC = () => {
  const earned = useEarnedBadges();
  const unlockedPosters = useUnlockedPosters();
  const [viewingPoster, setViewingPoster] = useState<PosterDef | null>(null);

  return (
    <div>
      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        {RANKS.map((rank) => {
          const earnedBadge = rank.moduleId ? earned[rank.moduleId] : undefined;
          const isEarned = !!earnedBadge;
          const isAvailable = !!rank.moduleId;

          return (
            <div
              key={rank.id}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 pb-3.5 pt-[18px] text-center transition-transform ${
                isEarned
                  ? 'border-[rgba(226,31,25,0.35)] bg-[linear-gradient(180deg,rgba(226,31,25,0.06),transparent_60%)] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(226,31,25,0.15)]'
                  : ''
              }`}
              style={!isEarned ? { borderColor: 'var(--border-subtle, rgba(255,255,255,0.1))', background: 'var(--background-primary, rgba(255,255,255,0.02))' } : undefined}
            >
              <MedalIcon
                locked={!isEarned}
                ringColor={MEDAL_RING}
                discColor={MEDAL_DISC}
                code={rank.code}
                className={`mb-0.5 h-12 w-12 ${isEarned ? '' : 'opacity-55 [color:var(--text-secondary,#6b7280)]'}`}
              />
              <div
                className="text-[13.5px] font-bold"
                style={{ color: isEarned ? 'var(--text-primary, #f0f0f0)' : 'var(--text-secondary, #9ca3af)' }}
              >
                {rank.title}
              </div>
              <p className="m-0 min-h-[30px] text-[11.5px] leading-tight" style={{ color: 'var(--text-secondary, #9ca3af)' }}>
                {rank.description}
              </p>
              {isEarned && earnedBadge ? (
                <div className="mt-1 text-[10.5px] font-semibold text-[#e21f19]">
                  Ganada el {formatEarnedDate(earnedBadge.earnedAt)}
                </div>
              ) : isAvailable ? (
                <div className="mt-1 text-[10.5px] font-semibold" style={{ color: 'var(--text-secondary, #9ca3af)' }}>
                  Completá el módulo correspondiente para desbloquearla
                </div>
              ) : (
                <div className="mt-1 text-[10.5px] font-semibold italic opacity-70" style={{ color: 'var(--text-secondary, #9ca3af)' }}>
                  Próximamente
                </div>
              )}
            </div>
          );
        })}
      </div>

      {POSTERS.length > 0 && (
        <div className="mt-6">
          <h4 className="mb-3 text-[13.5px] font-bold" style={{ color: 'var(--text-primary, #f0f0f0)' }}>Pósters</h4>
          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
            {POSTERS.map((poster) => {
              const unlocked = poster.id in unlockedPosters;
              return (
                <button
                  key={poster.id}
                  type="button"
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center transition-transform disabled:cursor-default ${
                    unlocked ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(247,205,61,0.18)]' : ''
                  }`}
                  style={{ borderColor: 'var(--border-subtle, rgba(255,255,255,0.1))', background: 'var(--background-primary, rgba(255,255,255,0.02))' }}
                  onClick={() => unlocked && setViewingPoster(poster)}
                  disabled={!unlocked}
                >
                  {unlocked ? (
                    <PosterThumb poster={poster} />
                  ) : (
                    <div
                      className="flex aspect-[4/3] w-full items-center justify-center rounded-lg opacity-60"
                      style={{ background: 'var(--background-secondary, rgba(255,255,255,0.04))', color: 'var(--text-secondary, #6b7280)' }}
                    >
                      <Lock size={20} />
                    </div>
                  )}
                  <span
                    className="text-[12.5px] font-bold"
                    style={{ color: unlocked ? 'var(--text-primary, #f0f0f0)' : 'var(--text-secondary, #9ca3af)' }}
                  >
                    {poster.title}
                  </span>
                  {!unlocked && (
                    <span className="text-[10.5px]" style={{ color: 'var(--text-secondary, #9ca3af)' }}>
                      Completá el módulo para desbloquearlo
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {viewingPoster && <PosterViewer poster={viewingPoster} onClose={() => setViewingPoster(null)} />}
    </div>
  );
};
