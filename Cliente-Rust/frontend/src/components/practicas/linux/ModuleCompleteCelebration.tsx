// components/practicas/linux/ModuleCompleteCelebration.tsx
//
// Pantalla de cierre de un módulo de la práctica de Linux: fuegos
// artificiales + confeti de ambiente mientras la insignia gira, "carga" (el
// anillo se completa + destello) y cae sobre su pedestal. Coreografiado con
// GSAP (misma librería que ya anima tabs/sidebar en el resto de la app, ver
// App.tsx / SessionTabs.tsx). Se muestra una única vez por módulo -- ver
// `markModuleBadgeEarned` en services/badges.service.ts, misma fuente de
// verdad que lee la Sala de Trofeos del Perfil.
//
// Estilos en Tailwind inline (mismo criterio que el resto del proyecto,
// keyframes compartidos en tailwind.config.js) -- lo único animado fuera de
// GSAP (ambiente de fondo + entrada del modal) usa `motion-reduce:` para
// respetar prefers-reduced-motion sin un media query a mano.
import React, { useEffect, useMemo, useRef } from 'react';
import { gsap } from 'gsap';
import { RANKS, rankForModule } from '../../../services/badges.service';
import { MedalIcon } from './MedalIcon';

const RING_RADIUS = 42;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const CONFETTI_COLORS = ['#E21F19', '#F7CD3D', '#2B6E6E', '#6B4FA0', '#FFFFFF'];
const SPARK_COLORS = ['#F7CD3D', '#E21F19', '#FFFFFF'];
const SPARK_COUNT = 12;
const MEDAL_RING = '#e21f19';
const MEDAL_DISC = '#f7cd3d';
const STAND_STROKE = '#f7cd3d';

const FIREWORKS = [
  { left: '18%', top: '28%', delay: '0.1s' },
  { left: '82%', top: '22%', delay: '0.9s' },
  { left: '50%', top: '15%', delay: '1.6s' },
];

function Firework({ left, top, delay }: { left: string; top: string; delay: string }) {
  return (
    <span className="absolute h-2.5 w-2.5" style={{ left, top }}>
      <span
        className="animate-fireworkRing motion-reduce:animate-none absolute inset-0 rounded-full border-2 border-[#f7cd3d] opacity-0 [transform:scale(0)]"
        style={{ animationDelay: delay }}
      />
      <span
        className="animate-fireworkRing motion-reduce:animate-none absolute inset-0 rounded-full border-2 border-[#e21f19] opacity-0 [transform:scale(0)]"
        style={{ animationDelay: `calc(${delay} + 0.15s)` }}
      />
    </span>
  );
}

interface ModuleCompleteCelebrationProps {
  moduleId: string;
  moduleTitle?: string;
  earnedPoints: number;
  totalPoints: number;
  onClose: () => void;
}

