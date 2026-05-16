import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Terminal, Cpu, Monitor, ArrowRight } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// ── Terminal animation data ────────────────────────────────────────────────
const TERMINAL_LINES = [
  { delay: 0,    text: "$ remote-lab connect --session physics-lab-01", type: "cmd" },
  { delay: 900,  text: "  Autenticando usuario… OK",                    type: "info" },
  { delay: 1700, text: "  Estableciendo túnel SSH… OK",                 type: "info" },
  { delay: 2400, text: "✓ Conexión segura establecida",                  type: "ok" },
  { delay: 3100, text: "✓ Entorno de práctica cargado",                  type: "ok" },
  { delay: 3800, text: "✓ Listo — laboratorio activo",                   type: "ok" },
];

// ── Features ───────────────────────────────────────────────────────────────
const FEATURES = [
  {
    Icon: Terminal,
    title: "Terminal Nativa",
    body: "Experiencia de terminal completa directamente en el navegador. SSH, comandos reales, sin emulaciones artificiales.",
  },
  {
    Icon: Cpu,
    title: "Hardware Remoto",
    body: "Accede a equipos físicos reales. Raspberry Pi, Arduino, servidores de laboratorio — todo a un clic.",
  },
  {
    Icon: Monitor,
    title: "Escritorio Remoto",
    body: "Sesiones de escritorio gráfico con baja latencia. Trabaja con IDEs, osciloscopios virtuales y más.",
  },
];

// ── Academic programs ──────────────────────────────────────────────────────
const PROGRAMS = [
  "Ingeniería Electrónica",
  "Sistemas",
  "Mecatrónica",
  "Telecomunicaciones",
  "Física",
  "Química",
  "Biomédica",
  "Industrial",
];

