import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Terminal, Cpu, Monitor, Network, FolderOpen, ArrowRight } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// ── ASCII wordmark ─────────────────────────────────────────────────────────
const ASCII_LOGO = `
██╗      █████╗ ██████╗  ██████╗ ██████╗   █████╗ ████████╗ ██████╗ ██████╗ ██╗  ██████╗ 
██║     ██╔══██╗██╔══██╗██╔═══██╗██╔══██╗ ██╔══██╗╚══██╔══╝██╔═══██╗██╔══██╗██║ ██╔═══██╗
██║     ███████║██████╔╝ ██║   ██║██████╔╝ ███████║   ██║   ██║   ██║██████╔╝██║ ██║   ██║
██║     ██╔══██║██╔══██╗ ██║   ██║██╔══██╗ ██╔══██║   ██║   ██║   ██║██╔══██╗██║ ██║   ██║
███████╗██║  ██║██████╔╝ ╚██████╔╝██║  ██║ ██║  ██║   ██║   ╚██████╔╝██║  ██║██║ ╚██████╔╝
╚══════╝╚═╝  ╚═╝╚═════╝   ╚═════╝ ╚═╝  ╚═╝ ╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═════╝ 

██████╗ ███████╗███╗   ███╗ ██████╗ ████████╗ ██████╗ 
██╔══██╗██╔════╝████╗ ████║██╔═══██╗╚══██╔══╝██╔═══██╗
██████╔╝█████╗  ██╔████╔██║██║   ██║   ██║   ██║   ██║
██╔══██╗██╔══╝  ██║╚██╔╝██║██║   ██║   ██║   ██║   ██║
██║  ██║███████╗██║ ╚═╝ ██║╚██████╔╝   ██║   ╚██████╔╝
╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝ ╚═════╝    ╚═╝    ╚═════╝ 
`.trim();

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

