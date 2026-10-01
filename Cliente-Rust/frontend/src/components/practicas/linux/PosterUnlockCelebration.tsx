// components/practicas/linux/PosterUnlockCelebration.tsx
//
// Pantalla de "póster premio" desbloqueado -- se muestra DESPUÉS de
// ModuleCompleteCelebration cuando el módulo completado tiene un póster
// asociado (ver services/posters.service.ts, POSTERS). A propósito tiene un
// lenguaje visual DISTINTO al de la insignia (pedido explícito): acá no gira
// ninguna medalla -- el póster real se "desenrolla" como un pergamino, con
// rayos de luz cálidos de fondo en vez de confeti/fuegos artificiales.
//
// Estilos en Tailwind inline (mismo criterio que el resto del proyecto,
// keyframes compartidos en tailwind.config.js) -- lo único animado fuera de
// GSAP son el fondo (rayos) y la entrada del modal, con `motion-reduce:`
// para respetar prefers-reduced-motion sin un media query a mano.
import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import type { PosterDef } from '../../../services/posters.service';
import { linuxGetMedia } from '../../../services/linuxPractice.service';

const RAY_COUNT = 10;

interface PosterUnlockCelebrationProps {
  poster: PosterDef;
  onClose: () => void;
  onDownload: () => void;
  downloading?: boolean;
  downloadDone?: boolean;
}