export const ModuleCompleteCelebration: React.FC<ModuleCompleteCelebrationProps> = ({
  moduleId,
  moduleTitle,
  earnedPoints,
  totalPoints,
  onClose,
}) => {
  // AiMessageBubble solo monta esto si el módulo tiene insignia; RANKS[0] es solo red de seguridad.
  const rank = rankForModule(moduleId) ?? RANKS[0];

  const stageRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const sparksRef = useRef<(HTMLSpanElement | null)[]>([]);
  const detailsRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  const confetti = useMemo(
    () =>
      Array.from({ length: 22 }).map((_, i) => ({
        left: Math.random() * 100,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 6 + Math.random() * 8,
        delay: Math.random() * 0.6,
        duration: 2.4 + Math.random() * 1.3,
        rotate: Math.random() * 360,
      })),
    [],
  );

  const sparks = useMemo(
    () =>
      Array.from({ length: SPARK_COUNT }).map((_, i) => ({
        angle: (i / SPARK_COUNT) * Math.PI * 2,
        color: SPARK_COLORS[i % SPARK_COLORS.length],
      })),
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Coreografía: entra -> gira mientras el anillo se "carga" -> destello al
  // completarse -> cae sobre el pedestal con rebote -> chispas de aterrizaje
  // -> texto y acciones aparecen. `prefers-reduced-motion`: salta directo al
  // estado final, sin nada de esto.
  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const els = {
      badge: badgeRef.current,
      ring: ringRef.current,
      glow: glowRef.current,
      details: detailsRef.current,
      actions: actionsRef.current,
      sparks: sparksRef.current.filter(Boolean) as HTMLSpanElement[],
    };
    if (reduceMotion || !els.badge || !els.ring) {
      gsap.set([els.details, els.actions].filter(Boolean), { opacity: 1, y: 0 });
      if (els.badge) gsap.set(els.badge, { opacity: 1, scale: 0.88, y: 38, rotateY: 0 });
      if (els.ring) gsap.set(els.ring, { strokeDashoffset: 0 });
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline();

      tl.set(els.badge, { scale: 0, opacity: 0, rotateY: 0, y: 0 })
        .set(els.ring, { strokeDashoffset: RING_CIRCUMFERENCE })
        .set([els.details, els.actions], { opacity: 0, y: 10 })
        .set(els.sparks, { opacity: 0, x: 0, y: 0, scale: 0.5 })
        // 1) entra y arranca a girar mientras "carga"
        .to(els.badge, { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(2)' }, 0.05)
        .to(els.badge, { rotateY: 1080, duration: 1.5, ease: 'power2.inOut' }, 0.05)
        .to(els.ring, { strokeDashoffset: 0, duration: 1.3, ease: 'power1.inOut' }, 0.15)
        // 2) destello al completarse la carga
        .to(els.glow, { opacity: 0.9, scale: 1.5, duration: 0.22, ease: 'power2.out' }, 1.45)
        .to(els.glow, { opacity: 0, duration: 0.5, ease: 'power2.in' }, 1.68)
        // 3) cae sobre el pedestal, con un rebote de aterrizaje
        .to(els.badge, { y: 44, scale: 0.82, duration: 0.36, ease: 'power2.in' }, 1.75)
        .to(els.badge, { y: 38, scale: 0.88, duration: 0.2, ease: 'back.out(3)' }, 2.11)
        // 4) chispas de aterrizaje (fuegos artificiales puntuales, no confeti)
        .set(els.sparks, { opacity: 1 }, 2.1)
        .to(
          els.sparks,
          {
            opacity: 0,
            x: (i: number) => Math.cos(sparks[i].angle) * 58,
            y: (i: number) => Math.sin(sparks[i].angle) * 58 - 8,
            scale: 1,
            duration: 0.55,
            ease: 'power2.out',
          },
          2.1,
        )
        // 5) título/insignia + acciones
        .to(els.details, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }, 2.35)
        .to(els.actions, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }, 2.55);
    }, stageRef);

    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="animate-fadeIn motion-reduce:animate-none fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[rgba(10,8,6,0.72)] backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Módulo completo"
    >
      {/* Ambiente: confeti cayendo + fuegos artificiales de fondo, corren todo el tiempo que el modal está abierto */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {confetti.map((c, i) => (
          <span
            key={`c-${i}`}
            className="animate-confettiFall motion-reduce:animate-none absolute -top-[5%] rounded-[1px] opacity-95"
            style={{
              left: `${c.left}%`,
              width: c.size,
              height: c.size * 0.4,
              background: c.color,
              animationDelay: `${c.delay}s`,
              animationDuration: `${c.duration}s`,
              transform: `rotate(${c.rotate}deg)`,
            }}
          />
        ))}
        {FIREWORKS.map((f, i) => (
          <Firework key={i} {...f} />
        ))}
      </div>

      <div
        className="animate-popIn motion-reduce:animate-none relative flex min-w-[340px] max-w-[420px] flex-col items-center gap-1 rounded-[20px] border px-11 pb-[34px] pt-7 text-center shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
        style={{ background: 'var(--background-secondary, #1e2030)', borderColor: 'var(--border-subtle, rgba(255,255,255,0.1))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex h-[176px] w-full flex-col items-center justify-end [perspective:700px]" ref={stageRef}>
          <div
            ref={glowRef}
            className="pointer-events-none absolute top-[22px] h-[130px] w-[130px] rounded-full opacity-0 [background:radial-gradient(circle,rgba(247,205,61,0.9)_0%,rgba(247,205,61,0)_70%)] [mix-blend-mode:screen]"
          />

          <div ref={badgeRef} className="relative mb-1.5 h-[88px] w-[76px] [transform-style:preserve-3d]">
            <svg viewBox="0 0 100 100" className="absolute -inset-2 [transform:rotate(-90deg)]" aria-hidden="true">
              <circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="4" />
              <circle
                ref={ringRef}
                cx="50"
                cy="50"
                r={RING_RADIUS}
                fill="none"
                stroke="#f7cd3d"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                className="[filter:drop-shadow(0_0_4px_rgba(247,205,61,0.7))]"
              />
            </svg>
            <MedalIcon
              ringColor={MEDAL_RING}
              discColor={MEDAL_DISC}
              code={rank.code}
              className="absolute inset-1"
              ariaLabel={`Insignia: ${rank.title}`}
            />

            {sparks.map((s, i) => (
              <span
                key={i}
                ref={(el) => { sparksRef.current[i] = el; }}
                className="absolute left-1/2 top-1/2 -m-[3px] h-1.5 w-1.5 rounded-full opacity-0"
                style={{ background: s.color }}
              />
            ))}
          </div>

          <div className="w-[118px] text-[#f7cd3d]" aria-hidden="true">
            <svg viewBox="0 0 120 34" className="h-auto w-full">
              <path d="M20 4 H100 L112 30 H8 Z" fill="rgba(247,205,61,0.1)" stroke={STAND_STROKE} strokeWidth="1.5" />
              <line x1="30" y1="4" x2="30" y2="30" stroke={STAND_STROKE} strokeOpacity="0.4" />
              <line x1="90" y1="4" x2="90" y2="30" stroke={STAND_STROKE} strokeOpacity="0.4" />
            </svg>
          </div>
        </div>

        <div ref={detailsRef}>
          <div className="text-[11.5px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--text-secondary, #9ca3af)' }}>
            Insignia desbloqueada
          </div>
          <h2 className="mb-3 mt-0.5 text-[22px] font-extrabold text-[#e21f19]">{rank.title}</h2>
          <h3 className="mb-1.5 mt-0 text-base font-bold" style={{ color: 'var(--text-primary, #f0f0f0)' }}>
            ¡Completaste el {moduleTitle ?? 'módulo'}!
          </h3>
          <p className="m-0 text-[13.5px] [font-variant-numeric:tabular-nums]" style={{ color: 'var(--text-secondary, #9ca3af)' }}>
            {earnedPoints}/{totalPoints} pts — 100%
          </p>
        </div>

        <div ref={actionsRef} className="mt-[18px] flex flex-col items-center gap-2.5">
          <p className="m-0 text-xs" style={{ color: 'var(--text-secondary, #9ca3af)' }}>
            Ya la podés ver en tu Sala de Trofeos, en tu Perfil.
          </p>
          <button
            className="rounded-[10px] bg-[#e21f19] px-[34px] py-2.5 text-sm font-bold text-white transition hover:brightness-110 active:scale-[0.97]"
            onClick={onClose}
            autoFocus
          >
            Genial
          </button>
        </div>
      </div>
    </div>
  );
};
