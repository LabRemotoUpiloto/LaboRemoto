import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Download, ArrowRight } from "lucide-react";
import gsap from "gsap";
import TerminalWindow from "../../ui/terminal";

const ASCII_LOGO = `
██╗       █████╗  ██████╗   ██████╗  ██████╗   █████╗  ████████╗  ██████╗  ██████╗  ██╗  ██████╗ 
██║      ██╔══██╗ ██╔══██╗ ██╔═══██╗ ██╔══██╗ ██╔══██╗ ╚══██╔══╝ ██╔═══██╗ ██╔══██╗ ██║ ██╔═══██╗
██║      ███████║ ██████╔╝ ██║   ██║ ██████╔╝ ███████║    ██║    ██║   ██║ ██████╔╝ ██║ ██║   ██║
██║      ██╔══██║ ██╔══██╗ ██║   ██║ ██╔══██╗ ██╔══██║    ██║    ██║   ██║ ██╔══██╗ ██║ ██║   ██║
███████╗ ██║  ██║ ██████╔╝ ╚██████╔╝ ██║  ██║ ██║  ██║    ██║    ╚██████╔╝ ██║  ██║ ██║ ╚██████╔╝
╚══════╝ ╚═╝  ╚═╝ ╚═════╝   ╚═════╝  ╚═╝  ╚═╝ ╚═╝  ╚═╝    ╚═╝     ╚═════╝  ╚═╝  ╚═╝ ╚═╝  ╚═════╝ 

██████╗  ███████╗ ███╗   ███╗   ██████╗  ████████╗  ██████╗ 
██╔══██╗ ██╔════╝ ████╗ ████║  ██╔═══██╗ ╚══██╔══╝ ██╔═══██╗
██████╔╝ █████╗   ██╔████╔██║  ██║   ██║    ██║    ██║   ██║
██╔══██╗ ██╔══╝   ██║╚██╔╝██║  ██║   ██║    ██║    ██║   ██║
██║  ██║ ███████╗ ██║ ╚═╝ ██║  ╚██████╔╝    ██║    ╚██████╔╝
╚═╝  ╚═╝ ╚══════╝ ╚═╝     ╚═╝   ╚═════╝     ╚═╝     ╚═════╝ 
`.trim();

export default function HeroSection() {
  const heroRef     = useRef<HTMLDivElement>(null);
  const asciiRef    = useRef<HTMLPreElement>(null);
  const splitRef    = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

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

  return (
    <section
      ref={heroRef}
      className="relative min-h-screen flex flex-col justify-center pt-24 pb-20 overflow-hidden"
    >
      <div className="relative max-w-6xl mx-auto px-6 w-full">
        {/* ASCII wordmark */}
        <pre
          ref={asciiRef}
          className="text-[5px] sm:text-[6.5px] md:text-[8px] leading-tight mb-14 select-none overflow-x-auto"
          style={{ opacity: 0, fontFamily: '"Courier New", Courier, monospace' }}
          aria-hidden="true"
        >
          {ASCII_LOGO}
        </pre>

        {/* Split: copy left, terminal right */}
        <div
          ref={splitRef}
          style={{ opacity: 0 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center"
        >
          {/* Left */}
          <div className="space-y-8">
            <div className="space-y-5">
              <p className="text-muted-foreground text-base leading-relaxed max-w-sm">
                Plataforma de laboratorio remoto para estudiantes, profesores y
                laboratoristas. Conexión real, prácticas reales — desde cualquier lugar.
              </p>
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
  );
}