export const PosterUnlockCelebration: React.FC<PosterUnlockCelebrationProps> = ({
  poster,
  onClose,
  onDownload,
  downloading = false,
  downloadDone = false,
}) => {
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Con suerte ya está en la caché de linuxGetMedia (el bloque bonus del
    // chat la pidió antes, ver linuxPractice.service.ts) -- esto no vuelve a
    // bajar el archivo, solo reusa esa promesa.
    linuxGetMedia(poster.practiceId, poster.mediaPath)
      .then((media) => { if (!cancelled) setImgUrl(`data:${media.mime};base64,${media.base64}`); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [poster.practiceId, poster.mediaPath]);

  const rays = React.useMemo(
    () => Array.from({ length: RAY_COUNT }).map((_, i) => (i / RAY_COUNT) * 360),
    [],
  );

  const stageRef = useRef<HTMLDivElement>(null);
  const imageWrapRef = useRef<HTMLDivElement>(null);
  const shineRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Coreografía: el pergamino se desenrolla (scaleY 0 -> 1, desde arriba) ->
  // brillo cruza la imagen ya revelada -> título/acciones aparecen. Espera a
  // tener la imagen real antes de animar (si tarda, no hay nada que
  // desenrollar todavía). `prefers-reduced-motion`: salta directo al estado final.
  useEffect(() => {
    if (!imgUrl) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const els = {
      imageWrap: imageWrapRef.current,
      shine: shineRef.current,
      details: detailsRef.current,
      actions: actionsRef.current,
    };
    if (reduceMotion || !els.imageWrap) {
      gsap.set([els.details, els.actions].filter(Boolean), { opacity: 1, y: 0 });
      if (els.imageWrap) gsap.set(els.imageWrap, { scaleY: 1 });
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      tl.set(els.imageWrap, { scaleY: 0.03 })
        .set([els.details, els.actions], { opacity: 0, y: 10 })
        .set(els.shine, { opacity: 0, xPercent: -130 })
        // 1) el pergamino se desenrolla desde el rodillo de arriba
        .to(els.imageWrap, { scaleY: 1, duration: 1.05, ease: 'power2.inOut' }, 0.1)
        // 2) brillo cruza la imagen ya revelada
        .to(els.shine, { opacity: 0.5, xPercent: 130, duration: 0.7, ease: 'power1.inOut' }, 1.05)
        .to(els.shine, { opacity: 0, duration: 0.2 }, 1.65)
        // 3) título + acciones
        .to(els.details, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }, 1.35)
        .to(els.actions, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }, 1.55);
    }, stageRef);

    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgUrl]);

  return (
    <div
      className="animate-fadeIn motion-reduce:animate-none fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[rgba(20,14,4,0.72)] backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Póster desbloqueado"
    >
      {/* Ambiente cálido (rayos de luz), a propósito distinto del confeti/fuegos de la insignia */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
        <div className="animate-spinSlow motion-reduce:animate-none relative h-[140vmax] w-[140vmax]">
          {rays.map((deg, i) => (
            <span
              key={i}
              className="absolute left-1/2 top-1/2 h-1/2 w-0.5 origin-top bg-[linear-gradient(to_bottom,rgba(247,205,61,0.22),transparent_70%)]"
              style={{ transform: `rotate(${deg}deg)` }}
            />
          ))}
        </div>
      </div>

      <div
        className="animate-popIn motion-reduce:animate-none relative flex min-w-[320px] max-w-[420px] flex-col items-center gap-1 rounded-[20px] border px-10 pb-[34px] pt-7 text-center shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
        style={{ background: 'var(--background-secondary, #1e2030)', borderColor: 'var(--border-subtle, rgba(255,255,255,0.1))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2.5 flex w-full justify-center" ref={stageRef}>
          <div className="flex w-[220px] flex-col items-center">
            <div
              aria-hidden="true"
              className="z-[1] -mb-1 h-3 w-full flex-shrink-0 rounded-[7px] bg-[linear-gradient(180deg,#f7cd3d,#b9881a)] shadow-[0_2px_4px_rgba(0,0,0,0.3)]"
            />
            <div
              ref={imageWrapRef}
              className="relative h-60 w-full origin-top overflow-hidden bg-[#f4ead0] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)]"
            >
              {imgUrl ? (
                <img src={imgUrl} alt={poster.title} className="block h-full w-full object-contain" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-black/50">
                  Desenrollando…
                </div>
              )}
              <div
                ref={shineRef}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_40%,rgba(255,255,255,0.65)_50%,transparent_60%)]"
              />
            </div>
            <div
              aria-hidden="true"
              className="z-[1] -mt-1 h-3 w-full flex-shrink-0 rounded-[7px] bg-[linear-gradient(180deg,#f7cd3d,#b9881a)] shadow-[0_2px_4px_rgba(0,0,0,0.3)]"
            />
          </div>
        </div>

        <div ref={detailsRef}>
          <div className="mt-1.5 text-[11.5px] font-bold uppercase tracking-[0.08em] text-[#f7cd3d]">Póster desbloqueado</div>
          <h2 className="mb-1.5 mt-0.5 text-lg font-extrabold" style={{ color: 'var(--text-primary, #f0f0f0)' }}>{poster.title}</h2>
          <p className="m-0 text-[13px]" style={{ color: 'var(--text-secondary, #9ca3af)' }}>{poster.description}</p>
        </div>

        <div ref={actionsRef} className="mt-[18px] flex flex-col items-center gap-2.5">
          <p className="m-0 max-w-[320px] text-xs" style={{ color: 'var(--text-secondary, #9ca3af)' }}>
            {downloadDone
              ? 'Guardado en tu computadora. También lo podés ver cuando quieras en tu Sala de Trofeos, en tu Perfil.'
              : 'Ya lo podés ver cuando quieras en tu Sala de Trofeos, en tu Perfil — o descargarlo ahora.'}
          </p>
          <div className="flex gap-2.5">
            <button
              className="rounded-[10px] border-[1.5px] border-[#f7cd3d] bg-transparent px-[22px] py-2.5 text-sm font-bold text-[#f7cd3d] transition hover:brightness-110 active:scale-[0.97] disabled:cursor-default disabled:opacity-50"
              onClick={onDownload}
              disabled={downloading || !imgUrl}
            >
              {downloading ? 'Guardando…' : downloadDone ? 'Descargar de nuevo' : 'Descargar'}
            </button>
            <button
              className="rounded-[10px] bg-[#f7cd3d] px-[22px] py-2.5 text-sm font-bold text-[#2a2004] transition hover:brightness-110 active:scale-[0.97]"
              onClick={onClose}
              autoFocus
            >
              Genial
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
