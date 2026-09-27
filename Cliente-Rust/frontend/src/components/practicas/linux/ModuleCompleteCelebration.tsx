// components/practicas/linux/ModuleCompleteCelebration.tsx
//
// Pantalla de cierre de un módulo de la práctica de Linux: fuegos
// artificiales + confeti de ambiente mientras la insignia gira, "carga" (el
// anillo se completa + destello) y cae sobre su pedestal. Coreografiado con
// GSAP (misma librería que ya anima tabs/sidebar en el resto de la app, ver
// App.tsx / SessionTabs.tsx). Se muestra una única vez por módulo -- ver
// `markModuleBadgeEarned` en services/badges.service.ts, misma fuente de
// verdad que lee la Sala de Trofeos del Perfil.
import React, { useEffect, useMemo, useRef } from 'react';
import { gsap } from 'gsap';
import { RANKS, rankForModule } from '../../../services/badges.service';
import './ModuleCompleteCelebration.css';

const RING_RADIUS = 42;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const CONFETTI_COLORS = ['#E21F19', '#F7CD3D', '#2B6E6E', '#6B4FA0', '#FFFFFF'];
const SPARK_COLORS = ['#F7CD3D', '#E21F19', '#FFFFFF'];
const SPARK_COUNT = 12;

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
    <div className="mcc-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Módulo completo">
      {/* Ambiente: confeti cayendo + fuegos artificiales de fondo, corren todo el tiempo que el modal está abierto */}
      <div className="mcc-ambient-layer" aria-hidden="true">
        {confetti.map((c, i) => (
          <span
            key={`c-${i}`}
            className="mcc-confetti-piece"
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
        <span className="mcc-firework" style={{ left: '18%', top: '28%', animationDelay: '0.1s' }} />
        <span className="mcc-firework" style={{ left: '82%', top: '22%', animationDelay: '0.9s' }} />
        <span className="mcc-firework" style={{ left: '50%', top: '15%', animationDelay: '1.6s' }} />
      </div>

      <div className="mcc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mcc-stage" ref={stageRef}>
          <div className="mcc-glow" ref={glowRef} />

          <div className="mcc-badge" ref={badgeRef}>
            <svg viewBox="0 0 100 100" className="mcc-ring-svg" aria-hidden="true">
              <circle cx="50" cy="50" r={RING_RADIUS} className="mcc-ring-track" />
              <circle
                ref={ringRef}
                cx="50"
                cy="50"
                r={RING_RADIUS}
                className="mcc-ring-fill"
                strokeDasharray={RING_CIRCUMFERENCE}
              />
            </svg>
            <svg viewBox="0 0 44 50" className="mcc-shield-svg" role="img" aria-label={`Insignia: ${rank.title}`}>
              <path
                d="M22 2 L40 10 V24 C40 36 32 45 22 48 C12 45 4 36 4 24 V10 Z"
                fill="var(--mcc-badge-fill)"
                stroke="var(--mcc-badge-stroke)"
                strokeWidth="2"
              />
              <path
                d="M14 24.5 L19.5 30 L30 17.5"
                fill="none"
                stroke="var(--mcc-badge-stroke)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            {sparks.map((s, i) => (
              <span
                key={i}
                ref={(el) => { sparksRef.current[i] = el; }}
                className="mcc-spark"
                style={{ background: s.color }}
              />
            ))}
          </div>

          <div className="mcc-stand" aria-hidden="true">
            <svg viewBox="0 0 120 34">
              <path d="M20 4 H100 L112 30 H8 Z" fill="var(--mcc-stand-fill)" stroke="var(--mcc-stand-stroke)" strokeWidth="1.5" />
              <line x1="30" y1="4" x2="30" y2="30" stroke="var(--mcc-stand-stroke)" strokeOpacity="0.4" />
              <line x1="90" y1="4" x2="90" y2="30" stroke="var(--mcc-stand-stroke)" strokeOpacity="0.4" />
            </svg>
          </div>
        </div>

        <div ref={detailsRef}>
          <div className="mcc-eyebrow">Insignia desbloqueada</div>
          <h2 className="mcc-rank">{rank.title}</h2>
          <h3 className="mcc-title">¡Completaste el {moduleTitle ?? 'módulo'}!</h3>
          <p className="mcc-score">
            {earnedPoints}/{totalPoints} pts — 100%
          </p>
        </div>

        <div ref={actionsRef} className="mcc-actions">
          <p className="mcc-hint">Ya la podés ver en tu Sala de Trofeos, en tu Perfil.</p>
          <button className="mcc-close-btn" onClick={onClose} autoFocus>
            Genial
          </button>
        </div>
      </div>
    </div>
  );
};
