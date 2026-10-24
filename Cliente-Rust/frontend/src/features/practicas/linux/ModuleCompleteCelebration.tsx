// features/practicas/linux/ModuleCompleteCelebration.tsx
//
// Pantalla de cierre de un módulo de la práctica de Linux: fuegos
// artificiales + confeti de ambiente mientras la insignia gira, "carga" (el
// anillo se completa + destello) y cae sobre su pedestal. Coreografiado con la
// API de animaciones del navegador (element.animate). Se muestra una única vez
// por módulo -- ver `markModuleBadgeEarned` en features/practicas/badges.service.ts,
// misma fuente de verdad que lee la sección de insignias del Perfil.
//
// Estilos en Tailwind inline (mismo criterio que el resto del proyecto,
// keyframes compartidos en tailwind.config.js) -- lo animado con CSS
// (ambiente de fondo + entrada del modal) usa `motion-reduce:` para
// respetar prefers-reduced-motion sin un media query a mano.
import React, { useEffect, useMemo, useRef } from 'react';
import { RANKS, rankForModule } from '../badges.service';
import { MedalIcon } from './MedalIcon';
import EnvioMoodlePanel from '@/features/cursos/EnvioMoodlePanel';
import { celebracion } from '@/features/cursos/envioMoodle';

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

  // Mientras el modal está abierto, el aviso flotante de Moodle espera: el envío va dentro de este modal.
  useEffect(() => {
    celebracion.abrir();
    return () => celebracion.cerrar();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Coreografía: entra -> gira mientras el anillo se "carga" -> destello al
  // completarse -> cae sobre el pedestal con rebote -> chispas de aterrizaje
  // -> texto y acciones aparecen. Con la API de animaciones del navegador
  // (element.animate): `scale`, `translate` y `rotate` son propiedades aparte,
  // así que la entrada, el giro y la caída se suman sin pisarse.
  // `prefers-reduced-motion`: salta directo al estado final, sin nada de esto.
  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const badge = badgeRef.current;
    const ring = ringRef.current;
    const glow = glowRef.current;
    const textos = [detailsRef.current, actionsRef.current].filter(Boolean) as HTMLElement[];
    const chispas = sparksRef.current.filter(Boolean) as HTMLSpanElement[];
    if (reduceMotion || !badge || !ring) {
      textos.forEach((el) => { el.style.opacity = '1'; });
      if (badge) { badge.style.scale = '0.88'; badge.style.translate = '0 38px'; }
      if (ring) ring.style.strokeDashoffset = '0';
      return;
    }

    // las curvas de antes (GSAP), en cubic-bezier
    const ENTRA_CON_REBOTE = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
    const ATERRIZA = 'cubic-bezier(0.34, 1.9, 0.64, 1)';
    const SUAVE = 'cubic-bezier(0.45, 0, 0.55, 1)';
    const ACELERA = 'cubic-bezier(0.55, 0, 1, 0.45)';
    const FRENA = 'cubic-bezier(0.33, 1, 0.68, 1)';
    const animaciones: Animation[] = [];
    const animar = (el: Element, cuadros: Keyframe[], delay: number, duration: number, easing: string, fill: FillMode = 'both') =>
      animaciones.push(el.animate(cuadros, { delay, duration, easing, fill }));

    // 1) entra y arranca a girar mientras "carga"
    animar(badge, [{ opacity: 0, scale: '0' }, { opacity: 1, scale: '1' }], 50, 450, ENTRA_CON_REBOTE);
    animar(badge, [{ rotate: 'y 0deg' }, { rotate: 'y 1080deg' }], 50, 1500, SUAVE);
    animar(ring, [{ strokeDashoffset: RING_CIRCUMFERENCE }, { strokeDashoffset: 0 }], 150, 1300, SUAVE);
    // 2) destello al completarse la carga
    if (glow) {
      animar(glow, [
        { opacity: 0, scale: '1', easing: FRENA },
        { opacity: 0.9, scale: '1.5', offset: 0.3, easing: ACELERA },
        { opacity: 0, scale: '1.5' },
      ], 1450, 730, 'linear');
    }
    // 3) cae sobre el pedestal, con un rebote de aterrizaje (sin relleno hacia atrás: antes de empezar manda la entrada)
    animar(badge, [{ scale: '1', translate: '0 0' }, { scale: '0.82', translate: '0 44px' }], 1750, 360, ACELERA, 'forwards');
    animar(badge, [{ scale: '0.82', translate: '0 44px' }, { scale: '0.88', translate: '0 38px' }], 2110, 200, ATERRIZA, 'forwards');
    // 4) chispas de aterrizaje (fuegos artificiales puntuales, no confeti); antes de salir quedan invisibles (opacity-0)
    chispas.forEach((el, i) => {
      const x = Math.cos(sparks[i].angle) * 58;
      const y = Math.sin(sparks[i].angle) * 58 - 8;
      animar(el, [{ opacity: 1, translate: '0 0', scale: '0.5' }, { opacity: 0, translate: `${x}px ${y}px`, scale: '1' }], 2100, 550, FRENA, 'forwards');
    });
    // 5) título/insignia + acciones
    textos.forEach((el, i) => {
      animar(el, [{ opacity: 0, translate: '0 10px' }, { opacity: 1, translate: '0 0' }], i ? 2550 : 2350, i ? 350 : 400, FRENA);
    });

    return () => animaciones.forEach((a) => a.cancel());
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
        <div className="relative flex h-[176px] w-full flex-col items-center justify-end [perspective:700px]">
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
            Ya la puedes ver en tu Perfil.
          </p>
          {/* Si la práctica tiene tarea en Moodle, aquí se ofrece enviarla (con el registro de la sesión). Si no, no se ve nada. */}
          <EnvioMoodlePanel
            resultado={{
              practice_id: moduleId,
              total_points: totalPoints,
              earned_points: earnedPoints,
              percentage: totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 100,
              passed: true,
            }}
          />
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