// ── Bento grid items ───────────────────────────────────────────────────────
const BENTO_ITEMS = [
  {
    id: "b1",
    size: "md:col-span-2 md:row-span-2",
    Icon: Cpu,
    label: "Electrónica",
    title: "Ingeniería Electrónica",
    body: "Diseño de circuitos, microcontroladores y sistemas embebidos con acceso a hardware real.",
    accent: true,
  },
  {
    id: "b2",
    size: "col-span-1 row-span-1",
    Icon: Terminal,
    label: "Sistemas",
    title: "Ing. de Sistemas",
    body: "Redes, servidores Linux y bases de datos en entornos controlados.",
    accent: false,
  },
  {
    id: "b3",
    size: "col-span-1 row-span-1",
    Icon: Network,
    label: "Telecomunicaciones",
    title: "Telecomunicaciones",
    body: "Protocolos, antenas y simulación de redes de datos.",
    accent: false,
  },
  {
    id: "b4",
    size: "col-span-1 row-span-1",
    Icon: Monitor,
    label: "Mecatrónica",
    title: "Mecatrónica",
    body: "Control de actuadores, PLC y robótica remota.",
    accent: false,
  },
  {
    id: "b5",
    size: "col-span-1 md:col-span-2 lg:col-span-1 row-span-1",
    Icon: FolderOpen,
    label: "Más programas",
    title: "Física · Química · Biomédica",
    body: "Plataforma extensible para cualquier disciplina académica.",
    accent: false,
  },
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
  const asciiRef     = useRef<HTMLPreElement>(null);
  const splitRef     = useRef<HTMLDivElement>(null);
  const terminalRef  = useRef<HTMLDivElement>(null);
  const featuresRef  = useRef<HTMLDivElement>(null);
  const bentoRef     = useRef<HTMLDivElement>(null);

  // ── Hero entrance (GSAP timeline) ───────────────────────────────────────
  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.fromTo(asciiRef.current,
        { opacity: 0, y: 20 },
        { opacity: 0.85, y: 0, duration: 0.8 }
      )
      .fromTo(splitRef.current,
        { opacity: 0, y: 28 },
        { opacity: 1, y: 0, duration: 0.7 },
        "-=0.4"
      )
      .fromTo(terminalRef.current,
        { opacity: 0, x: 28 },
        { opacity: 1, x: 0, duration: 0.75, ease: "power2.out" },
        "-=0.55"
      );
    }, heroRef);

    return () => ctx.revert();
  }, []);

  // ── Features scroll reveal ───────────────────────────────────────────────
  useEffect(() => {
    const ctx = gsap.context(() => {
      const cards = featuresRef.current?.querySelectorAll(".feature-card");
      if (!cards) return;
      gsap.fromTo(cards,
        { opacity: 0, y: 40 },
        {
          opacity: 1, y: 0,
          duration: 0.65,
          stagger: 0.14,
          ease: "power3.out",
          scrollTrigger: { trigger: featuresRef.current, start: "top 82%" },
        }
      );
    }, featuresRef);
    return () => ctx.revert();
  }, []);

  // ── Bento scroll reveal ──────────────────────────────────────────────────
  useEffect(() => {
    const ctx = gsap.context(() => {
      const cards = bentoRef.current?.querySelectorAll(".bento-card");
      if (!cards) return;
      gsap.fromTo(cards,
        { opacity: 0, y: 80, scale: 0.9, rotateX: -10 },
        {
          opacity: 1, y: 0, scale: 1, rotateX: 0,
          duration: 1.2,
          stagger: 0.15,
          ease: "elastic.out(1, 0.8)",
          scrollTrigger: { trigger: bentoRef.current, start: "top 85%" },
        }
      );
    }, bentoRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={heroRef}>
      {/* ── HERO SECTION ─────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col justify-center pt-24 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-radial-dark pointer-events-none" />
        <div className="absolute inset-0 grid-bg pointer-events-none opacity-60" />

        <div className="relative max-w-6xl mx-auto px-6 w-full">
          {/* ASCII wordmark */}
          <pre
            ref={asciiRef}
            className="font-mono text-[5px] sm:text-[6.5px] md:text-[8px] leading-tight mb-14 select-none overflow-x-auto"
            style={{ color: "#00d2be", opacity: 0 }}
            aria-hidden="true"
          >
            {ASCII_LOGO}
          </pre>

          {/* Split: copy left, terminal right */}
          <div
            ref={splitRef}
            style={{ opacity: 0 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start"
          >
            {/* Left */}
            <div className="space-y-8">
              <div className="space-y-5">
                <p className="text-muted-foreground text-base leading-relaxed max-w-sm">
                  Plataforma de laboratorio remoto para estudiantes, profesores y
                  laboratoristas. Conexión real, prácticas reales — desde cualquier lugar.
                </p>
                <div className="flex items-center gap-6 text-[11px] font-mono text-muted tracking-widest uppercase">
                  <span>SSH nativo</span>
                  <span className="w-px h-3 bg-border" />
                  <span>SFTP</span>
                  <span className="w-px h-3 bg-border" />
                  <span>v1.0.0</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <Link
                  to="/descargar"
                  className="inline-flex items-center gap-2.5 px-6 py-3 bg-cyan text-background font-mono text-xs font-bold tracking-widest uppercase hover:bg-cyan-light transition-colors"
                >
                  <Download size={13} />
                  Descargar
                </Link>
                <a
                  href="#caracteristicas"
                  className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground hover:text-foreground tracking-widest uppercase transition-colors group"
                >
                  Ver más
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

          <div ref={featuresRef} className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border">
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
              <div
                key={num}
                className="relative pl-8 border-l border-border hover:border-cyan/40 transition-colors duration-300"
              >
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

      {/* ── BENTO GRID — ACADEMIC PROGRAMS ───────────────────────────────── */}
      <section className="py-24 border-t border-border bg-surface">
        <div className="max-w-6xl mx-auto px-6">
          <div className="mb-12">
            <p className="font-mono text-[10px] tracking-widest uppercase text-cyan mb-3">
              Programas académicos
            </p>
            <h2 className="text-2xl md:text-3xl font-black text-foreground tracking-tight">
              Diseñado para múltiples
              <br />
              disciplinas de ingeniería.
            </h2>
          </div>

          <div
            ref={bentoRef}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 grid-rows-[auto] gap-5 md:gap-6 [perspective:1000px]"
          >
            {BENTO_ITEMS.map(({ id, size, Icon, label, title, body, accent }) => (
              <div
                key={id}
                className={`bento-card ${size} bg-surface-2 p-6 md:p-8 flex flex-col justify-between gap-6 min-h-[220px] rounded-3xl border border-border shadow-sm`}
              >
                <div className="flex items-start justify-between">
                  <div
                    className={`w-10 h-10 rounded-2xl border flex items-center justify-center ${
                      accent
                        ? "border-cyan bg-cyan/10"
                        : "border-border bg-surface-3"
                    }`}
                  >
                    <Icon
                      size={18}
                      strokeWidth={1.5}
                      className={accent ? "text-cyan" : "text-muted-foreground"}
                    />
                  </div>
                  <span className="font-mono text-[9px] tracking-widest uppercase text-muted">
                    {label}
                  </span>
                </div>

                <div>
                  <h3
                    className={`font-mono text-sm font-bold mb-1.5 ${
                      accent ? "text-cyan" : "text-foreground"
                    }`}
                  >
                    {title}
                  </h3>
                  <p className="text-muted-foreground text-xs leading-relaxed">{body}</p>
                </div>
              </div>
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
