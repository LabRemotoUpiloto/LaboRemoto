import { Link } from "react-router-dom";

const ASCII_LOGO = `
 ██████╗██╗     ██╗███████╗███╗   ██╗████████╗███████╗
██╔════╝██║     ██║██╔════╝████╗  ██║╚══██╔══╝██╔════╝
██║     ██║     ██║█████╗  ██╔██╗ ██║   ██║   █████╗  
██║     ██║     ██║██╔══╝  ██║╚██╗██║   ██║   ██╔══╝  
╚██████╗███████╗██║███████╗██║ ╚████║   ██║   ███████╗
 ╚═════╝╚══════╝╚═╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝
`.trim();

const TERMINAL_LINES = [
  { delay: 0,    text: "$ ./cliente-rust --init",        type: "cmd" },
  { delay: 700,  text: "▶ Cargando módulos de peaje…",   type: "info" },
  { delay: 1400, text: "▶ Iniciando conexión Free Flow…", type: "info" },
  { delay: 2100, text: "✓ Base de datos sincronizada",    type: "ok" },
  { delay: 2800, text: "✓ Módulo de PQR activo",          type: "ok" },
  { delay: 3500, text: "✓ Sistema listo — v1.0.0",        type: "ok" },
];

import { useState, useEffect } from "react";
import { Download } from "lucide-react";

function Terminal() {
  const [lines, setLines] = useState<number[]>([]);

  useEffect(() => {
    const timers = TERMINAL_LINES.map((l, i) =>
      setTimeout(() => setLines((p) => [...p, i]), l.delay)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="w-full max-w-md border border-border bg-surface font-mono text-xs">
      {/* title bar */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border bg-surface-2">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
        <span className="ml-2 text-muted tracking-widest uppercase text-[10px]">bash</span>
      </div>
      {/* body */}
      <div className="p-5 space-y-1.5 min-h-[180px]">
        {TERMINAL_LINES.map((l, i) =>
          lines.includes(i) ? (
            <div key={i} className="animate-fade-in leading-relaxed">
              {l.type === "cmd"  && <span className="text-foreground">{l.text}</span>}
              {l.type === "info" && <span className="text-muted-foreground">{l.text}</span>}
              {l.type === "ok"   && <span style={{ color: "#3fb950" }}>{l.text}</span>}
            </div>
          ) : null
        )}
        {lines.length === TERMINAL_LINES.length && (
          <span className="inline-block w-2 h-4 bg-foreground/80 animate-blink" />
        )}
      </div>
    </div>
  );
}

export default function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col justify-center pt-24 pb-16 overflow-hidden">
      {/* subtle grid only */}
      <div className="absolute inset-0 grid-bg pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-6 w-full">

        {/* ASCII wordmark — skills.sh style */}
        <pre
          className="font-mono text-[6px] sm:text-[8px] md:text-[10px] leading-tight mb-16 select-none overflow-x-auto"
          style={{ color: "#ce422b", opacity: 0.85 }}
          aria-hidden="true"
        >
          {ASCII_LOGO}
        </pre>

        {/* Split: description left, terminal right */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">

          {/* Left */}
          <div className="space-y-10">
            <div className="space-y-5">
              <p className="text-muted-foreground text-base leading-relaxed max-w-sm">
                Sistema de gestión de peajes electrónicos construido en{" "}
                <span style={{ color: "#ce422b" }}>Rust</span>.{" "}
                Rendimiento máximo, cero garbage collector, integración completa con Free Flow.
              </p>
              <div className="flex items-center gap-6 text-[11px] font-mono text-muted tracking-widest uppercase">
                <span>100% Rust</span>
                <span className="w-px h-3 bg-border" />
                <span>Free Flow</span>
                <span className="w-px h-3 bg-border" />
                <span>v1.0.0</span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Link
                to="/descargar"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-foreground text-background font-mono text-xs font-bold tracking-widest uppercase hover:bg-white transition-colors"
              >
                <Download size={13} />
                Descargar
              </Link>
              <a
                href="#caracteristicas"
                className="font-mono text-xs text-muted-foreground hover:text-foreground tracking-widest uppercase transition-colors"
              >
                Ver más →
              </a>
            </div>
          </div>

          {/* Right — terminal */}
          <div>
            <Terminal />
          </div>
        </div>

        {/* Feature strip — horizontal, editorial */}
        <div
          id="caracteristicas"
          className="mt-24 pt-10 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-0"
        >
          {[
            { num: "01", title: "Alto Rendimiento", body: "Motor en Rust. Velocidad y seguridad de memoria garantizadas sin GC." },
            { num: "02", title: "Seguro por Diseño", body: "Sin race conditions. Confiabilidad máxima en producción crítica." },
            { num: "03", title: "Free Flow", body: "Integración con cobro electrónico y gestión completa de PQR." },
          ].map(({ num, title, body }) => (
            <div
              key={num}
              className="py-8 pr-8 border-b md:border-b-0 md:border-r border-border last:border-r-0 last:border-b-0"
            >
              <span className="font-mono text-[10px] text-muted tracking-widest uppercase mb-4 block">
                {num}
              </span>
              <h3 className="font-mono text-sm font-bold text-foreground mb-2">{title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