// ── Terminal component ─────────────────────────────────────────────────────
function TerminalWindow() {
  const [lines, setLines] = useState<number[]>([]);

  useEffect(() => {
    const timers = TERMINAL_LINES.map((l, i) =>
      setTimeout(() => setLines((p) => [...p, i]), l.delay)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="w-full max-w-lg border border-border bg-surface font-mono text-xs shadow-glow-cyan">
      {/* title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-surface-2">
        <span className="w-2.5 h-2.5 rounded-full bg-danger/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-warning/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-success/70" />
        <span className="ml-3 text-muted tracking-widest uppercase text-[10px]">
          remote-lab — bash
        </span>
        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-cyan animate-border-pulse" />
      </div>
      {/* body */}
      <div className="p-5 space-y-2 min-h-[200px]">
        {TERMINAL_LINES.map((l, i) =>
          lines.includes(i) ? (
            <div key={i} className="animate-fade-in leading-relaxed">
              {l.type === "cmd"  && <span className="text-foreground">{l.text}</span>}
              {l.type === "info" && <span className="text-muted-foreground">{l.text}</span>}
              {l.type === "ok"   && <span style={{ color: "#00d2be" }}>{l.text}</span>}
            </div>
          ) : null
        )}
        {lines.length === TERMINAL_LINES.length && (
          <span className="inline-block w-2 h-4 bg-cyan/80 animate-blink" />
        )}
      </div>
    </div>
  );
}

// ── Main Hero ──────────────────────────────────────────────────────────────
export default function Hero() {
  const heroRef      = useRef<HTMLDivElement>(null);
  const eyebrowRef   = useRef<HTMLDivElement>(null);
  const h1Ref        = useRef<HTMLHeadingElement>(null);
  const subtitleRef  = useRef<HTMLParagraphElement>(null);
  const ctaRef       = useRef<HTMLDivElement>(null);
  const terminalRef  = useRef<HTMLDivElement>(null);
  const featuresRef  = useRef<HTMLDivElement>(null);
  const programsRef  = useRef<HTMLDivElement>(null);

  // ── Hero entrance (GSAP timeline) ───────────────────────────────────────
  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.fromTo(eyebrowRef.current,
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.6 }
      )
      .fromTo(h1Ref.current,
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.7 },
        "-=0.3"
      )
      .fromTo(subtitleRef.current,
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.6 },
        "-=0.4"
      )
      .fromTo(ctaRef.current,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.5 },
        "-=0.3"
      )
      .fromTo(terminalRef.current,
        { opacity: 0, x: 30 },
        { opacity: 1, x: 0, duration: 0.8, ease: "power2.out" },
        "-=0.7"
      );
    }, heroRef);

    return () => ctx.revert();
  }, []);

  // ── Features scroll reveal ───────────────────────────────────────────────
  useEffect(() => {
    const ctx = gsap.context(() => {
      const cards = featuresRef.current?.querySelectorAll(".feature-card");
      if (!cards) return;

      gsap.fromTo(
        cards,
        { opacity: 0, y: 40 },
        {
          opacity: 1, y: 0,
          duration: 0.65,
          stagger: 0.14,
          ease: "power3.out",
          scrollTrigger: {
            trigger: featuresRef.current,
            start: "top 82%",
          },
        }
      );
    }, featuresRef);

    return () => ctx.revert();
  }, []);

  // ── Programs scroll reveal ───────────────────────────────────────────────
  useEffect(() => {
    const ctx = gsap.context(() => {
      const badges = programsRef.current?.querySelectorAll(".program-badge");
      if (!badges) return;

      gsap.fromTo(
        badges,
        { opacity: 0, scale: 0.88 },
        {
          opacity: 1, scale: 1,
          duration: 0.45,
          stagger: 0.07,
          ease: "back.out(1.4)",
          scrollTrigger: {
            trigger: programsRef.current,
            start: "top 85%",
          },
        }
      );
    }, programsRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={heroRef}>
      {/* ── HERO SECTION ─────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col justify-center pt-24 pb-20 overflow-hidden">
        {/* Background radial glow from top */}
        <div className="absolute inset-0 bg-radial-dark pointer-events-none" />
        {/* Dot grid */}
        <div className="absolute inset-0 grid-bg pointer-events-none opacity-60" />

        <div className="relative max-w-6xl mx-auto px-6 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

            {/* Left — copy */}
            <div className="space-y-8">
              <div ref={eyebrowRef} style={{ opacity: 0 }}>
                <span className="inline-flex items-center gap-2 font-mono text-[10px] tracking-widest uppercase text-cyan border border-cyan/30 px-3 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan animate-border-pulse" />
                  Laboratorio Remoto — v1.0
                </span>
              </div>

              <h1
                ref={h1Ref}
                style={{ opacity: 0 }}
                className="text-4xl md:text-5xl lg:text-6xl font-black leading-[1.05] tracking-tight text-foreground"
              >
                Tu laboratorio,
                <br />
                <span style={{ color: "#00d2be" }}>donde quieras.</span>
              </h1>

              <p
                ref={subtitleRef}
                style={{ opacity: 0 }}
                className="text-muted-foreground text-base md:text-lg leading-relaxed max-w-md"
              >
                Conecta con equipos reales desde cualquier dispositivo. Practica con SSH,
                terminal nativa y escritorio remoto — sin instalar nada.
              </p>

              <div ref={ctaRef} style={{ opacity: 0 }} className="flex flex-wrap items-center gap-4">
                <Link
                  to="/descargar"
                  className="inline-flex items-center gap-2.5 px-6 py-3 bg-cyan text-background font-mono text-xs font-bold tracking-widest uppercase hover:bg-cyan-light transition-colors"
                >
                  <Download size={13} />
                  Descargar ahora
                </Link>
                <a
                  href="#caracteristicas"
                  className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground hover:text-foreground tracking-widest uppercase transition-colors group"
                >
                  ver más
                  <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
                </a>
              </div>
            </div>

            {/* Right — terminal */}
            <div ref={terminalRef} style={{ opacity: 0 }}>
              <TerminalWindow />
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES SECTION ─────────────────────────────────────────────── */}
      <section
        id="caracteristicas"
        className="relative py-24 border-t border-border overflow-hidden"
      >
        <div className="absolute inset-0 bg-radial-bottom pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-6">
          <div className="mb-14">
            <p className="font-mono text-[10px] tracking-widest uppercase text-cyan mb-3">
              Capacidades
            </p>
            <h2 className="text-2xl md:text-3xl font-black text-foreground tracking-tight">
              Todo lo que necesitas
              <br />
              para practicar de verdad.
            </h2>
          </div>

          <div
            ref={featuresRef}
            className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border"
          >
            {FEATURES.map(({ Icon, title, body }) => (
              <div
                key={title}
                className="feature-card bg-surface p-8 flex flex-col gap-5 hover:bg-surface-2 transition-colors duration-300 group"
              >
                <div className="w-10 h-10 border border-cyan/30 flex items-center justify-center group-hover:border-cyan/60 group-hover:shadow-glow-cyan transition-all duration-300">
                  <Icon size={18} className="text-cyan" strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="font-mono text-sm font-bold text-foreground mb-2">{title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section className="py-24 border-t border-border">
        <div className="max-w-6xl mx-auto px-6">
          <div className="mb-14">
            <p className="font-mono text-[10px] tracking-widest uppercase text-cyan mb-3">
              Flujo de trabajo
            </p>
            <h2 className="text-2xl md:text-3xl font-black text-foreground tracking-tight">
              Tres pasos para
              <br />
              empezar a practicar.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              {
                num: "01",
                title: "Descarga el cliente",
                body: "Instala la aplicación en Windows o Linux. Ligera, rápida, sin dependencias extras.",
              },
              {
                num: "02",
                title: "Elige tu práctica",
                body: "Selecciona el laboratorio y la sesión asignada por tu docente desde el catálogo académico.",
              },
              {
                num: "03",
                title: "Conéctate y trabaja",
                body: "Accede al equipo remoto con terminal SSH, SFTP o escritorio gráfico según requiera tu práctica.",
              },
            ].map(({ num, title, body }) => (
              <div key={num} className="relative pl-8 border-l border-border hover:border-cyan/40 transition-colors duration-300">
                <span className="font-mono text-[10px] tracking-widest uppercase text-cyan block mb-3">
                  {num}
                </span>
                <h3 className="font-mono text-sm font-bold text-foreground mb-2">{title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ACADEMIC PROGRAMS ────────────────────────────────────────────── */}
      <section className="py-24 border-t border-border bg-surface">
        <div className="max-w-6xl mx-auto px-6">
          <div className="mb-10">
            <p className="font-mono text-[10px] tracking-widest uppercase text-cyan mb-3">
              Programas académicos
            </p>
            <h2 className="text-2xl md:text-3xl font-black text-foreground tracking-tight">
              Diseñado para múltiples
              <br />
              disciplinas de ingeniería.
            </h2>
          </div>

          <div ref={programsRef} className="flex flex-wrap gap-3">
            {PROGRAMS.map((p) => (
              <span
                key={p}
                className="program-badge font-mono text-xs tracking-wide text-muted-foreground border border-border px-4 py-2 hover:border-cyan/40 hover:text-foreground transition-colors duration-200"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA ───────────────────────────────────────────────────── */}
      <section className="py-28 border-t border-border relative overflow-hidden">
        <div className="absolute inset-0 bg-radial-dark pointer-events-none opacity-50" />
        <div className="relative max-w-6xl mx-auto px-6 text-center">
          <p className="font-mono text-[10px] tracking-widest uppercase text-cyan mb-5">
            Empieza hoy
          </p>
          <h2 className="text-3xl md:text-5xl font-black text-foreground tracking-tight mb-6">
            El laboratorio que
            <br />
            <span style={{ color: "#00d2be" }}>no cierra nunca.</span>
          </h2>
          <p className="text-muted-foreground text-base max-w-md mx-auto mb-10">
            Disponible las 24 horas para estudiantes, profesores y laboratoristas.
            Sin restricciones de horario ni de ubicación.
          </p>
          <Link
            to="/descargar"
            className="inline-flex items-center gap-3 px-8 py-3.5 bg-cyan text-background font-mono text-sm font-bold tracking-widest uppercase hover:bg-cyan-light transition-colors shadow-glow-cyan"
          >
            <Download size={15} />
            Descargar cliente
          </Link>
        </div>
      </section>
    </div>
  );
}
